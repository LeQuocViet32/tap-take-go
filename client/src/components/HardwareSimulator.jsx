import React, { useState, useEffect } from 'react';
import { apiFetch, formatVND, socket } from '../services/api';
import { 
  Cpu, 
  CreditCard, 
  Scale, 
  DoorOpen, 
  DoorClosed, 
  ArrowRight, 
  Send, 
  RotateCcw, 
  CheckCircle2, 
  Activity, 
  Layers, 
  Radio, 
  Zap,
  ShoppingBag,
  Users,
  UserCheck
} from 'lucide-react';

export default function HardwareSimulator({ currentUser, isAdmin }) {
  const [users, setUsers] = useState([]);
  const [selectedUserCard, setSelectedUserCard] = useState(currentUser?.rfid_card_id || 'RFID_ADMIN_01');
  const [selectedCustomerId, setSelectedCustomerId] = useState(currentUser?._id || '');
  const [shelves, setShelves] = useState([]);
  const [entryGateOpen, setEntryGateOpen] = useState(false);
  const [exitGateOpen, setExitGateOpen] = useState(false);
  const [activeCart, setActiveCart] = useState(null);
  const [logMessages, setLogMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  // Effective target user ID for operations
  const activeTargetUserId = isAdmin ? selectedCustomerId : currentUser?._id;

  useEffect(() => {
    fetchData();

    // Socket listeners for hardware state
    const onGateEntry = (data) => {
      setEntryGateOpen(data.status === 'OPEN');
      if (data.message) addLog('ENTRY GATE', data.message);
    };

    const onGateExit = (data) => {
      setExitGateOpen(data.status === 'OPEN');
      if (data.status === 'OPEN') addLog('EXIT GATE', `Cổng ra mở chốt cho đơn #${data.order_code}`);
    };

    const onCartUpdated = (cart) => {
      // If customer mode: only update if it belongs to current customer
      if (!isAdmin && cart && cart.user_id === currentUser?._id) {
        setActiveCart(cart);
      } else if (isAdmin && cart) {
        if (!selectedCustomerId || cart.user_id === selectedCustomerId) {
          setActiveCart(cart);
        }
      } else if (!cart) {
        setActiveCart(null);
      }
      fetchShelves();
    };

    const onShelfUpdated = () => {
      fetchShelves();
    };

    const onPaymentSuccess = (data) => {
      addLog('SEPAY WEBHOOK', `Thanh toán thành công ${formatVND(data.order.total_amount)} cho đơn #${data.order.order_code} (${data.order.customer_name})`);
      if (data.user_id === activeTargetUserId) {
        setActiveCart(null);
      }
    };

    socket.on('gate_entry_event', onGateEntry);
    socket.on('gate_exit_event', onGateExit);
    socket.on('cart_updated', onCartUpdated);
    socket.on('shelf_updated', onShelfUpdated);
    socket.on('payment_success', onPaymentSuccess);

    return () => {
      socket.off('gate_entry_event', onGateEntry);
      socket.off('gate_exit_event', onGateExit);
      socket.off('cart_updated', onCartUpdated);
      socket.off('shelf_updated', onShelfUpdated);
      socket.off('payment_success', onPaymentSuccess);
    };
  }, [currentUser, isAdmin, selectedCustomerId, activeTargetUserId]);

  const fetchData = async () => {
    try {
      const [uRes, sRes] = await Promise.all([
        apiFetch('/auth/users'),
        apiFetch('/shelves')
      ]);

      if (uRes.data) {
        const customerList = uRes.data.filter((u) => u.role !== 'admin');
        setUsers(customerList);

        if (!isAdmin && currentUser) {
          setSelectedUserCard(currentUser.rfid_card_id);
          setSelectedCustomerId(currentUser._id);
          fetchCartForUser(currentUser._id);
        } else if (isAdmin && customerList.length > 0) {
          const defaultCust = customerList[0];
          setSelectedUserCard(defaultCust.rfid_card_id);
          setSelectedCustomerId(defaultCust._id);
          fetchCartForUser(defaultCust._id);
        }
      }

      if (sRes.data) setShelves(sRes.data);
    } catch (err) {
      console.warn(err);
    }
  };

  const fetchCartForUser = async (userId) => {
    if (!userId) return;
    try {
      const cRes = await apiFetch(`/cart?user_id=${userId}`);
      if (cRes.data) {
        setActiveCart(cRes.data);
      } else {
        setActiveCart(null);
      }
    } catch {
      setActiveCart(null);
    }
  };

  const handleAdminSelectCustomer = (userId) => {
    setSelectedCustomerId(userId);
    const u = users.find((x) => x._id === userId);
    if (u) {
      setSelectedUserCard(u.rfid_card_id);
    }
    fetchCartForUser(userId);
  };

  const fetchShelves = async () => {
    try {
      const res = await apiFetch('/shelves');
      if (res.data) setShelves(res.data);
    } catch (err) {
      console.warn(err);
    }
  };

  const addLog = (tag, text) => {
    const time = new Date().toLocaleTimeString('vi-VN');
    setLogMessages((prev) => [{ time, tag, text, id: Date.now() + Math.random() }, ...prev.slice(0, 30)]);
  };

  // Simulate RFID Tap
  const handleSimulateRfidTap = async () => {
    setLoading(true);
    try {
      addLog('HARDWARE', `Quẹt thẻ RFID ${selectedUserCard} tại Cổng Vào (RC522)`);
      const res = await apiFetch('/simulator/rfid-tap', {
        method: 'POST',
        body: JSON.stringify({ rfid_card_id: selectedUserCard })
      });
      addLog('BACKEND', `Xác thực thẻ hợp lệ. Mở cổng vào cho ${res.user?.name}`);
      if (res.cart) {
        setActiveCart(res.cart);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Simulate Weight Change on Shelf (BOUND TO TARGET USER)
  const handleWeightDelta = async (slotId, weightDelta, itemName) => {
    setLoading(true);
    try {
      const actionName = weightDelta < 0 ? `Nhấc 1 món (-${Math.abs(weightDelta)}g)` : `Đặt lại 1 món (+${weightDelta}g)`;
      const targetName = isAdmin ? (users.find(u => u._id === selectedCustomerId)?.name || 'Khách') : currentUser?.name;

      addLog('MQTT SENSOR', `Loadcell ${slotId}: ${actionName} [${itemName}] bởi ${targetName}`);
      
      const res = await apiFetch('/simulator/weight-change', {
        method: 'POST',
        body: JSON.stringify({ 
          slot_id: slotId, 
          weight_change: weightDelta,
          user_id: activeTargetUserId 
        })
      });

      if (res.cart) {
        setActiveCart(res.cart);
        addLog('VIRTUAL CART', `Giỏ ${res.cart.customer_name}: ${res.cart.items.length} món • Tổng: ${formatVND(res.cart.total_amount)}`);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Simulate Customer walking to Exit
  const handleGoToExit = async () => {
    try {
      const targetName = isAdmin ? (users.find(u => u._id === selectedCustomerId)?.name || 'Khách') : currentUser?.name;
      addLog('GATE SENSOR', `Khách hàng ${targetName} bước tới vùng quét Cổng Ra`);
      const res = await apiFetch('/simulator/trigger-checkout', { 
        method: 'POST',
        body: JSON.stringify({ user_id: activeTargetUserId })
      });
      if (res.cart) {
        setActiveCart(res.cart);
        addLog('KIOSK', `Màn hình Cửa Ra tạo VietQR cho ${res.cart.customer_name} (Đơn #${res.cart.order_code} - ${formatVND(res.cart.total_amount)})`);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Simulate SePay Bank Webhook
  const handleSimulatePaymentWebhook = async () => {
    setLoading(true);
    try {
      const targetName = isAdmin ? (users.find(u => u._id === selectedCustomerId)?.name || 'Khách') : currentUser?.name;
      addLog('BANK', `Khách hàng ${targetName} quét VietQR trên app ngân hàng và chuyển khoản thành công`);
      const res = await apiFetch('/simulator/simulate-payment', { 
        method: 'POST',
        body: JSON.stringify({ 
          user_id: activeTargetUserId,
          order_code: activeCart?.order_code 
        })
      });
      addLog('SEPAY', `Webhook SePay đã gọi /api/webhook/payment -> Cổng ra mở chốt`);
      setActiveCart(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset Demo
  const handleResetDemo = async () => {
    if (!window.confirm('Đặt lại toàn bộ dữ liệu mô phỏng demo (xóa giỏ ảo, reset tải kệ)?')) return;
    try {
      await apiFetch('/simulator/reset-demo', { method: 'POST' });
      addLog('SYSTEM', 'Đã đặt lại toàn bộ trạng thái demo');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Simulator Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-mono text-xs text-blue-400 font-bold uppercase tracking-wider">IoT Hardware Test Bench</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            {isAdmin ? 'Giám Sát Cảm Biến IoT & Cổng Từ (Quản Lý)' : `Thử Nghiệm Mua Sắm IoT Cho ${currentUser?.name}`}
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            {isAdmin 
              ? 'Chế độ Quản lý: Có thể chọn bất kỳ khách hàng nào để thử nghiệm quẹt thẻ hoặc nhấc đồ trên kệ.'
              : 'Chế độ Khách hàng: Mọi thao tác nhấc/trả đồ được gắn mã định danh của riêng bạn, không bị tính trùng với khách khác.'}
          </p>
        </div>

        <button
          onClick={handleResetDemo}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-slate-700"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset Dữ Liệu Demo
        </button>
      </div>

      {/* 3 Main Stages Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* STAGE 1: ENTRY TURNSTILE & RFID */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                Giai Đoạn 1: Cổng Vào
              </span>
              <span className="text-xs font-mono text-slate-400">ESP32 + RC522</span>
            </div>

            <h3 className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              {isAdmin ? 'Quẹt Thẻ RFID Cửa Vào' : 'Quẹt Thẻ RFID Của Bạn'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {isAdmin 
                ? 'Chọn thẻ khách hàng để mở chốt cổng vào và khởi tạo phiên mua sắm độc lập.'
                : 'Chạm thẻ RFID cá nhân của bạn vào đầu đọc RC522 tại cổng để mở cửa vào mua sắm.'}
            </p>

            <div className="space-y-3 mb-6">
              {isAdmin ? (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Chọn Khách Hàng Thử Nghiệm:</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => handleAdminSelectCustomer(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 font-bold focus:outline-none"
                  >
                    {users.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name} ({u.rfid_card_id}) - {u.phone_number} {u.is_in_store ? '• [Đang trong shop]' : ''}
                      </option>
                    ))}
                    {users.length === 0 && <option value="">Chưa có khách nào đăng ký</option>}
                  </select>
                </div>
              ) : (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl">
                  <p className="text-xs text-blue-900 font-bold mb-0.5">Thẻ RFID định danh của bạn:</p>
                  <p className="font-mono text-base font-black text-blue-700">{currentUser?.rfid_card_id || 'CHƯA CẤP THẺ'}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Chủ thẻ: {currentUser?.name} ({currentUser?.phone_number})</p>
                </div>
              )}

              {/* Turnstile Graphic */}
              <div className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
                entryGateOpen 
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 animate-gate-open' 
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <div className="flex items-center gap-3">
                  {entryGateOpen ? <DoorOpen className="w-8 h-8 text-emerald-600 animate-pulse" /> : <DoorClosed className="w-8 h-8 text-slate-400" />}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">Trạng Thái Cổng Vào</p>
                    <p className="text-sm font-black">{entryGateOpen ? 'ĐANG MỞ CHỐT (RELAY ON)' : 'ĐANG ĐÓNG KHÓA (LOCKED)'}</p>
                  </div>
                </div>
                <span className={`w-3 h-3 rounded-full ${entryGateOpen ? 'bg-emerald-500 animate-ping' : 'bg-rose-500'}`} />
              </div>
            </div>
          </div>

          <button
            onClick={handleSimulateRfidTap}
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2 active:scale-95"
          >
            <Radio className="w-4 h-4" /> Quẹt Thẻ Vào Cửa (Tap RFID)
          </button>
        </div>

        {/* STAGE 2: SMART SHELVES & LOADCELLS */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                Giai Đoạn 2: Kệ Hàng
              </span>
              <span className="text-xs font-mono text-slate-400">ESP32 + HX711</span>
            </div>

            <h3 className="font-bold text-slate-900 text-base mb-1 flex items-center gap-2">
              <Scale className="w-5 h-5 text-amber-600" />
              Cảm Biến Trọng Lượng Kệ
            </h3>
            
            {/* Identity context indicator */}
            <div className="mb-3 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs flex items-center justify-between">
              <span className="text-slate-500 font-medium">Đang nhấc đồ cho:</span>
              <span className="font-bold text-blue-700">
                {isAdmin ? (users.find(u => u._id === selectedCustomerId)?.name || 'Chưa chọn') : currentUser?.name}
              </span>
            </div>

            <div className="space-y-3 mb-4 max-h-[300px] overflow-y-auto pr-1">
              {shelves.map((slot) => {
                const prod = slot.product;
                const unitWeight = prod ? prod.weight_per_unit : slot.expected_unit_weight || 100;

                return (
                  <div key={slot._id} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex justify-between items-center mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold bg-slate-800 text-white px-1.5 py-0.5 rounded">
                          {slot.slot_id}
                        </span>
                        <h4 className="font-bold text-slate-800 text-xs truncate max-w-[120px]">{prod?.name || 'Sản phẩm'}</h4>
                      </div>
                      <span className="text-xs font-mono font-bold text-blue-600">{slot.current_total_weight}g</span>
                    </div>

                    <div className="flex gap-1.5 mt-2">
                      <button
                        disabled={loading}
                        onClick={() => handleWeightDelta(slot.slot_id, -unitWeight, prod?.name)}
                        className="flex-1 py-1.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold transition"
                        title={`Lấy 1 món (-${unitWeight}g)`}
                      >
                        -1 {prod?.name?.split(' ')[0]} (-{unitWeight}g)
                      </button>
                      <button
                        disabled={loading}
                        onClick={() => handleWeightDelta(slot.slot_id, +unitWeight, prod?.name)}
                        className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold transition"
                        title={`Trả lại 1 món (+${unitWeight}g)`}
                      >
                        +1 Trả lại (+{unitWeight}g)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-2xl text-xs text-blue-900 font-semibold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-blue-600" />
              Giỏ Của {isAdmin ? (users.find(u => u._id === selectedCustomerId)?.name || 'Khách') : currentUser?.name}:
            </span>
            <span className="font-bold text-blue-700 font-mono">
              {activeCart?.items?.reduce((s, i) => s + i.quantity, 0) || 0} món • {formatVND(activeCart?.total_amount || 0)}
            </span>
          </div>
        </div>

        {/* STAGE 3: EXIT TURNSTILE & SEPAY WEBHOOK */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                Giai Đoạn 3: Cửa Ra & Thanh Toán
              </span>
              <span className="text-xs font-mono text-slate-400">VietQR + SePay</span>
            </div>

            <h3 className="font-bold text-slate-900 text-base mb-2 flex items-center gap-2">
              <Zap className="w-5 h-5 text-emerald-600" />
              Thanh Toán & Cổng Ra
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {isAdmin 
                ? 'Kích hoạt tạo mã VietQR trên Kiosk và giả lập xác nhận chuyển khoản SePay.'
                : 'Mở cửa sổ thanh toán VietQR cho đơn của bạn và giả lập thanh toán.'}
            </p>

            <div className="space-y-3 mb-6">
              <button
                onClick={handleGoToExit}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-300"
              >
                1. Khách Tiến Tới Màn Hình Cửa Ra
              </button>

              {/* Turnstile Graphic Exit */}
              <div className={`p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${
                exitGateOpen 
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 animate-gate-open' 
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}>
                <div className="flex items-center gap-3">
                  {exitGateOpen ? <DoorOpen className="w-8 h-8 text-emerald-600 animate-pulse" /> : <DoorClosed className="w-8 h-8 text-slate-400" />}
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider">Trạng Thái Cổng Ra</p>
                    <p className="text-sm font-black">{exitGateOpen ? 'CỔNG RA ĐANG MỞ (PASS)' : 'CỔNG RA ĐANG KHÓA (LOCKED)'}</p>
                  </div>
                </div>
                <span className={`w-3 h-3 rounded-full ${exitGateOpen ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
              </div>
            </div>
          </div>

          <button
            onClick={handleSimulatePaymentWebhook}
            disabled={loading || !activeCart}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center gap-2 active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            2. Giả Lập Thanh Toán Cho {isAdmin ? (users.find(u => u._id === selectedCustomerId)?.name || 'Khách') : currentUser?.name}
          </button>
        </div>
      </div>

      {/* Live Hardware & Event Activity Log Stream */}
      <div className="bg-slate-950 text-slate-200 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Nhật Ký Sự Kiện Real-time (MQTT Broker / Socket.io / Webhook)
          </h3>
          <button
            onClick={() => setLogMessages([])}
            className="text-[11px] text-slate-400 hover:text-white"
          >
            Xóa log
          </button>
        </div>

        <div className="font-mono text-xs space-y-1.5 max-h-48 overflow-y-auto pr-2">
          {logMessages.length === 0 ? (
            <p className="text-slate-600 italic">Chưa có sự kiện nào. Hãy nhấn quẹt thẻ hoặc nhấc đồ ở trên để theo dõi...</p>
          ) : (
            logMessages.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-slate-300">
                <span className="text-slate-500">[{log.time}]</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                  log.tag === 'MQTT SENSOR' ? 'bg-amber-900/60 text-amber-300' :
                  log.tag === 'SEPAY WEBHOOK' ? 'bg-emerald-900/60 text-emerald-300' :
                  log.tag === 'ENTRY GATE' || log.tag === 'EXIT GATE' ? 'bg-blue-900/60 text-blue-300' :
                  'bg-slate-800 text-slate-300'
                }`}>
                  {log.tag}
                </span>
                <span className="text-slate-200">{log.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
