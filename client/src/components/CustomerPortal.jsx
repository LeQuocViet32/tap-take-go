import React, { useState, useEffect } from 'react';
import { apiFetch, formatVND, socket } from '../services/api';
import { 
  Smartphone, 
  ShoppingBag, 
  CreditCard, 
  Clock, 
  CheckCircle2, 
  User, 
  RefreshCw, 
  AlertCircle,
  LogIn,
  UserPlus,
  ArrowRight,
  QrCode,
  DoorOpen,
  Sparkles,
  ShieldCheck,
  X,
  Trash2
} from 'lucide-react';

export default function CustomerPortal({ user, onOpenAuthModal }) {
  const [currentUser, setCurrentUser] = useState(user || null);
  const [activeCart, setActiveCart] = useState(null);
  const [isInStore, setIsInStore] = useState(false);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('cart'); // 'cart' or 'history'
  const [loading, setLoading] = useState(false);

  // Dedicated Checkout Window states for THIS customer
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [qrInfo, setQrInfo] = useState(null);
  const [settings, setSettings] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [paymentSuccessOrder, setPaymentSuccessOrder] = useState(null);
  const [countdown, setCountdown] = useState(5);

  // Audio chime for successful payment
  const playSuccessChime = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
      osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
    } catch {
      // Audio playback blocked without user interaction
    }
  };

  useEffect(() => {
    fetchSettings();

    if (user) {
      setCurrentUser(user);
      loadCustomerData(user);
    } else {
      const saved = sessionStorage.getItem('ttg_user');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setCurrentUser(parsed);
          loadCustomerData(parsed);
        } catch {
          loadDefaultCustomer();
        }
      } else {
        loadDefaultCustomer();
      }
    }

    // Socket event listeners
    const onCartUpdated = (updatedCart) => {
      // ONLY update if cart belongs to current user
      if (updatedCart && updatedCart.user_id === currentUser?._id) {
        setActiveCart(updatedCart);
        setIsInStore(true);
        if (updatedCart.vietQR) {
          setQrInfo(updatedCart.vietQR);
        }
      } else if (!updatedCart) {
        setActiveCart(null);
        setIsInStore(false);
      }
    };

    const onCustomerAtGate = (data) => {
      if (data.user_id === currentUser?._id || data.cart?.user_id === currentUser?._id) {
        setActiveCart(data.cart);
        setQrInfo(data.qrData);
        setShowCheckoutModal(true);
      }
    };

    const onPaymentSuccess = (data) => {
      // Check if payment was for THIS customer
      const orderUserId = data.user_id || data.order?.user_id;
      if (orderUserId === currentUser?._id) {
        setPaymentSuccessOrder(data.order);
        setShowCheckoutModal(true);
        setActiveCart(null);
        setIsInStore(false);
        playSuccessChime();

        if (currentUser) loadCustomerData(currentUser);

        let count = 5;
        const timer = setInterval(() => {
          count -= 1;
          setCountdown(count);
          if (count <= 0) {
            clearInterval(timer);
            setPaymentSuccessOrder(null);
            setShowCheckoutModal(false);
            setQrInfo(null);
          }
        }, 1000);
      }
    };

    const onUsersUpdated = () => {
      if (currentUser) loadCustomerData(currentUser);
    };

    socket.on('cart_updated', onCartUpdated);
    socket.on('customer_at_gate', onCustomerAtGate);
    socket.on('payment_success', onPaymentSuccess);
    socket.on('users_status_updated', onUsersUpdated);

    return () => {
      socket.off('cart_updated', onCartUpdated);
      socket.off('customer_at_gate', onCustomerAtGate);
      socket.off('payment_success', onPaymentSuccess);
      socket.off('users_status_updated', onUsersUpdated);
    };
  }, [currentUser?._id, user]);

  const fetchSettings = async () => {
    try {
      const res = await apiFetch('/settings');
      if (res.data) setSettings(res.data);
    } catch (err) {
      console.warn(err);
    }
  };

  const loadDefaultCustomer = async () => {
    try {
      const res = await apiFetch('/auth/users');
      const firstCustomer = res.data?.find((u) => u.role !== 'admin') || res.data?.[0];
      if (firstCustomer) {
        setCurrentUser(firstCustomer);
        loadCustomerData(firstCustomer);
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const loadCustomerData = async (usr) => {
    if (!usr) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/auth/profile/${usr._id || usr.phone_number}`);
      if (res.data) {
        setIsInStore(res.data.is_in_store);
        setActiveCart(res.data.current_cart);
        setOrders(res.data.orders || []);
        if (res.data.current_cart?.vietQR) {
          setQrInfo(res.data.current_cart.vietQR);
        }
      }
    } catch (err) {
      console.warn('Error loading customer profile:', err);
    } finally {
      setLoading(false);
    }
  };

  // Open dedicated checkout window for THIS customer
  const handleOpenCheckoutModal = async () => {
    if (!currentUser) return;
    setCheckoutLoading(true);
    try {
      const res = await apiFetch('/cart/checkout', {
        method: 'POST',
        body: JSON.stringify({ user_id: currentUser._id })
      });
      if (res.cart) {
        setActiveCart(res.cart);
        setQrInfo(res.qrData);
        setShowCheckoutModal(true);
      }
    } catch (err) {
      alert(err.message || 'Không thể tạo mã VietQR');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Customer simulates payment for THEIR OWN cart
  const handleCustomerSimulatePayment = async () => {
    if (!currentUser || !activeCart) return;
    setCheckoutLoading(true);
    try {
      await apiFetch('/simulator/simulate-payment', {
        method: 'POST',
        body: JSON.stringify({ 
          user_id: currentUser._id, 
          order_code: activeCart.order_code 
        })
      });
    } catch (err) {
      alert(err.message || 'Lỗi mô phỏng thanh toán');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // Clear customer's own cart
  const handleClearCart = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy giỏ hàng hiện tại?')) return;
    try {
      await apiFetch('/cart/clear', {
        method: 'POST',
        body: JSON.stringify({ user_id: currentUser._id })
      });
      setActiveCart(null);
      setShowCheckoutModal(false);
      loadCustomerData(currentUser);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-12">
      {/* Header Profile Card */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl mb-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-bold text-xl border border-white/20 shadow-inner">
              {currentUser?.name ? currentUser.name.charAt(0) : <User className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-xl font-bold">{currentUser?.name || 'Khách Hàng'}</h2>
              <p className="text-blue-100 text-sm flex items-center gap-1.5 font-mono">
                <Smartphone className="w-4 h-4 opacity-80" />
                {currentUser?.phone_number || 'Chưa đăng nhập'}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md ${
              isInStore ? 'bg-emerald-500/30 text-emerald-100 border border-emerald-400/30 animate-pulse' : 'bg-white/15 text-blue-100'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isInStore ? 'bg-emerald-400' : 'bg-slate-300'}`} />
              {isInStore ? 'Đang trong cửa hàng' : 'Ngoài cửa hàng'}
            </span>
          </div>
        </div>

        {/* RFID Card ID & QR Identity Badge */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/15 flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <CreditCard className="w-6 h-6 text-blue-200" />
            <div>
              <p className="text-xs text-blue-200 font-medium">Mã Thẻ Định Danh RFID Của Bạn</p>
              <p className="font-mono font-bold tracking-wider text-base">{currentUser?.rfid_card_id || 'CHƯA CẤP THẺ'}</p>
            </div>
          </div>
          <div className="bg-white p-1.5 rounded-xl shadow-sm">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${currentUser?.rfid_card_id || 'DEMO'}`}
              alt="QR Card"
              className="w-10 h-10 object-contain rounded-lg"
            />
          </div>
        </div>

        {/* Quick Auth Actions */}
        {onOpenAuthModal && (
          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-xs">
            <span className="text-blue-200">Bạn muốn đổi tài khoản hoặc đăng ký mới?</span>
            <button
              onClick={onOpenAuthModal}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-xl font-bold transition flex items-center gap-1 text-white border border-white/20"
            >
              <UserPlus className="w-3.5 h-3.5" /> Đăng Nhập / Tạo Tài Khoản
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-6 bg-white rounded-2xl p-1 shadow-sm">
        <button
          onClick={() => setActiveTab('cart')}
          className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'cart'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          Giỏ Hàng Của Tôi
          {activeCart?.items?.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-900 text-xs font-bold flex items-center justify-center">
              {activeCart.items.reduce((sum, i) => sum + i.quantity, 0)}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${
            activeTab === 'history'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          Lịch Sử Hóa Đơn ({orders.length})
        </button>
      </div>

      {/* Tab Content: Real-time Virtual Cart */}
      {activeTab === 'cart' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <span>Hàng trong giỏ ảo của {currentUser?.name || 'bạn'}</span>
              {isInStore && (
                <span className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full font-semibold border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Cập nhật độc lập theo thẻ của bạn
                </span>
              )}
            </h3>
            <button
              onClick={() => currentUser && loadCustomerData(currentUser)}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Làm mới
            </button>
          </div>

          {!activeCart || !activeCart.items || activeCart.items.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 shadow-sm">
              <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-3xl mx-auto flex items-center justify-center mb-4">
                <ShoppingBag className="w-10 h-10" />
              </div>
              <h4 className="text-lg font-bold text-slate-800 mb-1">Giỏ hàng của bạn đang trống</h4>
              <p className="text-slate-500 text-sm max-w-sm mx-auto mb-6">
                {isInStore 
                  ? 'Bạn đang trong cửa hàng. Hãy chuyển qua tab "Thử Nghiệm Mua Sắm (IoT)" nhấc sản phẩm trên kệ để hệ thống ghi nhận vào giỏ của riêng bạn!'
                  : 'Bạn chưa quẹt thẻ RFID vào cổng cửa hàng, hoặc chưa nhặt món đồ nào từ kệ.'
                }
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 max-w-md mx-auto text-left">
                <p className="font-bold text-slate-800 mb-1">💡 Hướng dẫn thử nghiệm cho tài khoản này:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Chuyển qua tab <strong>Thử Nghiệm Mua Sắm (IoT)</strong> ở thanh menu trên cùng.</li>
                  <li>Bấm <strong>Quẹt Thẻ Vào Cửa (Tap RFID)</strong> với thẻ <strong>{currentUser?.rfid_card_id}</strong>.</li>
                  <li>Bấm <strong>-1 Lon Coca</strong> trên kệ để thấy món hàng tự động tính riêng cho bạn!</li>
                </ol>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              {/* Order code header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div>
                  <span className="text-xs text-slate-400">Mã đơn giỏ hàng:</span>
                  <span className="font-mono font-bold text-blue-600 ml-1.5 text-sm">#{activeCart.order_code}</span>
                </div>
                <button
                  onClick={handleClearCart}
                  className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Hủy giỏ
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {activeCart.items.map((item, idx) => (
                  <div key={idx} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <img 
                        src={item.image} 
                        alt={item.name} 
                        className="w-14 h-14 object-cover rounded-2xl bg-slate-100 border border-slate-200 flex-shrink-0"
                      />
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{item.name}</h4>
                        <p className="text-xs text-slate-500 font-mono">
                          {formatVND(item.price)} x {item.quantity} {item.weight_per_unit ? `(~${item.weight_per_unit}g/món)` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-extrabold text-blue-600 text-base">{formatVND(item.subtotal)}</p>
                      <span className="inline-block text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                        SL: {item.quantity}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Summary */}
              <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium">Tổng tiền thanh toán của bạn</p>
                  <p className="text-2xl font-black text-slate-900">{formatVND(activeCart.total_amount)}</p>
                </div>
                
                {/* DEDICATED CHECKOUT BUTTON FOR THIS CUSTOMER */}
                <button
                  onClick={handleOpenCheckoutModal}
                  disabled={checkoutLoading}
                  className="px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition active:scale-95 animate-pulse"
                >
                  <QrCode className="w-5 h-5" />
                  Mở Cửa Sổ Thanh Toán VietQR Của Tôi
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Order History */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-bold text-slate-900 text-lg">Lịch sử hóa đơn của {currentUser?.name} ({orders.length})</h3>
            <button
              onClick={() => currentUser && loadCustomerData(currentUser)}
              className="text-xs text-blue-600 font-bold hover:underline"
            >
              Làm mới
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-sm text-slate-500">
              Bạn chưa có hóa đơn mua sắm nào.
            </div>
          ) : (
            orders.map((ord) => (
              <div key={ord._id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
                  <div>
                    <span className="font-mono font-bold text-blue-600 text-sm">#{ord.order_code}</span>
                    <p className="text-xs text-slate-400">{new Date(ord.created_at).toLocaleString('vi-VN')}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    ord.payment_status === 'Completed'
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      : ord.payment_status === 'Refunded'
                      ? 'bg-rose-100 text-rose-700 border border-rose-200'
                      : 'bg-amber-100 text-amber-700 border border-amber-200'
                  }`}>
                    {ord.payment_status === 'Completed' ? '✓ Đã thanh toán' : ord.payment_status === 'Refunded' ? 'Đã hoàn tiền' : 'Đang xử lý'}
                  </span>
                </div>

                <div className="space-y-2 mb-3">
                  {ord.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-700">
                      <span>• {i.name} (x{i.quantity})</span>
                      <span className="font-semibold">{formatVND(i.subtotal)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-100 font-bold text-sm">
                  <span className="text-slate-600">Tổng cộng:</span>
                  <span className="text-emerald-600 text-base">{formatVND(ord.total_amount)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* DEDICATED INDIVIDUAL CHECKOUT MODAL / WINDOW PER CUSTOMER */}
      {/* ======================================================== */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          {paymentSuccessOrder ? (
            /* SUCCESS CELEBRATION WINDOW */
            <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-green-700 rounded-3xl p-8 text-white max-w-lg w-full text-center shadow-2xl relative overflow-hidden animate-fade-in">
              <div className="w-20 h-20 bg-white text-emerald-600 rounded-full flex items-center justify-center mb-4 mx-auto shadow-2xl animate-bounce">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-emerald-100 text-xs font-bold uppercase tracking-wider mb-2">
                <Sparkles className="w-4 h-4 text-amber-300" />
                Giao Dịch Đã Xác Thực Thành Công
              </span>

              <h2 className="text-2xl sm:text-3xl font-black mb-2">CẢM ƠN {currentUser?.name}!</h2>
              <p className="text-sm text-emerald-100 mb-6">
                Hóa đơn <span className="font-mono font-bold text-white bg-white/20 px-2 py-0.5 rounded">#{paymentSuccessOrder.order_code}</span> trị giá <span className="font-bold text-white">{formatVND(paymentSuccessOrder.total_amount)}</span> đã hoàn tất.
              </p>

              <div className="bg-white/15 backdrop-blur-lg border border-white/30 rounded-2xl p-4 mb-6">
                <div className="flex items-center justify-center gap-3 text-lg font-black text-amber-200 mb-1">
                  <DoorOpen className="w-6 h-6 animate-pulse" /> CỔNG TỪ RA ĐANG MỞ
                </div>
                <p className="text-xs text-emerald-100">
                  Cửa sổ sẽ tự đóng sau <strong className="text-white text-sm">{countdown}s</strong>.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowCheckoutModal(false);
                  setPaymentSuccessOrder(null);
                }}
                className="px-6 py-2.5 bg-white text-emerald-800 rounded-xl font-bold text-xs hover:bg-emerald-50 transition"
              >
                Đóng Cửa Sổ Ngay
              </button>
            </div>
          ) : (
            /* ACTIVE CHECKOUT & VIETQR MODAL */
            <div className="bg-slate-900 rounded-3xl max-w-2xl w-full border border-slate-700 shadow-2xl text-white overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Top Header */}
              <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                  <div>
                    <h3 className="font-black text-lg text-white">
                      CỬA SỔ THANH TOÁN: {currentUser?.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      Mã hóa đơn: <strong className="text-amber-300 font-bold">#{activeCart?.order_code}</strong> • SĐT: {currentUser?.phone_number}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowCheckoutModal(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content: Left Bill, Right VietQR */}
              <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-6">
                {/* Left Column: Bill details */}
                <div className="md:col-span-6 bg-slate-950/50 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                      <ShoppingBag className="w-4 h-4 text-blue-400" />
                      Chi tiết giỏ của {currentUser?.name}
                    </h4>

                    <div className="divide-y divide-slate-800 max-h-48 overflow-y-auto pr-1">
                      {activeCart?.items?.map((item, idx) => (
                        <div key={idx} className="py-2.5 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-slate-200">{item.name}</p>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {formatVND(item.price)} x {item.quantity}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-blue-400">{formatVND(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 mt-4 flex justify-between items-center">
                    <span className="text-xs uppercase text-slate-400 font-semibold">Cần Chuyển:</span>
                    <span className="text-2xl font-black text-amber-400 font-mono">{formatVND(activeCart?.total_amount || 0)}</span>
                  </div>
                </div>

                {/* Right Column: Dynamic VietQR */}
                <div className="md:col-span-6 flex flex-col items-center justify-center text-center">
                  <p className="text-xs text-blue-300 font-bold mb-2 flex items-center gap-1">
                    <QrCode className="w-4 h-4 text-blue-400" /> QUÉT VIETQR BẰNG APP NGÂN HÀNG
                  </p>

                  <div className="bg-white p-3 rounded-2xl shadow-xl border-2 border-blue-500/40">
                    {qrInfo?.vietQrUrl ? (
                      <img 
                        src={qrInfo.vietQrUrl} 
                        alt="VietQR" 
                        className="w-48 h-48 object-contain rounded-xl"
                        onError={(e) => {
                          if (qrInfo.base64QR) e.target.src = qrInfo.base64QR;
                        }}
                      />
                    ) : (
                      <div className="w-48 h-48 bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                        Đang tạo mã QR...
                      </div>
                    )}
                  </div>

                  {/* Transfer Details */}
                  <div className="w-full mt-3 bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 text-[11px] text-left space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Ngân hàng:</span>
                      <span className="font-bold text-white">{settings?.bank_id || 'MB'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Số tài khoản:</span>
                      <span className="font-mono font-bold text-white">{settings?.bank_account || '090123456789'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Nội dung CK:</span>
                      <span className="font-mono font-bold text-amber-300 bg-amber-950/60 px-1.5 rounded">{activeCart?.order_code}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer with Simulation Button */}
              <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Chỉ thanh toán cho đơn của {currentUser?.name}</span>
                </div>

                <button
                  onClick={handleCustomerSimulatePayment}
                  disabled={checkoutLoading}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/30 transition active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  [Thử Nghiệm] Giả Lập Tôi Đã Chuyển Tiền Thành Công
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
