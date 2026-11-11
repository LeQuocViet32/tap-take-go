import express from 'express';
import store from '../db/store.js';
import {
  emitRealtime,
  handleAbsoluteWeightReading,
  getLatestSensorReadings
} from '../services/cartService.js';

const router = express.Router();

// Receive real-time absolute weight reading from ESP32 + HX711 or USB Serial bridge
async function handleSensorReadingRequest(req, res) {
  const { slot_id, weight, grams, weight_grams, pcs, stable, user_id, auto_cart } = req.body || {};
  const resolvedSlotId = slot_id || 'KH1_1';
  const resolvedWeight = weight !== undefined ? weight : (grams !== undefined ? grams : weight_grams);

  if (resolvedWeight === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu trường weight (gram) từ cảm biến Loadcell!'
    });
  }

  const result = await handleAbsoluteWeightReading({
    slotId: resolvedSlotId,
    weight: resolvedWeight,
    pcs,
    stable,
    userId: user_id || null,
    autoCart: auto_cart !== false
  });

  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json(result);
}

router.post('/sensor-reading', handleSensorReadingRequest);
router.post('/weight', handleSensorReadingRequest);

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

  res.json({ 
    success: true, 
    data: shelvesWithProducts,
    sensorReadings: getLatestSensorReadings(),
    physicalShelves: store.data.physicalShelves || [
      {
        id: 'SHELF_01',
        name: 'Kệ Hàng Số 1 (Gian Trưng Bày Chính)',
        description: 'Kệ 3 tầng x 3 ô (9 vị trí cảm biến cân)',
        rows: 3,
        cols: 3
      }
    ]
  });
});

// Get physical shelves list
router.get('/physical', (req, res) => {
  if (!store.data.physicalShelves || store.data.physicalShelves.length === 0) {
    store.data.physicalShelves = [
      {
        id: 'SHELF_01',
        name: 'Kệ Hàng Số 1 (Gian Trưng Bày Chính)',
        description: 'Kệ 3 tầng x 3 ô (9 vị trí cảm biến cân)',
        rows: 3,
        cols: 3
      }
    ];
    store.saveData();
  }
  res.json({ success: true, data: store.data.physicalShelves });
});

// Add new physical shelf
router.post('/physical', (req, res) => {
  const { name, description, rows = 3, cols = 3 } = req.body;
  if (!store.data.physicalShelves) store.data.physicalShelves = [];

  const nextNum = store.data.physicalShelves.length + 1;
  const newShelf = {
    id: `SHELF_${String(nextNum).padStart(2, '0')}`,
    name: name || `Kệ Hàng Số ${nextNum}`,
    description: description || `Kệ ${rows} tầng x ${cols} ô (Ma trận cân)`,
    rows: Number(rows) || 3,
    cols: Number(cols) || 3,
    created_at: new Date().toISOString()
  };

  store.data.physicalShelves.push(newShelf);
  store.saveData();

  emitRealtime('shelf_updated', { type: 'physical_shelf_added', shelf: newShelf });
  res.status(201).json({ success: true, message: `Đã tạo ${newShelf.name}`, data: newShelf });
});

// Delete physical shelf
router.delete('/physical/:shelfId', (req, res) => {
  const { shelfId } = req.params;
  if (!store.data.physicalShelves || store.data.physicalShelves.length <= 1) {
    return res.status(400).json({ success: false, message: 'Phải duy trì ít nhất 1 kệ hàng vật lý trong hệ thống!' });
  }

  const shelfIndex = store.data.physicalShelves.findIndex((s) => s.id === shelfId);
  if (shelfIndex === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy kệ hàng vật lý' });
  }

  store.data.physicalShelves.splice(shelfIndex, 1);
  // Remove slots associated with this shelf
  store.data.shelfSlots = store.data.shelfSlots.filter((s) => s.shelf_id !== shelfId);
  store.saveData();

  emitRealtime('shelf_updated', { type: 'physical_shelf_deleted', shelfId });
  res.json({ success: true, message: `Đã xóa kệ hàng vật lý ${shelfId}` });
});

// Configure or upsert a specific slot in 3x3 matrix
router.post('/configure-slot', (req, res) => {
  const {
    shelf_id = 'SHELF_01',
    slot_number,
    slot_id,
    product_id,
    product_name,
    product_price,
    expected_unit_weight,
    current_total_weight
  } = req.body;

  if (!slot_id) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp mã Node cân (slot_id)!' });
  }

  const cleanSlotId = slot_id.trim().toUpperCase();
  const num = Number(slot_number) || 1;

  let unitWeight = Number(expected_unit_weight) || 48;
  let finalProductId = product_id;

  // Handle automatic product creation if custom product or direct name given
  if (!finalProductId || finalProductId === '__NEW_CUSTOM_PRODUCT__' || (product_name && product_name.trim())) {
    const prodName = (product_name && product_name.trim()) || `Sản phẩm mẫu ${cleanSlotId}`;
    let existingProd = store.data.products.find((p) => p.name.toLowerCase() === prodName.toLowerCase());
    if (!existingProd) {
      existingProd = {
        _id: 'prod_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
        sku: 'SKU-' + Date.now().toString().slice(-6),
        barcode: Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
        name: prodName,
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80',
        weight_per_unit: unitWeight,
        price: Number(product_price) || 15000,
        stock: 20,
        category: 'Mặt hàng tùy chọn'
      };
      store.data.products.unshift(existingProd);
    }
    finalProductId = existingProd._id;
  }

  // Check if slot_id is already assigned to a DIFFERENT slot in any shelf
  const conflictSlot = store.data.shelfSlots.find(
    (s) => s.slot_id === cleanSlotId && !(s.shelf_id === shelf_id && s.slot_number === num)
  );
  if (conflictSlot) {
    return res.status(400).json({
      success: false,
      message: `Mã cân ${cleanSlotId} đã được gán cho ${conflictSlot.shelf_id} - Ô ${conflictSlot.slot_number}. Vui lòng dùng mã khác hoặc giải phóng ô cũ!`
    });
  }

  // Find existing slot at this shelf position
  let slotIndex = store.data.shelfSlots.findIndex(
    (s) => s.shelf_id === shelf_id && s.slot_number === num
  );

  // If not found by shelf + position, check if cleanSlotId already exists in this shelf
  if (slotIndex === -1) {
    slotIndex = store.data.shelfSlots.findIndex((s) => s.slot_id === cleanSlotId);
  }

  let product = store.data.products.find((p) => p._id === finalProductId);
  if (product && unitWeight > 0 && product.weight_per_unit !== unitWeight) {
    product.weight_per_unit = unitWeight;
  }

  const totalWeight = current_total_weight !== undefined && current_total_weight !== ''
    ? Number(current_total_weight)
    : unitWeight * 10;

  if (slotIndex !== -1) {
    // Update existing
    store.data.shelfSlots[slotIndex] = {
      ...store.data.shelfSlots[slotIndex],
      shelf_id,
      slot_number: num,
      slot_id: cleanSlotId,
      product_id: finalProductId,
      expected_unit_weight: unitWeight,
      current_total_weight: totalWeight,
      last_stable_weight: totalWeight,
      status: totalWeight <= unitWeight * 2 ? 'Needs Restock' : 'Active',
      last_updated: new Date().toISOString()
    };
  } else {
    // Create new slot
    const newSlot = {
      _id: 'slot_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
      shelf_id,
      slot_number: num,
      slot_id: cleanSlotId,
      product_id: finalProductId,
      expected_unit_weight: unitWeight,
      current_total_weight: totalWeight,
      last_stable_weight: totalWeight,
      status: totalWeight <= unitWeight * 2 ? 'Needs Restock' : 'Active',
      last_updated: new Date().toISOString()
    };
    store.data.shelfSlots.push(newSlot);
    slotIndex = store.data.shelfSlots.length - 1;
  }

  store.saveData();

  const savedSlot = store.data.shelfSlots[slotIndex];
  const estimatedQuantity = unitWeight > 0 ? Math.round(savedSlot.current_total_weight / unitWeight) : 0;
  const enrichedSlot = { ...savedSlot, product, estimated_quantity: estimatedQuantity };

  emitRealtime('shelf_updated', { slot: enrichedSlot, product });
  res.json({
    success: true,
    message: `Đã cấu hình Ô ${num} (Chiếc cân ${cleanSlotId}) thành công!`,
    data: enrichedSlot
  });
});

// Clear/Release slot
router.delete('/slot/:shelfId/:slotNumber', (req, res) => {
  const { shelfId, slotNumber } = req.params;
  const num = Number(slotNumber);

  const index = store.data.shelfSlots.findIndex((s) => s.shelf_id === shelfId && s.slot_number === num);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Ô này chưa được gán cân nào!' });
  }

  const deleted = store.data.shelfSlots.splice(index, 1);
  store.saveData();

  emitRealtime('shelf_updated', { type: 'slot_cleared', shelfId, slotNumber: num });
  res.json({ success: true, message: `Đã giải phóng Ô ${num} thành công!`, data: deleted[0] });
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
  if (req.body.current_total_weight !== undefined) {
    slot.current_total_weight = Number(req.body.current_total_weight);
    slot.last_stable_weight = slot.current_total_weight;
  }
  if (req.body.expected_unit_weight !== undefined) slot.expected_unit_weight = Number(req.body.expected_unit_weight);
  if (req.body.status) slot.status = req.body.status;

  slot.last_updated = new Date().toISOString();
  store.saveData();

  const product = store.data.products.find((p) => p._id === slot.product_id);
  emitRealtime('shelf_updated', { slot, product });

  res.json({ success: true, data: slot });
});

// Restock or adjust a slot
router.post('/:id/restock', (req, res) => {
  const slot = store.data.shelfSlots.find((s) => s._id === req.params.id || s.slot_id === req.params.id);
  if (!slot) return res.status(404).json({ success: false, message: 'Không tìm thấy kệ/slot' });

  const product = store.data.products.find((p) => p._id === slot.product_id);
  const units = Number(req.body.units) || 1;
  const mode = req.body.mode || (req.body.mode === 'set' ? 'set' : 'add'); // default to 'add' for incremental restock
  const unitWeight = product ? product.weight_per_unit : slot.expected_unit_weight || 100;

  if (mode === 'add') {
    slot.current_total_weight = Math.max(0, (Number(slot.current_total_weight) || 0) + (unitWeight * units));
  } else {
    slot.current_total_weight = Math.max(0, unitWeight * units);
  }
  slot.last_stable_weight = slot.current_total_weight;

  const estimatedQuantity = unitWeight > 0 ? Math.round(slot.current_total_weight / unitWeight) : 0;
  slot.status = estimatedQuantity <= 2 ? 'Needs Restock' : 'Active';
  slot.last_updated = new Date().toISOString();

  store.saveData();

  emitRealtime('shelf_updated', { slot, product });
  res.json({
    success: true,
    message: mode === 'add'
      ? `Đã thêm +${units} sản phẩm vào kệ ${slot.slot_id} (Hiện có: ${estimatedQuantity} món, ${slot.current_total_weight}g)`
      : `Đã cập nhật kệ ${slot.slot_id} về ${units} sản phẩm (${slot.current_total_weight}g)`,
    data: {
      ...slot,
      product,
      estimated_quantity: estimatedQuantity
    }
  });
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
