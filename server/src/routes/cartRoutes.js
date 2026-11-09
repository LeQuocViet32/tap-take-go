import express from 'express';
import store from '../db/store.js';
import { getActiveCart, getUserActiveCart, getAllActiveCarts, handleCustomerAtGate, emitRealtime } from '../services/cartService.js';

const router = express.Router();

// Get active cart (supports ?user_id=...)
router.get('/', (req, res) => {
  const userId = req.query.user_id;
  const cart = getActiveCart(userId);
  res.json({ success: true, data: cart });
});

// Get all active carts in store
router.get('/active-carts', (req, res) => {
  const carts = getAllActiveCarts();
  res.json({ success: true, data: carts });
});

// Trigger checkout / arrive at exit gate
router.post('/checkout', async (req, res) => {
  const userId = req.body.user_id;
  const result = await handleCustomerAtGate(userId);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

// Clear / cancel active cart
router.post('/clear', (req, res) => {
  const userId = req.body.user_id;
  const cart = userId ? getUserActiveCart(userId) : getActiveCart();
  if (cart) {
    cart.status = 'Cancelled';
    cart.updated_at = new Date().toISOString();
    store.saveData();
    emitRealtime('cart_updated', cart);
  }
  res.json({ success: true, message: 'Đã hủy giỏ hàng' });
});

export default router;
