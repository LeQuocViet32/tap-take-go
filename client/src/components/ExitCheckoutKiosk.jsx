import React, { useState, useEffect } from 'react';
import { apiFetch, formatVND, socket } from '../services/api';
import { 
  CheckCircle2, 
  QrCode, 
  ShieldCheck, 
  Sparkles, 
  ShoppingBag, 
  DoorOpen, 
  CreditCard, 
  RefreshCw,
  Users,
  UserCheck
} from 'lucide-react';

export default function ExitCheckoutKiosk() {
  const [activeCart, setActiveCart] = useState(null);
  const [allActiveCarts, setAllActiveCarts] = useState([]);
  const [paymentSuccessOrder, setPaymentSuccessOrder] = useState(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);

  // Directly derive QR info from activeCart.vietQR without separate state or extra API calls
  const qrInfo = activeCart?.vietQR || null;

  // Play simple chime sound via Web Audio API
  const playSuccessChime = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.3); // D6

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
    } catch {
      // Audio not permitted without interaction
    }
  };

  useEffect(() => {
    fetchInitialData();

    // Socket event listeners
    const onCustomerAtGate = (data) => {
      if (data && data.cart) {
        setPaymentSuccessOrder(null);
        setActiveCart(data.cart);

        setAllActiveCarts((prev) => {
          const idx = prev.findIndex((c) => c._id === data.cart._id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = data.cart;
            return next;
          }
          return [...prev, data.cart];
        });
      }
    };

    const onCartUpdated = (updatedCart) => {
      if (!updatedCart) {
        setActiveCart(null);
        setAllActiveCarts([]);
        return;
      }

      const isClosed = updatedCart.status === 'Completed' || updatedCart.status === 'Cancelled';

      // 1. Update the list of all active carts
      setAllActiveCarts((prev) => {
        if (isClosed) {
          return prev.filter((c) => c._id !== updatedCart._id && c.user_id !== updatedCart.user_id);
        }
        const idx = prev.findIndex((c) => c._id === updatedCart._id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedCart;
          return next;
        }
        return [...prev, updatedCart];
      });

      // 2. Update current activeCart in-memory
      setActiveCart((prev) => {
        if (!prev) {
          return isClosed ? null : updatedCart;
        }
        if (prev._id === updatedCart._id || prev.user_id === updatedCart.user_id) {
          return isClosed ? null : updatedCart;
        }
        return prev;
      });
    };

    const onPaymentSuccess = (data) => {
      setPaymentSuccessOrder(data.order);
      setGateOpen(true);
      playSuccessChime();

      // Remove paid cart from list
      const paidUserId = data.user_id || data.order?.user_id;
      const paidCartId = data.cart_id;

      setAllActiveCarts((prev) => 
        prev.filter((c) => c._id !== paidCartId && c.user_id !== paidUserId)
      );

      // Start countdown to close/reset
      let count = 5;
      const interval = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(interval);
          setPaymentSuccessOrder(null);
          setGateOpen(false);
          // Pick next cart from remaining active carts
          setAllActiveCarts((remaining) => {
            if (remaining.length > 0) {
              setActiveCart(remaining[0]);
            } else {
              setActiveCart(null);
            }
            return remaining;
          });
        }
      }, 1000);
    };

    const onGateExit = (data) => {
      setGateOpen(data.status === 'OPEN');
    };

    socket.on('customer_at_gate', onCustomerAtGate);
    socket.on('cart_updated', onCartUpdated);
    socket.on('payment_success', onPaymentSuccess);
    socket.on('gate_exit_event', onGateExit);

    return () => {
      socket.off('customer_at_gate', onCustomerAtGate);
      socket.off('cart_updated', onCartUpdated);
      socket.off('payment_success', onPaymentSuccess);
      socket.off('gate_exit_event', onGateExit);
    };
  }, []);

  const fetchInitialData = async () => {
    try {
      const setRes = await apiFetch('/settings');
      if (setRes.data) setSettings(setRes.data);

      const cartsRes = await apiFetch('/cart/active-carts');
      const carts = cartsRes.data || [];
      setAllActiveCarts(carts);

      if (carts.length > 0) {
        setActiveCart(carts[0]);
      } else {
        setActiveCart(null);
      }
    } catch (err) {
      console.warn('Initial kiosk fetch notice:', err);
    }
  };

  const selectCart = (cart) => {
    setActiveCart(cart);
  };

  // Trigger checkout for current active cart
  const handleTriggerCheckout = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/simulator/trigger-checkout', { 
        method: 'POST',
        body: JSON.stringify({ user_id: activeCart?.user_id || undefined })
      });
      if (res.cart) {
        setActiveCart(res.cart);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Simulate payment for currently focused cart
  const handleSimulatePayment = async () => {
    if (!activeCart) return;
    setLoading(true);
    try {
      await apiFetch('/simulator/simulate-payment', { 
        method: 'POST',
        body: JSON.stringify({ 
          user_id: activeCart.user_id, 
          order_code: activeCart.order_code 
        })
      });
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // SUCCESS SCREEN
  if (paymentSuccessOrder) {
    return (
      <div className="min-h-[85vh] bg-gradient-to-br from-emerald-600 via-teal-600 to-green-700 rounded-3xl p-8 text-white flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden animate-fade-in">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2)_0%,transparent_70%)] pointer-events-none" />

        <div className="w-28 h-28 bg-white text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-2xl animate-bounce">
          <CheckCircle2 className="w-16 h-16" />
        </div>

        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-emerald-100 text-sm font-bold uppercase tracking-wider mb-3">
          <Sparkles className="w-4 h-4 text-amber-300" />
          Giao Dịch Đã Xác Thực Thành Công
        </span>

        <h1 className="text-4xl sm:text-5xl font-black mb-3 tracking-tight">
          CẢM ƠN {paymentSuccessOrder.customer_name?.toUpperCase() || 'QUÝ KHÁCH'}!
        </h1>
        <p className="text-lg text-emerald-100 max-w-lg mb-8">
          Hóa đơn <span className="font-mono font-bold text-white bg-white/20 px-2 py-0.5 rounded">#{paymentSuccessOrder.order_code}</span> đã được thanh toán <span className="font-bold text-white">{formatVND(paymentSuccessOrder.total_amount)}</span>.
        </p>

        {/* Gate Status Pill */}
        <div className="bg-white/15 backdrop-blur-lg border-2 border-white/40 rounded-3xl p-6 max-w-md w-full shadow-xl mb-6">
          <div className="flex items-center justify-center gap-4 text-2xl font-black text-amber-200 mb-2">
            <DoorOpen className="w-10 h-10 animate-pulse" />
            CỔNG RA ĐANG MỞ
          </div>
          <p className="text-sm text-emerald-100">
            Xin vui lòng bước qua cổng từ. Cổng sẽ tự động đóng sau <strong className="text-white text-base">{countdown}s</strong>.
          </p>
        </div>

        <div className="w-48 h-2 bg-white/30 rounded-full overflow-hidden">
          <div 
            className="h-full bg-white transition-all duration-1000 ease-linear rounded-full"
            style={{ width: `${(countdown / 5) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  // STANDBY SCREEN (NO ACTIVE CART AT GATE)
  if (!activeCart || !activeCart.items || activeCart.items.length === 0) {
    return (
      <div className="min-h-[85vh] bg-slate-900 rounded-3xl p-8 text-white flex flex-col items-center justify-center text-center border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="w-24 h-24 bg-blue-500/10 text-blue-400 rounded-3xl flex items-center justify-center mb-6 border border-blue-500/20 shadow-inner">
          <QrCode className="w-12 h-12" />
        </div>

        <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/15 text-blue-300 text-xs font-bold uppercase tracking-wider mb-3 border border-blue-500/30">
          Màn Hình Thanh Toán Tự Động Cửa Ra (Kiosk)
        </span>

        <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">Sẵn Sàng Thanh Toán</h2>
        <p className="text-slate-400 max-w-md text-sm mb-8">
          Khi khách hàng bước tới cửa ra, hệ thống cảm biến sẽ nhận diện từng khách và hiển thị mã VietQR riêng biệt tương ứng.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={fetchInitialData}
            disabled={loading}
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            Kiểm Tra Giỏ Hàng Đang Có Trong Cửa Hàng
          </button>
        </div>
      </div>
    );
  }

  // ACTIVE CHECKOUT SCREEN (ITEMS IN CART & VIETQR PRESENT)
  return (
    <div className="min-h-[85vh] bg-slate-950 rounded-3xl p-6 sm:p-8 text-white border border-slate-800 shadow-2xl flex flex-col justify-between">
      {/* Kiosk Header */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">TAP TAKE GO CHECKOUT</h1>
            </div>
            <p className="text-slate-400 text-sm mt-0.5">
              Khách hàng: <strong className="text-blue-400">{activeCart.customer_name}</strong> • Mã hóa đơn: <strong className="font-mono text-amber-300">#{activeCart.order_code}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3.5 py-1.5 rounded-xl bg-blue-900/40 border border-blue-700/50 text-blue-300 text-xs font-semibold flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> VietQR Tự Động
            </span>
            <button
              onClick={fetchInitialData}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition"
              title="Làm mới"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MULTI-CUSTOMER TABS SELECTOR (IF MULTIPLE CUSTOMERS ARE IN STORE) */}
        {allActiveCarts.length > 1 && (
          <div className="pt-3 flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs text-slate-400 font-bold flex items-center gap-1 flex-shrink-0">
              <Users className="w-4 h-4 text-blue-400" /> Cửa sổ khách:
            </span>
            {allActiveCarts.map((c) => {
              const isSelected = c._id === activeCart._id;
              return (
                <button
                  key={c._id}
                  onClick={() => selectCart(c)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 flex-shrink-0 border ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>{c.customer_name}</span>
                  <span className="font-mono opacity-80 font-normal">({formatVND(c.total_amount)})</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Grid: Left Receipt, Right VietQR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 my-6 flex-1 items-center">
        {/* Left Column: Itemized Cart Details */}
        <div className="lg:col-span-7 bg-slate-900/80 rounded-3xl p-6 border border-slate-800 backdrop-blur-md shadow-inner flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-200 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-blue-400" />
                Hàng của {activeCart.customer_name} ({activeCart.items.length} món)
              </h3>
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2.5 py-1 rounded-lg">
                Định lượng Loadcell HX711
              </span>
            </div>

            <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto pr-2">
              {activeCart.items.map((item, idx) => (
                <div key={idx} className="py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img 
                      src={item.image} 
                      alt={item.name} 
                      className="w-12 h-12 object-cover rounded-xl bg-slate-800 border border-slate-700 flex-shrink-0"
                    />
                    <div>
                      <h4 className="font-bold text-slate-100 text-sm">{item.name}</h4>
                      <p className="text-xs text-slate-400 font-mono">
                        {formatVND(item.price)} x {item.quantity} {item.weight_per_unit ? `(${item.weight_per_unit}g)` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="font-extrabold text-white text-base">{formatVND(item.subtotal)}</p>
                    <span className="text-xs text-blue-400 font-semibold bg-blue-950/60 px-2 py-0.5 rounded border border-blue-900">
                      SL: {item.quantity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subtotal Banner */}
          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/50 p-4 rounded-2xl">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Tổng Tiền Cần Chuyển</p>
              <p className="text-3xl font-black text-amber-400">{formatVND(activeCart.total_amount)}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block mb-1">Phương thức thanh toán:</span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-3 py-1 rounded-full">
                VietQR Chuyển Khoản 24/7
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic VietQR Display */}
        <div className="lg:col-span-5 bg-gradient-to-b from-blue-950/40 to-slate-900 rounded-3xl p-6 border-2 border-blue-500/40 shadow-2xl flex flex-col items-center justify-center text-center relative">
          <div className="absolute top-4 right-4">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>

          <h3 className="text-base font-bold text-blue-300 mb-1 flex items-center gap-1.5">
            <QrCode className="w-5 h-5 text-blue-400" />
            QUÉT MÃ VIETQR ĐỂ THANH TOÁN
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Mở bất kỳ App Ngân Hàng (VCB, MB, Tech, Momo...) quét mã bên dưới
          </p>

          {/* QR Container */}
          <div className="bg-white p-3.5 rounded-3xl shadow-2xl border-4 border-blue-500/30 animate-pulse-glow max-w-[280px]">
            {qrInfo?.vietQrUrl ? (
              <img
                src={qrInfo.vietQrUrl}
                alt="VietQR Code"
                className="w-64 h-64 object-contain rounded-2xl"
                onError={(e) => {
                  if (qrInfo.base64QR) e.target.src = qrInfo.base64QR;
                }}
              />
            ) : (
              <div className="w-64 h-64 bg-slate-100 flex items-center justify-center text-slate-400 text-sm">
                Đang tạo mã QR...
              </div>
            )}
          </div>

          {/* Bank Transfer Details */}
          <div className="mt-4 w-full bg-slate-950/80 rounded-2xl p-3 border border-slate-800 text-xs text-left space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Ngân hàng:</span>
              <span className="font-bold text-white">{settings?.bank_id || 'MB'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Số tài khoản:</span>
              <span className="font-mono font-bold text-white">{settings?.bank_account || '090123456789'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Chủ tài khoản:</span>
              <span className="font-semibold text-white">{settings?.account_name || 'TAP TAKE GO STORE'}</span>
            </div>
            <div className="flex justify-between border-t border-slate-800/80 pt-1">
              <span className="text-slate-400">Nội dung CK:</span>
              <span className="font-mono font-bold text-amber-300 bg-amber-950/50 px-1.5 rounded">{activeCart.order_code}</span>
            </div>
          </div>

          {/* Real-time status badge */}
          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-400 font-semibold bg-emerald-950/40 border border-emerald-900/60 px-3.5 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Đang lắng nghe Webhook ngân hàng SePay...
          </div>
        </div>
      </div>

      {/* Kiosk Footer with Fast Simulation Action */}
      <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          Hệ thống bảo mật tự động • Cổng từ chỉ mở khi ngân hàng báo Có thành công
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSimulatePayment}
            disabled={loading}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-700/30 transition active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            [Thử Nghiệm] Giả Lập Ngân Hàng Bắn Tiền Cho Đơn #{activeCart.order_code}
          </button>
        </div>
      </div>
    </div>
  );
}
