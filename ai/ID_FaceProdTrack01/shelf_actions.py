"""Temporal 2-D interaction candidates. These are NOT confirmed cart mutations."""
from collections import Counter, deque
from dataclasses import dataclass, field
import math
import uuid

from customer_identity import valid_box


@dataclass
class ShopperPose:
    track: int
    customer_id: object
    box: tuple
    wrists: dict  # left/right -> (x, y, confidence), only CURRENT observations


@dataclass
class Product:
    track: int
    sku: int
    name: str
    box: tuple
    confidence: float


@dataclass
class ProductState:
    sku: int
    last: float
    center: tuple
    still_since: float
    shelf_seen: bool = False
    phase: str = 'OBSERVED'
    owner: object = None
    hand_key: object = None
    history: deque = field(default_factory=lambda: deque(maxlen=20))
    return_owner_seen: bool = False
    released_since: object = None


def distance_to_box(point, box):
    x,y = point
    return math.hypot(max(box[0]-x,0,x-box[2]), max(box[1]-y,0,y-box[3]))


def usable_wrist(wrist):
    return (len(wrist)==3 and all(math.isfinite(v) for v in wrist)
            and wrist[2]>=0.5 and wrist[0]>0 and wrist[1]>0)


class ShelfActions:
    def __init__(self, shelf_box=None, max_gap=0.5):
        if shelf_box is not None and not valid_box(shelf_box):
            raise ValueError('Invalid shelf rectangle')
        self.shelf_box, self.max_gap = shelf_box, max_gap
        self.states = {}
        self.now = -math.inf

    def hand_match(self, product, shoppers):
        ranked = []
        for shopper in shoppers:
            if not valid_box(shopper.box):
                continue
            tolerance = min(80,max(20,0.07*(shopper.box[3]-shopper.box[1])))
            hands = [(distance_to_box(w[:2],product.box)/tolerance, side, w[:2])
                     for side,w in shopper.wrists.items() if usable_wrist(w)]
            if hands:
                distance,side,point = min(hands)
                if distance <= 1:
                    ranked.append((distance,shopper.track,side,point,shopper))
        ranked.sort(key=lambda x:(x[0],x[1]))
        if not ranked:
            return None,'NO_HAND'
        # Include unknown-ID people in competition; otherwise the nearest
        # registered shopper could inherit another person's interaction.
        if len(ranked)>1 and ranked[1][0]-ranked[0][0]<0.25:
            return None,'AMBIGUOUS_HAND'
        _,track,side,point,shopper = ranked[0]
        if not shopper.customer_id:
            return None,'WAIT_CUSTOMER_ID'
        return (shopper,side,point),'MATCH'

    def update(self, products, shoppers, now):
        if not math.isfinite(now) or now<=self.now:
            raise ValueError('Timestamps must strictly increase')
        self.now = now
        counts = Counter(p.track for p in products)
        current = {p.track:p for p in products}
        # A missed product is not evidence of removal. Discard the unfinished
        # action rather than joining evidence across an unseen interval.
        for tid in list(self.states):
            if tid not in current:
                del self.states[tid]
        observations,events = [],[]
        active = {p.customer_id:p for p in shoppers if p.customer_id}
        for tid,p in current.items():
            if counts[tid]!=1 or not valid_box(p.box) or p.confidence<0.45:
                self.states.pop(tid,None)
                continue
            cx,cy = (p.box[0]+p.box[2])/2,(p.box[1]+p.box[3])/2
            size = max(p.box[2]-p.box[0],p.box[3]-p.box[1])
            s = self.states.get(tid)
            if (s is None or s.sku!=p.sku or now-s.last>self.max_gap
                    or math.dist((cx,cy),s.center)>max(80,2*size)):
                s = self.states[tid] = ProductState(p.sku,now,(cx,cy),now)
            previous = s.center
            if math.dist((cx,cy),previous)>max(3,0.035*size):
                s.still_since = now
            s.last,s.center = now,(cx,cy)
            inside = False
            outside = False
            if self.shelf_box is not None:
                x1,y1,x2,y2 = self.shelf_box
                inside = x1<=cx<=x2 and y1<=cy<=y2
                pad = max(8,0.02*min(x2-x1,y2-y1))
                outside = cx<x1-pad or cx>x2+pad or cy<y1-pad or cy>y2+pad
            if inside and now-s.still_since>=0.4 and s.phase=='OBSERVED':
                s.shelf_seen = True
            match,reason = self.hand_match(p,shoppers)
            status,cid,side = reason,None,None
            moving = False
            if match:
                shopper,side,point = match
                cid = shopper.customer_id
                key = (cid,side)
                if s.hand_key!=key:
                    s.history.clear()
                s.hand_key = key
                s.history.append((now,(cx,cy),point))
                while s.history and now-s.history[0][0]>1.0:
                    s.history.popleft()
                status = 'NEAR_PRODUCT'
                if len(s.history)>=3 and now-s.history[0][0]>=0.2:
                    _,old_center,old_hand = s.history[0]
                    dp = (cx-old_center[0],cy-old_center[1])
                    dh = (point[0]-old_hand[0],point[1]-old_hand[1])
                    lp,lh = math.hypot(*dp),math.hypot(*dh)
                    scale = shopper.box[3]-shopper.box[1]
                    moving = (lp>=max(12,0.04*scale) and lh>=max(8,0.025*scale)
                              and (dp[0]*dh[0]+dp[1]*dh[1])/max(lp*lh,1)>0.6
                              and math.dist(dp,dh)<=max(25,0.10*scale))
                    if moving:
                        status = 'MOVING_WITH_HAND'
                if s.phase=='CARRIED' and cid!=s.owner:
                    # Transfers between customers need separate evidence.
                    s.phase,s.owner,s.shelf_seen = 'OBSERVED',None,False
                    s.return_owner_seen = False
                if s.phase=='CARRIED' and cid==s.owner and inside:
                    s.return_owner_seen = True
                s.released_since = None
            else:
                s.history.clear()
                s.hand_key = None
                if reason!='NO_HAND':
                    s.shelf_seen = False
                    s.return_owner_seen = False
                if s.phase=='CARRIED':
                    owner = active.get(s.owner)
                    visible_hand = owner is not None and any(usable_wrist(w) for w in owner.wrists.values())
                    if (inside and s.return_owner_seen and visible_hand and reason=='NO_HAND'
                            and now-s.still_since>=0.4):
                        if s.released_since is None:
                            s.released_since = now
                        if now-s.released_since>=0.3:
                            cid = s.owner
                            status = 'POSSIBLE_RETURN'
                            events.append(self.event(p,cid,status))
                            s.phase,s.owner,s.return_owner_seen = 'OBSERVED',None,False
                            s.shelf_seen = True
                    else:
                        s.released_since = None
            if s.phase=='OBSERVED' and s.shelf_seen and outside and moving and cid:
                status = 'POSSIBLE_TAKE'
                events.append(self.event(p,cid,status))
                s.phase,s.owner,s.shelf_seen = 'CARRIED',cid,False
                s.return_owner_seen = False
            observations.append(dict(product_track=tid,sku=p.sku,name=p.name,box=p.box,
                                     confidence=p.confidence,customer_id=cid,hand=side,status=status))
        return observations,events

    def event(self,p,cid,action):
        return dict(event='action_candidate',event_id=uuid.uuid4().hex,time=self.now,
                    customer_id=cid,product_track=p.track,sku=p.sku,name=p.name,
                    action=action,confirmed=False)
