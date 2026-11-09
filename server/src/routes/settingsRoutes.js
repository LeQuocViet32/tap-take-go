import express from 'express';
import store from '../db/store.js';

const router = express.Router();

// Get settings
router.get('/', (req, res) => {
  res.json({ success: true, data: store.data.settings });
});

// Update settings
router.put('/', (req, res) => {
  const { bank_id, bank_account, account_name, sepay_token, store_name, address } = req.body;

  if (bank_id) store.data.settings.bank_id = bank_id.toUpperCase();
  if (bank_account) store.data.settings.bank_account = bank_account.trim();
  if (account_name) store.data.settings.account_name = account_name.toUpperCase().trim();
  if (sepay_token !== undefined) store.data.settings.sepay_token = sepay_token.trim();
  if (store_name) store.data.settings.store_name = store_name.trim();
  if (address) store.data.settings.address = address.trim();

  store.saveData();

  res.json({ success: true, message: 'Đã cập nhật cài đặt thành công', data: store.data.settings });
});

export default router;
