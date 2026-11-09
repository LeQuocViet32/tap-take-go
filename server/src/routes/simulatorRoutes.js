import express from 'express';
import store from '../db/store.js';
import { 
  handleCustomerEntry, 
  handleWeightChange, 
  handleCustomerAtGate, 
  processPaymentWebhook, 
  getUserActiveCart,
  emitRealtime 
} from '../services/cartService.js';

const router = express.Router();

// Simulate customer tapping RFID card at entry
router.post('/rfid-tap', async (req, res) => {
  const cardId = req.body.rfid_card_id || 'RFID_DEMO_01';
  const result = await handleCustomerEntry(cardId);
  res.json(result);
});

// Simulate shelf weight variation (customer taking or returning items)
router.post('/weight-change', async (req, res) => {
  const { slot_id, weight_change, user_id } = req.body;
  if (!slot_id || weight_change === undefined) {
    return res.status(400).json({ success: false, message: 'Thiếu slot_id hoặc weight_change' });
  }

  const result = await handleWeightChange(slot_id, Number(weight_change), user_id);
  res.json(result);
});

// Simulate customer walking to Exit Gate
router.post('/trigger-checkout', async (req, res) => {
  const userId = req.body.user_id || null;
  const result = await handleCustomerAtGate(userId);
  res.json(result);
});

// Simulate SePay bank webhook payment confirmation
router.post('/simulate-payment', async (req, res) => {
  const { order_code, user_id } = req.body || {};

  let cart = null;
  if (order_code) {
    cart = store.data.virtualCarts.find(
      (c) => c.order_code === order_code && c.status !== 'Completed'
    );
  }

  if (!cart && user_id) {
    cart = getUserActiveCart(user_id);
  }

  if (!cart) {
    cart = store.data.virtualCarts.find(
      (c) => c.status === 'Checkout_Pending' || c.status === 'Shopping'
    );
  }

  if (!cart) {
    return res.status(400).json({ success: false, message: 'Không có giỏ hàng nào đang chờ thanh toán' });
  }

  const simulatedWebhook = {
    id: 'TXN_' + Date.now(),
    gateway: store.data.settings.bank_id,
    transactionDate: new Date().toISOString(),
    accountNumber: store.data.settings.bank_account,
    code: null,
    order_code: cart.order_code,
    user_id: cart.user_id,
    content: `${cart.order_code || 'TTG'} CHUYEN TIEN THANH TOAN TAP TAKE GO`,
    transferType: 'in',
    transferAmount: cart.total_amount,
    accumulated: 10000000
  };

  const result = await processPaymentWebhook(simulatedWebhook);
  res.json(result);
});

// Reset demo state
router.post('/reset-demo', (req, res) => {
  store.data.virtualCarts = [];
  store.data.users.forEach((u) => {
    u.is_in_store = false;
  });
  store.data.activeGate = {
    entryGateOpen: false,
    exitGateOpen: false,
    activeShopperId: null,
    lastEntryTime: null
  };

  // Reset shelf slots to 10 items each
  store.data.shelfSlots.forEach((slot) => {
    const product = store.data.products.find((p) => p._id === slot.product_id);
    const unitWeight = product ? product.weight_per_unit : slot.expected_unit_weight || 100;
    slot.current_total_weight = unitWeight * 10;
    slot.status = 'Active';
    slot.last_updated = new Date().toISOString();
  });

  store.saveData();
  emitRealtime('cart_updated', null);
  emitRealtime('gate_entry_event', { status: 'CLOSED' });
  emitRealtime('gate_exit_event', { status: 'CLOSED' });
  emitRealtime('users_status_updated');

  res.json({ success: true, message: 'Đã thiết lập lại dữ liệu demo thành công' });
});

export default router;
