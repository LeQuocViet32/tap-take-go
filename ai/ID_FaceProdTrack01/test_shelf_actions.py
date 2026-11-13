import unittest
from types import SimpleNamespace
from customer_identity import Assignment
from shelf_runtime import poses_from_result
from shelf_actions import Product, ShopperPose, ShelfActions


def product(x=50, tid=1, sku=150):
    return Product(tid,sku,'sample_sku',(x-10,80,x+10,100),0.95)


def shopper(x=50,y=90,cid='C001',tid=1,confidence=0.95):
    return ShopperPose(tid,cid,(1,1,300,300),{'left':(x,y,confidence)})


class ActionTests(unittest.TestCase):
    def setUp(self):
        self.m = ShelfActions((10,10,100,160))

    def shelf_observation(self):
        for i in range(6):
            self.m.update([product()],[shopper()],i*0.1)

    def take(self):
        self.shelf_observation()
        events = []
        for i,x in enumerate((70,90,110,130)):
            _,e = self.m.update([product(x)],[shopper(x)],0.6+i*0.1)
            events += e
        return events

    def test_hand_proximity_is_not_take(self):
        self.shelf_observation()
        observations,events = self.m.update([product()],[shopper()],0.7)
        self.assertEqual(observations[0]['status'],'NEAR_PRODUCT')
        self.assertEqual(events,[])

    def test_take_requires_shelf_exit_and_matching_hand_motion(self):
        events = self.take()
        self.assertEqual(len(events),1)
        self.assertEqual(events[0]['action'],'POSSIBLE_TAKE')
        self.assertEqual(events[0]['customer_id'],'C001')
        self.assertEqual(events[0]['sku'],150)
        self.assertIs(events[0]['confirmed'],False)

    def test_holding_outside_does_not_repeat_take(self):
        self.take()
        for i in range(10):
            _,events = self.m.update([product(130)],[shopper(130)],1+i*0.1)
            self.assertFalse(events)


    def test_return_requires_same_owner_stationary_product_and_visible_release(self):
        self.take()
        for i,x in enumerate((90,70,50)):
            self.m.update([product(x)],[shopper(x)],1.2+i*0.1)
        events = []
        for i in range(12):
            _,e = self.m.update([product()],[shopper(270,270)],1.5+i*0.1)
            events += e
        self.assertEqual(len(events),1)
        self.assertEqual(events[0]['action'],'POSSIBLE_RETURN')
        self.assertEqual(events[0]['customer_id'],'C001')

    def test_no_roi_no_take_or_return(self):
        self.m = ShelfActions()
        self.assertEqual(self.take(),[])

    def test_product_disappearance_is_not_take(self):
        self.shelf_observation()
        _,events = self.m.update([],[shopper()],0.6)
        self.assertFalse(events)
        self.assertFalse(self.m.states)

    def test_missing_customer_id_never_assigns_action(self):
        obs,events = self.m.update([product()],[shopper(cid=None)],0)
        self.assertEqual(obs[0]['status'],'WAIT_CUSTOMER_ID')
        self.assertIsNone(obs[0]['customer_id'])
        self.assertFalse(events)

    def test_unknown_person_is_included_in_hand_competition(self):
        obs,_ = self.m.update([product()],[shopper(90),shopper(50,cid=None,tid=2)],0)
        self.assertEqual(obs[0]['status'],'WAIT_CUSTOMER_ID')

    def test_two_people_near_same_product_are_ambiguous(self):
        obs,events = self.m.update([product()],[shopper(),shopper(cid='C002',tid=2)],0)
        self.assertEqual(obs[0]['status'],'AMBIGUOUS_HAND')
        self.assertIsNone(obs[0]['customer_id'])
        self.assertFalse(events)

    def test_missing_or_low_confidence_wrists_do_not_count(self):
        obs,_ = self.m.update([product()],[shopper(confidence=0.1)],0)
        self.assertEqual(obs[0]['status'],'NO_HAND')

    def test_two_hands_of_same_person_are_not_two_people(self):
        person = shopper()
        person.wrists['right'] = (50,90,0.9)
        obs,_ = self.m.update([product()],[person],0)
        self.assertEqual(obs[0]['customer_id'],'C001')

    def test_class_change_resets_action_evidence(self):
        self.shelf_observation()
        events = []
        for i,x in enumerate((70,90,110,130)):
            _,e = self.m.update([product(x,sku=151)],[shopper(x)],0.6+i*0.1)
            events += e
        self.assertFalse(events)

    def test_track_change_does_not_inherit_other_product(self):
        self.shelf_observation()
        events = []
        for i,x in enumerate((70,90,110,130)):
            _,e = self.m.update([product(x,tid=9)],[shopper(x)],0.6+i*0.1)
            events += e
        self.assertFalse(events)

    def test_stationary_hand_does_not_explain_moving_product(self):
        self.shelf_observation()
        events = []
        for i,x in enumerate((70,90,110,130)):
            _,e = self.m.update([product(x)],[shopper(50)],0.6+i*0.1)
            events += e
        self.assertFalse(events)

    def test_lost_wrist_is_not_release(self):
        self.take()
        for i,x in enumerate((90,70,50)):
            self.m.update([product(x)],[shopper(x)],1.2+i*0.1)
        for i in range(12):
            _,events = self.m.update([product()],[shopper(confidence=0.1)],1.5+i*0.1)
            self.assertFalse(events)

    def test_different_person_cannot_return_original_owners_item(self):
        self.take()
        for i,x in enumerate((90,70,50)):
            self.m.update([product(x)],[shopper(x,cid='C002',tid=2)],1.2+i*0.1)
        for i in range(12):
            _,events = self.m.update([product()],[shopper(270,270,cid='C002',tid=2)],1.5+i*0.1)
            self.assertFalse(events)


class Rows:
    def __init__(self,values):
        self.values = values
    def cpu(self):
        return self
    def int(self):
        return self
    def tolist(self):
        return self.values


class PoseMappingTests(unittest.TestCase):
    def result(self):
        first = [[0,0,0] for _ in range(17)]
        second = [[0,0,0] for _ in range(17)]
        first[9],second[9] = [350,90,0.9],[50,90,0.9]
        return SimpleNamespace(boxes=SimpleNamespace(id=Rows([9,1]),xyxy=Rows([(300,1,500,300),(1,1,200,300)])),
                               keypoints=SimpleNamespace(data=Rows([first,second])))

    def test_pose_rows_map_by_track_not_customer_order(self):
        p = poses_from_result(self.result(),{1:Assignment('ACTIVE','C001'),9:Assignment('ACTIVE','C002')})
        self.assertEqual((p[0].customer_id,p[0].wrists['left'][0]),('C002',350))
        self.assertEqual((p[1].customer_id,p[1].wrists['left'][0]),('C001',50))

    def test_unconfirmed_customer_cannot_own_actions(self):
        p = poses_from_result(self.result(),{1:Assignment('HOLD','C001'),9:Assignment('ACTIVE','C002')})
        self.assertIsNone(p[1].customer_id)

    def test_missing_tracks_yield_no_shoppers(self):
        result = self.result()
        result.boxes.id = None
        self.assertEqual(poses_from_result(result,{}),[])

    def test_mismatched_pose_rows_fail_explicitly(self):
        result = self.result()
        result.keypoints.data = Rows([])
        with self.assertRaises(RuntimeError):
            poses_from_result(result,{})


if __name__=='__main__':
    unittest.main()
