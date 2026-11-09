import express from 'express';
import store from '../db/store.js';

const router = express.Router();

// List products
router.get('/', (req, res) => {
  res.json({ success: true, data: store.data.products });
});

// Single product
router.get('/:id', (req, res) => {
  const product = store.data.products.find((p) => p._id === req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });
  res.json({ success: true, data: product });
});

// Create product
router.post('/', (req, res) => {
  const { name, sku, barcode, image, weight_per_unit, price, stock, category } = req.body;
  if (!name || !price || !weight_per_unit) {
    return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc (Tên, Giá, Cân nặng)' });
  }

  const newProduct = {
    _id: 'prod_' + Date.now().toString(36),
    sku: sku || 'SKU-' + Date.now().toString().slice(-6),
    barcode: barcode || Math.floor(1000000000000 + Math.random() * 9000000000000).toString(),
    name,
    image: image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&fit=crop&q=80',
    weight_per_unit: Number(weight_per_unit),
    price: Number(price),
    stock: Number(stock) || 0,
    category: category || 'Mặt hàng khác'
  };

  store.data.products.unshift(newProduct);
  store.saveData();

  res.status(201).json({ success: true, data: newProduct });
});

// Update product
router.put('/:id', (req, res) => {
  const index = store.data.products.findIndex((p) => p._id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });

  const existing = store.data.products[index];
  const updated = {
    ...existing,
    ...req.body,
    weight_per_unit: req.body.weight_per_unit !== undefined ? Number(req.body.weight_per_unit) : existing.weight_per_unit,
    price: req.body.price !== undefined ? Number(req.body.price) : existing.price,
    stock: req.body.stock !== undefined ? Number(req.body.stock) : existing.stock
  };

  store.data.products[index] = updated;
  store.saveData();

  res.json({ success: true, data: updated });
});

// Delete product
router.delete('/:id', (req, res) => {
  const index = store.data.products.findIndex((p) => p._id === req.params.id);
  if (index === -1) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm' });

  const deleted = store.data.products.splice(index, 1);
  store.saveData();

  res.json({ success: true, message: 'Đã xóa sản phẩm', data: deleted[0] });
});

export default router;
