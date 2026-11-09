import express from 'express';
import store from '../db/store.js';
import { emitRealtime } from '../services/cartService.js';

const router = express.Router();

// List shelf slots with product details
router.get('/', (req, res) => {
  const shelvesWithProducts = store.data.shelfSlots.map((slot) => {
    const product = store.data.products.find((p) => p._id === slot.product_id) || null;
    const unitWeight = product ? product.weight_per_unit : slot.expected_unit_weight || 100;
    const estimatedQuantity = unitWeight > 0 ? Math.round(slot.current_total_weight / unitWeight) : 0;

    return {
      ...slot,
      product,
      estimated_quantity: estimatedQuantity
    };
  });

  res.json({ success: true, data: shelvesWithProducts });
});

// Create new shelf slot
router.post('/', (req, res) => {
  const { slot_id, product_id, current_total_weight, expected_unit_weight } = req.body;
  if (!slot_id || !product_id) {
    return res.status(400).json({ success: false, message: 'Thiếu slot_id hoặc product_id' });
  }

  const existing = store.data.shelfSlots.find((s) => s.slot_id === slot_id);
  if (existing) {
    return res.status(400).json({ success: false, message: `Mã slot ${slot_id} đã tồn tại` });
  }

  const product = store.data.products.find((p) => p._id === product_id);
  const unitWeight = Number(expected_unit_weight) || (product ? product.weight_per_unit : 100);

  const newSlot = {
    _id: 'slot_' + Date.now().toString(36),
    slot_id: slot_id.toUpperCase(),
    product_id,
    current_total_weight: Number(current_total_weight) || unitWeight * 10,
    expected_unit_weight: unitWeight,
    status: 'Active',
    last_updated: new Date().toISOString()
  };

  store.data.shelfSlots.push(newSlot);
  store.saveData();

  emitRealtime('shelf_updated', { slot: newSlot, product });
  res.status(201).json({ success: true, data: newSlot });
});

// Update shelf slot mapping / weight
router.put('/:id', (req, res) => {
  const index = store.data.shelfSlots.findIndex((s) => s._id === req.params.id || s.slot_id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy kệ/slot' });
  }

  const slot = store.data.shelfSlots[index];
  if (req.body.product_id) slot.product_id = req.body.product_id;
  if (req.body.slot_id) slot.slot_id = req.body.slot_id.toUpperCase();
  if (req.body.current_total_weight !== undefined) slot.current_total_weight = Number(req.body.current_total_weight);
  if (req.body.expected_unit_weight !== undefined) slot.expected_unit_weight = Number(req.body.expected_unit_weight);
  if (req.body.status) slot.status = req.body.status;

  slot.last_updated = new Date().toISOString();
  store.saveData();

  const product = store.data.products.find((p) => p._id === slot.product_id);
  emitRealtime('shelf_updated', { slot, product });

  res.json({ success: true, data: slot });
});

// Restock a slot
router.post('/:id/restock', (req, res) => {
  const slot = store.data.shelfSlots.find((s) => s._id === req.params.id || s.slot_id === req.params.id);
  if (!slot) return res.status(404).json({ success: false, message: 'Không tìm thấy kệ/slot' });

  const product = store.data.products.find((p) => p._id === slot.product_id);
  const units = Number(req.body.units) || 10;
  const unitWeight = product ? product.weight_per_unit : slot.expected_unit_weight || 100;

  slot.current_total_weight = unitWeight * units;
  slot.status = 'Active';
  slot.last_updated = new Date().toISOString();

  store.saveData();

  emitRealtime('shelf_updated', { slot, product });
  res.json({ success: true, message: `Đã bổ sung ${units} sản phẩm vào slot ${slot.slot_id}`, data: slot });
});

// Delete slot
router.delete('/:id', (req, res) => {
  const index = store.data.shelfSlots.findIndex((s) => s._id === req.params.id || s.slot_id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, message: 'Không tìm thấy kệ/slot' });

  const deleted = store.data.shelfSlots.splice(index, 1);
  store.saveData();

  res.json({ success: true, message: 'Đã xóa slot', data: deleted[0] });
});

export default router;
