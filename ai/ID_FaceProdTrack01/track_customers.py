"""New multi-customer camera app. Run with --help for camera/replay options."""
import argparse
from dataclasses import asdict
from datetime import datetime
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parent
# Reuse installed libraries and model weights, never the old application code.
sys.path.insert(0, str(ROOT / '.deps'))
from customer_identity import Person
from face_customer_identity import FaceCustomerManager


def open_capture(source, backend='auto'):
    """Check actual camera frames, not just whether its driver opens."""
    import cv2
    live = isinstance(source, int)
    backends = {'dshow': cv2.CAP_DSHOW, 'msmf': cv2.CAP_MSMF}
    attempts = [backends[backend]] if backend != 'auto' else [cv2.CAP_DSHOW, cv2.CAP_MSMF]
    if not live:
        attempts = [cv2.CAP_ANY]
    for api in attempts:
        cap = cv2.VideoCapture(source, api)
        if not cap.isOpened():
            cap.release()
            continue
        # Virtual cameras may open successfully while supplying black frames.
        for _ in range(3 if live else 1):
            ok, frame = cap.read()
            if ok and frame is not None and frame.size and (not live or frame.max() > 3):
                return cap, frame, api
        cap.release()
    if live:
        raise RuntimeError(
            f'Camera {source} has no usable image (no frames or black frames). '
            'Check the live picture in Camo, reconnect the phone, and close other camera apps. '
            'If your camera has another index, run run_customers.cmd --source 1.')
    raise RuntimeError(f'Cannot read video: {source}')


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source', default='0', help='Camera number or local video path')
    p.add_argument('--backend', choices=('auto', 'dshow', 'msmf'), default='auto')
    p.add_argument('--device', default='auto', help='auto, cpu, or CUDA device number such as 0')
    p.add_argument('--weights', default=r'C:\yolo_shelf\yolo11n.pt')
    p.add_argument('--shelf', action='store_true', help='Enable pose, products and interaction candidates')
    p.add_argument('--pose-weights', default=r'C:\yolo_shelf\yolo11n-pose.pt')
    p.add_argument('--product-weights', default=r'C:\yolo_shelf\runs\vnproducts\coca_v3_30\weights\best.pt')
    p.add_argument('--product-imgsz', type=int, default=960,
                   help='Product inference size, independent of person pose; try 1280 for distant items')
    p.add_argument('--shelf-roi', nargs=4, type=float, metavar=('X1','Y1','X2','Y2'),
                   help='Shelf rectangle normalized to 0..1; alternatively press S in the window')
    p.add_argument('--reid', default=str(ROOT / 'yolo26n-reid.onnx'))
    p.add_argument('--imgsz', type=int, default=640)
    p.add_argument('--stable-seconds', type=float, default=0.6)
    p.add_argument('--min-frames', type=int, default=5)
    p.add_argument('--face-threshold', type=float, default=0.45)
    p.add_argument('--face-new-threshold', type=float, default=0.30)
    p.add_argument('--face-margin', type=float, default=0.10)
    p.add_argument('--headless', action='store_true')
    p.add_argument('--max-frames', type=int, default=0)
    p.add_argument('--output', default=str(ROOT / 'customer_runs'))
    p.add_argument('--preview-out', help='Save the last annotated image')
    return p.parse_args()


def main():
    args = parse_args()
    # Import expensive camera/model libraries only after parsing --help.
    import cv2
    import numpy as np
    import torch
    from ultralytics import YOLO
    from ultralytics.trackers.utils.reid import ReID
    from face_features import FaceFeatures

    person_weights = args.pose_weights if args.shelf else args.weights
    paths = [person_weights,args.reid] + ([args.product_weights] if args.shelf else [])
    for filename in paths:
        if not Path(filename).is_file():
            raise FileNotFoundError(f'Model missing: {filename}')
    device = ('0' if torch.cuda.is_available() else 'cpu') if args.device == 'auto' else args.device
    reid_device = f'cuda:{device}' if device.isdecimal() else device
    source = int(args.source) if args.source.isdecimal() else args.source
    live = isinstance(source, int)
    cap, first_frame, camera_api = open_capture(source, args.backend)

    log, annotated = None, None
    frame_count, active_frames = 0, 0
    started = time.perf_counter()
    try:
        model = YOLO(person_weights)
        if args.shelf and model.task!='pose':
            raise ValueError('Use a pose model for --pose-weights')
        encoder = ReID(args.reid, device=reid_device)
        face_encoder = FaceFeatures()
        shelf = None
        if args.shelf:
            from shelf_runtime import ShelfRuntime
            if args.product_imgsz<32:
                raise ValueError('--product-imgsz must be at least 32')
            shelf = ShelfRuntime(args.product_weights,str(ROOT/'customer_tracker.yaml'),device,args.product_imgsz)
            shelf.set_roi(args.shelf_roi)
        started = time.perf_counter()
        fps_source = cap.get(cv2.CAP_PROP_FPS)
        fps_source = fps_source if np.isfinite(fps_source) and fps_source > 0 else 20.0
        folder = Path(args.output) / datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        folder.mkdir(parents=True, exist_ok=True)
        log = (folder / 'events.jsonl').open('w', encoding='utf-8')

        def emit(event):
            log.write(json.dumps(event, ensure_ascii=False) + '\n')
            log.flush()

        manager = FaceCustomerManager(
            stable_seconds=args.stable_seconds, min_frames=args.min_frames,
            face_threshold=args.face_threshold, new_threshold=args.face_new_threshold,
            margin=args.face_margin, event_sink=emit)
        version = 'v5 FACE + POSE + PRODUCTS' if shelf else 'v4 FACE'
        emit(dict(event='start', version=version, run_id=manager.run_id,
                  config=vars(args), device=device, camera_backend=camera_api))
        if shelf:
            emit(dict(event='product_classes',names=shelf.model.names))
        session = getattr(encoder.model, 'session', None)
        if session:
            emit(dict(event='reid_backend', providers=session.get_providers()))
        print(f'{version} | Look at camera briefly on entry/return. Q/Esc: quit')
        if shelf:
            print('S: select shelf area. Actions are candidates, not confirmed purchases.')
        print(f'ID event log: {folder}')
        last_wall = time.perf_counter()
        black_frames = 0
        last_action, last_action_time = '', -1e9
        window = 'Customer IDs + Pose + Products' if shelf else 'Customer IDs - New'
        while True:
            if first_frame is not None:
                ok, raw, first_frame = True, first_frame, None
            else:
                ok, raw = cap.read()
            if not ok:
                if live or frame_count == 0:
                    raise RuntimeError('Camera stopped sending images. Check camera connection and restart.')
                break
            black_frames = black_frames + 1 if live and raw.max() <= 3 else 0
            if black_frames >= 5:
                raise RuntimeError('Camera is sending black images. Check the live picture in Camo and reconnect.')
            now = time.perf_counter()-started if live else frame_count/fps_source
            result = model.track(raw, persist=True, classes=[0], conf=0.25, imgsz=args.imgsz,
                                 tracker=str(ROOT / 'customer_tracker.yaml'), device=device, verbose=False)[0]
            people = []
            if result.boxes is not None and result.boxes.id is not None:
                boxes = result.boxes.xyxy.cpu().numpy()
                features = encoder(raw, result.boxes.xywh.cpu().numpy())
                if len(features) != len(boxes):
                    raise RuntimeError('ReID feature count does not match detections')
                for track, box, feature, confidence in zip(result.boxes.id.int().cpu().tolist(), boxes,
                                                           features, result.boxes.conf.cpu().tolist()):
                    quality = bool(box[2]-box[0] >= 40 and box[3]-box[1] >= 90)
                    people.append(Person(track, tuple(float(v) for v in box), feature, confidence, quality))
            face_boxes = face_encoder.assign(raw, people)
            decisions = manager.update(people, now)
            interactions,action_events = shelf.update(raw,result,decisions,now) if shelf else ([],[])
            for event in action_events:
                emit(dict(run_id=manager.run_id,**event))
                last_action = f"{event['customer_id']} {event['action']} {event['name']}"
                last_action_time = now
            frame_count += 1
            active_count = sum(d.customer_id is not None for d in decisions.values())
            active_frames += int(active_count > 0)
            # This record is the integration point for later shelf-action code:
            # join by run_id + customer_id only when status is ACTIVE.
            emit(dict(event='frame', run_id=manager.run_id, frame=frame_count, time=now,
                      interactions=interactions,
                      people=[dict(track=p.track, box=p.box, confidence=p.confidence, quality=p.quality,
                                   face_visible=p.face_feature is not None,
                                   **asdict(decisions[p.track])) for p in people]))
            annotated = result.plot(boxes=False) if shelf else raw.copy()
            if shelf:
                shelf.draw(annotated,interactions)
            for _, face_box in face_boxes:
                fx,fy,fw,fh = map(int,face_box)
                cv2.rectangle(annotated,(fx,fy),(fx+fw,fy+fh),(255,220,0),1)
            for p in people:
                d = decisions[p.track]
                if d.customer_id:
                    number = int(d.customer_id[1:])
                    color = (70+(number*53)%170, 70+(number*97)%170, 70+(number*139)%170)
                else:
                    color = (0, 180, 255)
                x1, y1, x2, y2 = map(int, p.box)
                status = 'LOOK AT CAMERA' if d.status == 'WAIT_FACE' else d.status
                label = f'{d.customer_id or status} | Track {p.track}'
                evidence = manager.pending.get(p.track)
                if d.status == 'PENDING' and evidence:
                    label += f' | {evidence.frames} frames / {now-evidence.since:.1f}s'
                if d.status == 'UNCERTAIN' and d.score is not None:
                    label += f' | match {d.score:.2f}'
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                label_y = max(150 if shelf else 85, y1-8)
                if shelf:
                    (tw,th),_ = cv2.getTextSize(label,cv2.FONT_HERSHEY_SIMPLEX,0.65,2)
                    cv2.rectangle(annotated,(max(0,x1),label_y-th-5),(max(0,x1)+tw+5,label_y+5),(25,25,25),-1)
                cv2.putText(annotated, label, (max(0, x1), label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
            wall = time.perf_counter()
            fps = 1/max(wall-last_wall, 1e-6)
            last_wall = wall
            lines = [f'{"v5 SHELF" if shelf else "v4 FACE"} | People: {len(people)} | Assigned: {active_count} | Customers: {len(manager.customers)} | FPS: {fps:.1f}',
                     'Look at camera for 1 second on first entry and return',
                     'S: select shelf | Q / Esc: quit' if shelf else 'Q / Esc: quit']
            if shelf:
                lines.append(f'Products: {len(interactions)} | Actions are candidates only')
                if shelf.roi is None:
                    lines.append('Select shelf with S for possible TAKE / RETURN')
                elif now-last_action_time<4:
                    lines.append(last_action)
            cv2.rectangle(annotated, (0, 0), (annotated.shape[1], 24*len(lines)+4), (25, 25, 25), -1)
            for i, line in enumerate(lines):
                cv2.putText(annotated, line, (12, 22+i*23), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,255), 2)
            key = -1
            if not args.headless:
                h, w = annotated.shape[:2]
                scale = min(1.0, 1280/w, 800/h)
                cv2.imshow(window, cv2.resize(annotated, None, fx=scale, fy=scale))
                key = cv2.waitKey(1) & 0xff
            if key in (ord('q'), ord('Q'), 27):
                break
            if shelf and key in (ord('s'),ord('S')):
                preview = cv2.resize(raw,None,fx=scale,fy=scale)
                selection = cv2.selectROI('Select shelf - Enter to accept',preview,showCrosshair=True,fromCenter=False)
                cv2.destroyWindow('Select shelf - Enter to accept')
                x,y,rw,rh = selection
                if rw>0 and rh>0:
                    ph,pw = preview.shape[:2]
                    shelf.set_roi((x/pw,y/ph,(x+rw)/pw,(y+rh)/ph))
                    last_action = ''
                    emit(dict(event='shelf_selected',time=now,roi=shelf.roi))
            if args.max_frames > 0 and frame_count >= args.max_frames:
                break
        if args.preview_out and annotated is not None:
            if not cv2.imwrite(args.preview_out, annotated):
                raise RuntimeError(f'Cannot save preview: {args.preview_out}')
        summary = dict(event='summary', frames=frame_count, active_frames=active_frames,
                       customers=len(manager.customers), run_id=manager.run_id)
        emit(summary)
        print(json.dumps(summary))
    finally:
        cap.release()
        if not args.headless:
            cv2.destroyAllWindows()
        if log:
            log.close()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, FileNotFoundError, ValueError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
