"""Adapter from Ultralytics pose/product results to shelf interaction candidates."""
from shelf_actions import ShopperPose, Product, ShelfActions


def poses_from_result(result, decisions):
    if result.boxes is None or result.boxes.id is None or result.keypoints is None:
        return []
    data = result.keypoints.data.cpu().tolist()
    boxes = result.boxes.xyxy.cpu().tolist()
    ids = result.boxes.id.int().cpu().tolist()
    if len(data)!=len(ids):
        raise RuntimeError('Pose rows do not match person tracks')
    people = []
    for tid,box,points in zip(ids,boxes,data):
        d = decisions.get(tid)
        cid = d.customer_id if d and d.status=='ACTIVE' else None
        wrists = {name:tuple(points[index]) for name,index in [('left',9),('right',10)]
                  if len(points)>index and len(points[index])==3}
        people.append(ShopperPose(tid,cid,tuple(box),wrists))
    return people


class ShelfRuntime:
    def __init__(self, weights, tracker, device, imgsz=640, confidence=0.45, roi=None):
        from ultralytics import YOLO
        self.model = YOLO(weights)
        if self.model.task!='detect':
            raise ValueError('Product weights must be a detection model')
        self.tracker,self.device,self.imgsz,self.confidence = tracker,device,imgsz,confidence
        self.roi = roi
        self.actions = ShelfActions()
        self.shape = None

    def set_roi(self,roi):
        if roi is not None and not (0<=roi[0]<roi[2]<=1 and 0<=roi[1]<roi[3]<=1):
            raise ValueError('Shelf ROI must be normalized x1 y1 x2 y2 in [0,1]')
        self.roi = roi
        self.shape = None

    def update(self,frame,pose_result,decisions,now):
        h,w = frame.shape[:2]
        if self.shape!=(h,w):
            box = tuple(v*(w if i%2==0 else h) for i,v in enumerate(self.roi)) if self.roi else None
            self.actions = ShelfActions(box)
            self.shape = (h,w)
        result = self.model.track(frame,persist=True,tracker=self.tracker,device=self.device,
                                  imgsz=self.imgsz,conf=self.confidence,verbose=False)[0]
        products = []
        if result.boxes is not None and result.boxes.id is not None:
            for tid,cls,conf,box in zip(result.boxes.id.int().cpu().tolist(),result.boxes.cls.int().cpu().tolist(),
                                        result.boxes.conf.cpu().tolist(),result.boxes.xyxy.cpu().tolist()):
                products.append(Product(tid,cls,self.model.names[cls],tuple(box),conf))
        observations,events = self.actions.update(products,poses_from_result(pose_result,decisions),now)
        return observations,events

    def draw(self,frame,observations):
        import cv2
        if self.actions.shelf_box:
            a,b,c,d = map(int,self.actions.shelf_box)
            cv2.rectangle(frame,(a,b),(c,d),(255,180,50),2)
            cv2.putText(frame,'SHELF',(a,max(95,b-8)),cv2.FONT_HERSHEY_SIMPLEX,0.6,(255,180,50),2)
        for item in observations:
            a,b,c,d = map(int,item['box'])
            color = (40,230,230) if item['customer_id'] else (210,160,60)
            label = f"{item['name']} #{item['product_track']}"
            detail = ''
            if item['customer_id']:
                short = {'NEAR_PRODUCT':'NEAR','MOVING_WITH_HAND':'MOVING',
                         'POSSIBLE_TAKE':'POSSIBLE TAKE','POSSIBLE_RETURN':'POSSIBLE RETURN'}
                detail = f"{item['customer_id']} | {short.get(item['status'],item['status'])}"
            elif item['status'] in ('AMBIGUOUS_HAND','WAIT_CUSTOMER_ID'):
                detail = 'CHECK PERSON'
            cv2.rectangle(frame,(a,b),(c,d),color,2)
            for i,text in enumerate([label,detail] if detail else [label]):
                (tw,th),_ = cv2.getTextSize(text,cv2.FONT_HERSHEY_SIMPLEX,0.5,1)
                x = max(0,min(a,frame.shape[1]-tw-6))
                y = min(frame.shape[0]-8,max(165,b+20)+i*22)
                cv2.rectangle(frame,(x,y-th-3),(x+tw+5,y+3),(25,25,25),-1)
                cv2.putText(frame,text,(x,y),cv2.FONT_HERSHEY_SIMPLEX,0.5,color,1)
        return frame
