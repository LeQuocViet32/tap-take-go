import express from 'express';
import store from '../db/store.js';

const router = express.Router();

// Get list of orders
router.get('/', (req, res) => {
  res.json({ success: true, data: store.data.orders });
});

// Single order
router.get('/:id', (req, res) => {
  const order = store.data.orders.find((o) => o._id === req.params.id || o.order_code === req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn' });
  res.json({ success: true, data: order });
});

// Admin Refund / Cancel order
router.post('/:id/refund', (req, res) => {
  const order = store.data.orders.find((o) => o._id === req.params.id || o.order_code === req.params.id);
  if (!order) return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn' });

  order.payment_status = 'Refunded';
  order.refund_reason = req.body.reason || 'Yêu cầu khiếu nại của khách hàng';
  order.refunded_at = new Date().toISOString();

  // Return items to product stock
  order.items.forEach((item) => {
    const product = store.data.products.find((p) => p._id === item.product_id);
    if (product) {
      product.stock = (product.stock || 0) + item.quantity;
    }
  });

  store.saveData();

  res.json({ success: true, message: 'Đã hoàn tiền đơn hàng thành công', data: order });
});

export default router;
