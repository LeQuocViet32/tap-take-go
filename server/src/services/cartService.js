import store from '../db/store.js';
import { generateVietQR } from './qrService.js';

let ioInstance = null;
let mqttPublishFn = null;

export function registerSocketIO(io) {
  ioInstance = io;
}

export function registerMQTTPublisher(publisher) {
  mqttPublishFn = publisher;
}

/**
 * Emit real-time event to all connected sockets
 */
export function emitRealtime(event, data) {
  if (ioInstance) {
    ioInstance.emit(event, data);
  }
}

/**
 * Find active cart for a specific user
 */
export function getUserActiveCart(userId) {
  if (!userId) return null;
  return store.data.virtualCarts.find(
    (c) => (c.user_id === userId || c.rfid_card_id === userId) && 
           (c.status === 'Shopping' || c.status === 'Checkout_Pending')
  ) || null;
}

/**
 * Find active cart (user-specific or most recent active)
 */
export function getActiveCart(userId = null) {
  if (userId) {
    return getUserActiveCart(userId);
  }

  // If active shopper exists, try their cart first
  if (store.data.activeGate.activeShopperId) {
    const shopperCart = getUserActiveCart(store.data.activeGate.activeShopperId);
    if (shopperCart) return shopperCart;
  }

  // Otherwise return the most recently updated active cart
  const activeCarts = store.data.virtualCarts.filter(
    (c) => c.status === 'Shopping' || c.status === 'Checkout_Pending'
  );
  if (activeCarts.length === 0) return null;
  return activeCarts[activeCarts.length - 1];
}

/**
 * Get all currently active carts in the store
 */
export function getAllActiveCarts() {
  return store.data.virtualCarts.filter(
    (c) => c.status === 'Shopping' || c.status === 'Checkout_Pending'
  );
}

/**
 * Handle customer tapping RFID at Entrance Gate
 */
export async function handleCustomerEntry(rfidCardId) {
  let user = store.data.users.find((u) => u.rfid_card_id === rfidCardId || u._id === rfidCardId);
  if (!user) {
    // Auto-create user for frictionless test/demo
    user = {
      _id: 'usr_' + Date.now().toString(36),
      phone_number: '09' + Math.floor(10000000 + Math.random() * 90000000),
      rfid_card_id: rfidCardId,
      name: `Khách Thẻ #${rfidCardId.slice(-4)}`,
      role: 'customer',
      is_in_store: true,
      created_at: new Date().toISOString()
    };
    store.data.users.push(user);
  }

  // Mark this specific customer as inside the store (do NOT kick out other customers!)
  user.is_in_store = true;

  // Check if there is already an existing active cart specifically for THIS user
  let cart = getUserActiveCart(user._id);
  if (!cart) {
    cart = {
      _id: 'cart_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      order_code: 'TTG' + Math.floor(1000 + Math.random() * 9000),
      user_id: user._id,
      customer_name: user.name,
      phone_number: user.phone_number,
      rfid_card_id: user.rfid_card_id,
      items: [],
      total_amount: 0,
      status: 'Shopping',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    store.data.virtualCarts.push(cart);
  } else {
    // Keep items, just update name / status
    cart.customer_name = user.name;
    cart.phone_number = user.phone_number;
    cart.rfid_card_id = user.rfid_card_id;
    cart.status = 'Shopping';
    cart.updated_at = new Date().toISOString();
  }

  // Pre-compute VietQR for cart so it is immediately available
  const settings = store.data.settings;
  if (settings) {
    try {
      cart.vietQR = await generateVietQR({
        bankId: settings.bank_id,
        bankAccount: settings.bank_account,
        accountName: settings.account_name,
        amount: cart.total_amount,
        content: `${cart.order_code}`
      });
    } catch (e) {
      console.warn('QR pre-generation notice:', e.message);
    }
  }

  store.data.activeGate.entryGateOpen = true;
  store.data.activeGate.activeShopperId = user._id;
  store.data.activeGate.lastEntryTime = new Date().toISOString();
  store.saveData();

  // Send turnstile open command via MQTT
  if (mqttPublishFn) {
    mqttPublishFn('store/gate/entry', { command: 'OPEN', user_id: user._id, card_id: user.rfid_card_id });
  }

  // Notify frontend
  emitRealtime('gate_entry_event', {
    status: 'OPEN',
    user,
    cart,
    message: `Chào mừng ${user.name} vào cửa hàng!`
  });
  emitRealtime('cart_updated', cart);
  emitRealtime('users_status_updated', { activeShopperId: user._id });

  // Automatically reset entry gate door state after 4 seconds
  setTimeout(() => {
    store.data.activeGate.entryGateOpen = false;
    store.saveData();
    emitRealtime('gate_entry_event', { status: 'CLOSED' });
  }, 4000);

  return { success: true, user, cart };
}

/**
 * Handle sensor weight variation from Shelf (HX711)
 * weightChange: negative (took item), positive (returned item)
 * targetUserId: optional ID of the customer taking/returning the item
 */
export async function handleWeightChange(slotId, weightChange, targetUserId = null) {
  const slot = store.data.shelfSlots.find((s) => s.slot_id === slotId);
  if (!slot) {
    console.warn(`[Weight] Slot ${slotId} not recognized.`);
    return { success: false, reason: 'Slot not found' };
  }

  const product = store.data.products.find((p) => p._id === slot.product_id);
  if (!product) {
    console.warn(`[Weight] Product for slot ${slotId} not found.`);
    return { success: false, reason: 'Product not assigned to slot' };
  }

  const unitWeight = product.weight_per_unit || slot.expected_unit_weight || 100;
  
  // Calculate quantity difference: negative weight change means customer took item (+qty in cart)
  const deltaUnits = -Math.round(weightChange / unitWeight);

  if (deltaUnits === 0) {
    return { success: true, action: 'NO_OP', note: 'Weight change within noise margin' };
  }

  // Update physical slot current weight
  slot.current_total_weight = Math.max(0, (slot.current_total_weight || 0) + weightChange);
  slot.last_updated = new Date().toISOString();
  
  // Check restock requirement
  if (slot.current_total_weight < unitWeight * 2) {
    slot.status = 'Needs Restock';
  } else {
    slot.status = 'Active';
  }

  // Determine which user's cart to update
  let targetUser = null;
  if (targetUserId) {
    targetUser = store.data.users.find(
      (u) => u._id === targetUserId || u.rfid_card_id === targetUserId || u.phone_number === targetUserId
    );
  }

  if (!targetUser && store.data.activeGate.activeShopperId) {
    targetUser = store.data.users.find((u) => u._id === store.data.activeGate.activeShopperId);
  }

  // If still not identified, look for any customer currently inside the store
  if (!targetUser) {
    const inStoreCustomers = store.data.users.filter((u) => u.is_in_store && u.role !== 'admin');
    if (inStoreCustomers.length > 0) {
      targetUser = inStoreCustomers[inStoreCustomers.length - 1];
    } else {
      targetUser = store.data.users.find((u) => u.role !== 'admin') || store.data.users[0];
    }
  }

  if (!targetUser) {
    return { success: false, reason: 'Không tìm thấy khách hàng nào trong hệ thống' };
  }

  // Ensure customer is marked in store
  targetUser.is_in_store = true;
  store.data.activeGate.activeShopperId = targetUser._id;

  // Find or create active cart specifically for this user
  let cart = getUserActiveCart(targetUser._id);
  if (!cart) {
    cart = {
      _id: 'cart_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      order_code: 'TTG' + Math.floor(1000 + Math.random() * 9000),
      user_id: targetUser._id,
      customer_name: targetUser.name,
      phone_number: targetUser.phone_number,
      rfid_card_id: targetUser.rfid_card_id,
      items: [],
      total_amount: 0,
      status: 'Shopping',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    store.data.virtualCarts.push(cart);
  }

  // Update item in THIS user's cart
  const existingItemIndex = cart.items.findIndex((i) => i.product_id === product._id);
  if (existingItemIndex >= 0) {
    const item = cart.items[existingItemIndex];
    item.quantity += deltaUnits;
    if (item.quantity <= 0) {
      cart.items.splice(existingItemIndex, 1);
    } else {
      item.subtotal = item.quantity * item.price;
    }
  } else if (deltaUnits > 0) {
    cart.items.push({
      product_id: product._id,
      sku: product.sku,
      name: product.name,
      image: product.image,
      price: product.price,
      weight_per_unit: unitWeight,
      quantity: deltaUnits,
      subtotal: deltaUnits * product.price
    });
  }

  // Recalculate cart total
  cart.total_amount = cart.items.reduce((sum, i) => sum + i.subtotal, 0);
  cart.updated_at = new Date().toISOString();

  // Always keep cart.vietQR up to date with new amount
  const settings = store.data.settings;
  if (settings) {
    try {
      cart.vietQR = await generateVietQR({
        bankId: settings.bank_id,
        bankAccount: settings.bank_account,
        accountName: settings.account_name,
        amount: cart.total_amount,
        content: `${cart.order_code}`
      });
    } catch (e) {
      console.warn('QR update notice:', e.message);
    }
  }

  store.saveData();

  // Real-time broadcast
  emitRealtime('cart_updated', cart);
  emitRealtime('shelf_updated', { slot, product });
  emitRealtime('users_status_updated');

  return {
    success: true,
    action: deltaUnits > 0 ? 'ITEM_TAKEN' : 'ITEM_RETURNED',
    deltaUnits,
    product,
    cart,
    user: targetUser
  };
}

/**
 * Handle Customer arriving at Exit Checkout Gate
 * userId: optional specific user checkout request
 */
export async function handleCustomerAtGate(userId = null) {
  let cart = null;
  if (userId) {
    cart = getUserActiveCart(userId);
  }

  if (!cart) {
    cart = getActiveCart();
  }

  if (!cart) {
    return { success: false, reason: 'Không có giỏ hàng nào đang mua sắm' };
  }

  cart.status = 'Checkout_Pending';
  if (!cart.order_code) {
    cart.order_code = 'TTG' + Math.floor(1000 + Math.random() * 9000);
  }

  const settings = store.data.settings;
  const qrData = await generateVietQR({
    bankId: settings.bank_id,
    bankAccount: settings.bank_account,
    accountName: settings.account_name,
    amount: cart.total_amount,
    content: `${cart.order_code}`
  });

  cart.vietQR = qrData;
  cart.updated_at = new Date().toISOString();
  store.saveData();

  emitRealtime('customer_at_gate', { cart, qrData, user_id: cart.user_id });

  return { success: true, cart, qrData };
}

/**
 * Handle SePay Bank Payment Webhook
 */
export async function processPaymentWebhook(paymentPayload) {
  const { content, transferAmount, id, transactionDate, order_code, user_id } = paymentPayload;

  console.log(`[Payment Webhook] Received payment: ${transferAmount} VND with content: "${content}"`);

  // Extract order code (e.g. TTG1234)
  let detectedCode = order_code || null;
  if (!detectedCode && content) {
    const match = content.match(/TTG\d{4}/i);
    if (match) detectedCode = match[0].toUpperCase();
  }

  let cart = null;
  if (detectedCode) {
    cart = store.data.virtualCarts.find(
      (c) => c.order_code === detectedCode && c.status !== 'Completed'
    );
  }

  if (!cart && user_id) {
    cart = getUserActiveCart(user_id);
  }

  if (!cart) {
    // Find any Checkout_Pending or Shopping cart
    cart = store.data.virtualCarts.find(
      (c) => c.status === 'Checkout_Pending' || c.status === 'Shopping'
    );
  }

  if (!cart) {
    return { success: false, reason: 'Không tìm thấy giỏ hàng phù hợp để thanh toán' };
  }

  // Create Completed Order record
  const newOrder = {
    _id: 'ord_' + Date.now().toString(36),
    order_code: cart.order_code || ('TTG' + Math.floor(1000 + Math.random() * 9000)),
    user_id: cart.user_id,
    customer_name: cart.customer_name,
    phone_number: cart.phone_number,
    rfid_card_id: cart.rfid_card_id,
    items: [...cart.items],
    total_amount: cart.total_amount,
    paid_amount: Number(transferAmount) || cart.total_amount,
    payment_status: 'Completed',
    payment_method: 'VietQR / SePay',
    transaction_id: id || ('TXN_' + Date.now()),
    transaction_date: transactionDate || new Date().toISOString(),
    created_at: new Date().toISOString()
  };

  store.data.orders.unshift(newOrder);

  // Update product inventory stock
  cart.items.forEach((item) => {
    const product = store.data.products.find((p) => p._id === item.product_id);
    if (product) {
      product.stock = Math.max(0, (product.stock || 0) - item.quantity);
    }
  });

  // Mark cart as Completed
  cart.status = 'Completed';
  cart.updated_at = new Date().toISOString();

  // Mark ONLY this specific customer as left the store
  const customer = store.data.users.find((u) => u._id === cart.user_id);
  if (customer) {
    customer.is_in_store = false;
  }

  // If this customer was the activeShopperId in activeGate, clear or reassign to another in-store customer
  if (store.data.activeGate.activeShopperId === cart.user_id) {
    const otherInStore = store.data.users.find((u) => u.is_in_store && u._id !== cart.user_id && u.role !== 'admin');
    store.data.activeGate.activeShopperId = otherInStore ? otherInStore._id : null;
  }

  store.data.activeGate.exitGateOpen = true;
  store.saveData();

  // Send turnstile open command via MQTT
  if (mqttPublishFn) {
    mqttPublishFn('store/gate/exit', { command: 'OPEN', order_code: newOrder.order_code, duration_ms: 5000 });
  }

  // Emit real-time events to Checkout Kiosk and Dashboards
  emitRealtime('payment_success', {
    order: newOrder,
    cart_id: cart._id,
    user_id: cart.user_id,
    message: `Thanh toán thành công cho đơn #${newOrder.order_code} của ${newOrder.customer_name}! Cổng ra đang mở.`
  });
  emitRealtime('cart_updated', cart);
  emitRealtime('gate_exit_event', { status: 'OPEN', order_code: newOrder.order_code, user_id: cart.user_id });
  emitRealtime('users_status_updated');

  // Auto-close gate after 5 seconds
  setTimeout(() => {
    store.data.activeGate.exitGateOpen = false;
    store.saveData();
    emitRealtime('gate_exit_event', { status: 'CLOSED' });
  }, 5000);

  return { success: true, order: newOrder };
}
