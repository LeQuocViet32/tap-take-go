import express from 'express';
import store from '../db/store.js';
import { handleCustomerEntry, emitRealtime } from '../services/cartService.js';

const router = express.Router();

// Helper to sanitize user object (don't leak plain password in lists)
function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

// 1. REGISTER NEW CUSTOMER
router.post('/register', (req, res) => {
  const { name, phone_number, password, rfid_card_id } = req.body;

  if (!phone_number || !name || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ: Họ tên, Số điện thoại và Mật khẩu' });
  }

  const cleanPhone = phone_number.trim();
  const existing = store.data.users.find(
    (u) => u.phone_number === cleanPhone || u.username === cleanPhone
  );

  if (existing) {
    return res.status(400).json({ success: false, message: 'Số điện thoại này đã được đăng ký tài khoản trước đó' });
  }

  // Generate unique RFID Card ID if user doesn't have a physical one
  const generatedRfid = rfid_card_id?.trim() || ('RFID_' + Math.floor(100000 + Math.random() * 900000).toString(16).toUpperCase());

  const newUser = {
    _id: 'usr_' + Date.now().toString(36),
    name: name.trim(),
    phone_number: cleanPhone,
    password: password.trim(),
    rfid_card_id: generatedRfid,
    role: 'customer',
    is_in_store: false,
    created_at: new Date().toISOString()
  };

  store.data.users.push(newUser);
  store.saveData();

  emitRealtime('users_status_updated');

  res.status(201).json({
    success: true,
    message: 'Đăng ký tài khoản khách hàng thành công!',
    user: sanitizeUser(newUser)
  });
});

// 2. LOGIN (ADMIN OR CUSTOMER)
router.post('/login', (req, res) => {
  const { username, phone_number, password } = req.body;
  const loginId = (username || phone_number || '').trim();
  const cleanPassword = (password || '').trim();

  if (!loginId || !cleanPassword) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập/số điện thoại và mật khẩu' });
  }

  // 2.1 Admin check: quanly1 / quanly1
  if ((loginId === 'quanly1' || loginId === 'admin') && cleanPassword === 'quanly1') {
    let admin = store.data.users.find((u) => u.username === 'quanly1' || u.phone_number === 'quanly1');
    if (!admin) {
      admin = {
        _id: 'usr_admin',
        username: 'quanly1',
        phone_number: 'quanly1',
        password: 'quanly1',
        name: 'Quản Lý Cửa Hàng 1',
        role: 'admin',
        rfid_card_id: 'RFID_ADMIN_01',
        is_in_store: false,
        created_at: new Date().toISOString()
      };
      store.data.users.unshift(admin);
      store.saveData();
    }
    return res.json({
      success: true,
      message: 'Đăng nhập Quản Lý thành công',
      user: sanitizeUser(admin)
    });
  }

  // 2.2 Customer check
  const user = store.data.users.find(
    (u) => u.phone_number === loginId || u.username === loginId || u._id === loginId
  );

  if (!user || user.password !== cleanPassword) {
    return res.status(401).json({
      success: false,
      message: 'Số điện thoại hoặc mật khẩu không chính xác'
    });
  }

  res.json({
    success: true,
    message: `Chào mừng ${user.name} trở lại!`,
    user: sanitizeUser(user)
  });
});

// 3. ADMIN: CUSTOMERS REAL-TIME MONITORING & DIRECTORY
// Displays full credentials (phone, password), in-store presence, live cart items, and order history
router.get('/customers-monitoring', (req, res) => {
  const allAccounts = store.data.users.map((u) => ({
    _id: u._id,
    name: u.name,
    username: u.username || u.phone_number,
    phone_number: u.phone_number,
    password: u.password || '123',
    role: u.role || 'customer',
    rfid_card_id: u.rfid_card_id,
    is_in_store: u.is_in_store || false,
    created_at: u.created_at
  }));

  const customers = store.data.users
    .filter((u) => u.role !== 'admin')
    .map((customer) => {
      // Find active cart if in store
      const activeCart = store.data.virtualCarts.find(
        (c) => c.user_id === customer._id && (c.status === 'Shopping' || c.status === 'Checkout_Pending')
      );

      // Determine real-time presence
      const isInStore = !!activeCart || customer.is_in_store === true || store.data.activeGate.activeShopperId === customer._id;

      // Find user order history
      const userOrders = store.data.orders.filter(
        (o) => o.user_id === customer._id || o.phone_number === customer.phone_number
      );

      const totalSpent = userOrders
        .filter((o) => o.payment_status === 'Completed')
        .reduce((sum, o) => sum + (o.total_amount || 0), 0);

      return {
        _id: customer._id,
        name: customer.name,
        phone_number: customer.phone_number,
        password: customer.password || '123',
        rfid_card_id: customer.rfid_card_id,
        role: customer.role || 'customer',
        created_at: customer.created_at,
        is_in_store: isInStore,
        current_cart: activeCart ? {
          order_code: activeCart.order_code,
          items: activeCart.items,
          total_amount: activeCart.total_amount,
          status: activeCart.status,
          updated_at: activeCart.updated_at
        } : null,
        total_orders_count: userOrders.length,
        total_spent: totalSpent,
        orders: userOrders
      };
    });

  res.json({
    success: true,
    data: customers,
    all_accounts: allAccounts
  });
});

// Admin updates password for any user
router.put('/users/:id/update-password', (req, res) => {
  const { password } = req.body;
  const user = store.data.users.find((u) => u._id === req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
  }
  if (!password || !password.trim()) {
    return res.status(400).json({ success: false, message: 'Mật khẩu mới không được để trống' });
  }

  user.password = password.trim();
  store.saveData();
  emitRealtime('users_status_updated');

  res.json({ success: true, message: `Đã cập nhật mật khẩu cho ${user.name} thành công!` });
});

// Admin deletes an account
router.delete('/users/:id', (req, res) => {
  const index = store.data.users.findIndex((u) => u._id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản' });
  }
  if (store.data.users[index].role === 'admin' || store.data.users[index].username === 'quanly1') {
    return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản Quản lý gốc quanly1' });
  }

  const deleted = store.data.users.splice(index, 1);
  store.saveData();
  emitRealtime('users_status_updated');

  res.json({ success: true, message: `Đã xóa tài khoản ${deleted[0].name} thành công`, data: deleted[0] });
});

// Admin creates a new account directly
router.post('/admin/create-account', (req, res) => {
  const { name, phone_number, password, rfid_card_id, role } = req.body;
  if (!phone_number || !name || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ: Tên, SĐT và Mật khẩu' });
  }

  const cleanPhone = phone_number.trim();
  const existing = store.data.users.find(
    (u) => u.phone_number === cleanPhone || u.username === cleanPhone
  );
  if (existing) {
    return res.status(400).json({ success: false, message: 'Tài khoản/SĐT này đã tồn tại' });
  }

  const generatedRfid = rfid_card_id?.trim() || ('RFID_' + Math.floor(100000 + Math.random() * 900000).toString(16).toUpperCase());
  const newUser = {
    _id: 'usr_' + Date.now().toString(36),
    name: name.trim(),
    phone_number: cleanPhone,
    password: password.trim(),
    rfid_card_id: generatedRfid,
    role: role || 'customer',
    is_in_store: false,
    created_at: new Date().toISOString()
  };

  store.data.users.push(newUser);
  store.saveData();
  emitRealtime('users_status_updated');

  res.status(201).json({ success: true, message: 'Đã tạo tài khoản mới thành công', user: newUser });
});

// 4. CUSTOMER PROFILE & HISTORY (FOR CUSTOMER PORTAL)
router.get('/profile/:id', (req, res) => {
  const user = store.data.users.find(
    (u) => u._id === req.params.id || u.phone_number === req.params.id
  );

  if (!user) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy người dùng' });
  }

  // Active virtual cart
  const activeCart = store.data.virtualCarts.find(
    (c) => c.user_id === user._id && (c.status === 'Shopping' || c.status === 'Checkout_Pending')
  );

  const isInStore = !!activeCart || user.is_in_store === true || store.data.activeGate.activeShopperId === user._id;

  // Order history
  const userOrders = store.data.orders.filter(
    (o) => o.user_id === user._id || o.phone_number === user.phone_number
  );

  res.json({
    success: true,
    data: {
      user: sanitizeUser(user),
      is_in_store: isInStore,
      current_cart: activeCart || null,
      orders: userOrders
    }
  });
});

// 5. LIST ALL USERS (COMPACT)
router.get('/users', (req, res) => {
  res.json({
    success: true,
    data: store.data.users.map(sanitizeUser)
  });
});

// 6. CURRENT SHOPPER
router.get('/current-shopper', (req, res) => {
  const shopperId = store.data.activeGate.activeShopperId;
  const shopper = store.data.users.find((u) => u._id === shopperId) || null;
  res.json({
    success: true,
    data: {
      shopper: sanitizeUser(shopper),
      gateStatus: store.data.activeGate
    }
  });
});

export default router;
