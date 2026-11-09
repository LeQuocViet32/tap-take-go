import React, { useState, useEffect } from 'react';
import { apiFetch, socket } from './services/api';
import CustomerPortal from './components/CustomerPortal';
import ExitCheckoutKiosk from './components/ExitCheckoutKiosk';
import AdminPortal from './components/AdminPortal';
import HardwareSimulator from './components/HardwareSimulator';
import { 
  Smartphone, 
  Tv, 
  Settings, 
  Cpu, 
  ShoppingBag, 
  Radio, 
  ShieldCheck, 
  Activity,
  User,
  Shield,
  LogOut,
  LogIn,
  Lock,
  Phone,
  CreditCard,
  CheckCircle2,
  Sparkles,
  UserPlus,
  ExternalLink,
  Copy
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('ttg_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [currentView, setCurrentView] = useState(() => {
    try {
      const saved = sessionStorage.getItem('ttg_user');
      if (saved) {
        const u = JSON.parse(saved);
        return u.role === 'admin' ? 'admin' : 'customer';
      }
    } catch {
      // fallback
    }
    return 'customer';
  });

  const [isConnected, setIsConnected] = useState(socket.connected);

  // Auth form states for landing screen
  const [authTab, setAuthTab] = useState('login'); // 'login' or 'register'
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');

  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regRfid, setRegRfid] = useState('');

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');

  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginId, password: loginPass })
      });
      setAuthSuccess('Đăng nhập thành công!');
      setTimeout(() => {
        setCurrentUser(res.user);
        sessionStorage.setItem('ttg_user', JSON.stringify(res.user));
        if (res.user.role === 'admin') {
          setCurrentView('admin');
        } else {
          setCurrentView('customer');
        }
      }, 400);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    setAuthSuccess('');
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: regName,
          phone_number: regPhone,
          password: regPass,
          rfid_card_id: regRfid || undefined
        })
      });
      setAuthSuccess('Đăng ký tài khoản thành công! Đang chuyển vào cửa hàng...');
      setTimeout(() => {
        setCurrentUser(res.user);
        sessionStorage.setItem('ttg_user', JSON.stringify(res.user));
        setCurrentView('customer');
      }, 700);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const setQuickAdmin = () => {
    setAuthTab('login');
    setLoginId('quanly1');
    setLoginPass('quanly1');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('ttg_user');
    setLoginId('');
    setLoginPass('');
    setAuthError('');
    setAuthSuccess('');
    setAuthTab('login');
  };

  // ==========================================
  // 1. LANDING AUTH SCREEN (IF NOT LOGGED IN)
  // ==========================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex flex-col items-center justify-center p-4 relative overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]">
        {/* Ambient background blur elements */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 relative z-10 animate-fade-in">
          {/* Logo & Brand Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center text-3xl font-black mx-auto mb-3 shadow-xl shadow-blue-500/25">
              🛒
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">TAP TAKE GO</h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Cửa Hàng Tiện Lợi Thông Minh Không Người Bán • IoT & VietQR
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6 border border-slate-200">
            <button
              onClick={() => { setAuthTab('login'); setAuthError(''); }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${
                authTab === 'login' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đăng Nhập
            </button>
            <button
              onClick={() => { setAuthTab('register'); setAuthError(''); }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${
                authTab === 'register' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Đăng Ký Khách Hàng
            </button>
          </div>

          {/* Feedback messages */}
          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl mb-4">
              {authError}
            </div>
          )}
          {authSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl mb-4 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> {authSuccess}
            </div>
          )}

          {/* TAB 1: LOGIN FORM */}
          {authTab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Tên đăng nhập / Số điện thoại
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="quanly1 hoặc SĐT khách..."
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mật khẩu</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/25 transition active:scale-95"
              >
                {authLoading ? 'Đang xác thực...' : 'Đăng Nhập'}
              </button>

              {/* Quick Login Button For Admin */}
              <div className="pt-3 border-t border-slate-100 text-center">
                <p className="text-[11px] text-slate-400 mb-2 font-semibold">Dành cho Quản trị viên:</p>
                <button
                  type="button"
                  onClick={setQuickAdmin}
                  className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-indigo-200"
                >
                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  ⚡ Điền nhanh Quản Lý (quanly1 / quanly1)
                </button>
              </div>
            </form>
          ) : (
            /* TAB 2: REGISTER FORM */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Họ và tên của bạn *</label>
                <input
                  type="text"
                  required
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  placeholder="VD: Lê Hoàng Nam"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Số điện thoại *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="0912345678"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mật khẩu *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={regPass}
                    onChange={(e) => setRegPass(e.target.value)}
                    placeholder="Tối thiểu 3 ký tự"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mã thẻ RFID (Tùy chọn)
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={regRfid}
                    onChange={(e) => setRegRfid(e.target.value)}
                    placeholder="Bỏ trống nếu muốn hệ thống tự cấp thẻ"
                    className="w-full pl-9 pr-3.5 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Hệ thống sẽ tự động cấp một mã thẻ RFID và mã QR định danh cho bạn.
                </p>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/25 transition active:scale-95"
              >
                {authLoading ? 'Đang tạo tài khoản...' : 'Tạo Tài Khoản & Bắt Đầu Mua Sắm'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6 relative z-10">
          Tap Take Go — Hệ thống bán lẻ tự động • Node.js + MQTT + WebSockets + VietQR
        </p>
      </div>
    );
  }

  // ==========================================
  // 2. LOGGED-IN SPACE (CUSTOMER OR ADMIN)
  // ==========================================
  const isAdmin = currentUser.role === 'admin';

  return (
    <div className="min-h-screen bg-slate-100/70 flex flex-col text-slate-800 font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-blue-500/20">
              🛒
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 tracking-tight text-lg">TAP TAKE GO</span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {isAdmin ? 'Quản Lý Portal' : 'Khách Hàng Portal'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                {isAdmin ? 'Không gian Quản trị & Giám sát hệ thống' : 'Không gian Mua sắm & Giỏ hàng của bạn'}
              </p>
            </div>
          </div>

          {/* Navigation View Switcher (DEDICATED PER ROLE) */}
          <nav className="flex items-center gap-1 sm:gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            {isAdmin ? (
              /* ADMIN TABS ONLY */
              <>
                <button
                  onClick={() => setCurrentView('admin')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    currentView === 'admin'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Quản Trị & Giám Sát</span>
                </button>

                <button
                  onClick={() => setCurrentView('checkout')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    currentView === 'checkout'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Màn Hình Cửa Ra (Kiosk)</span>
                </button>

                <button
                  onClick={() => setCurrentView('simulator')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    currentView === 'simulator'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                      : 'text-indigo-600 hover:text-indigo-900'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Giả Lập IoT (Quan Sát)</span>
                </button>
              </>
            ) : (
              /* CUSTOMER TABS ONLY (NO ADMIN, NO CHECKOUT KIOSK) */
              <>
                <button
                  onClick={() => setCurrentView('customer')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    currentView === 'customer'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Giỏ Hàng & Thẻ Của Tôi</span>
                </button>

                <button
                  onClick={() => setCurrentView('simulator')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    currentView === 'simulator'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm'
                      : 'text-indigo-600 hover:text-indigo-900'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Thử Nghiệm Mua Sắm (IoT)</span>
                </button>
              </>
            )}
          </nav>

          {/* User Info, Open Parallel Tab & Logout Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.open(window.location.origin, '_blank')}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition border border-slate-300 shadow-sm"
              title="Mở thêm tab mới để đăng nhập song song cả Khách Hàng và Quản Lý!"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
              <span>Mở Tab Song Song</span>
            </button>

            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
              isAdmin
                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                : 'bg-blue-100 text-blue-800 border border-blue-200'
            }`}>
              {isAdmin ? (
                <>
                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Quản Lý:</span> quanly1
                </>
              ) : (
                <>
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span className="max-w-[120px] truncate">{currentUser.name}</span>
                </>
              )}
            </div>

            <button
              onClick={handleLogout}
              title="Đăng xuất khỏi tài khoản"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition flex items-center gap-1 text-xs font-bold"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Đăng Xuất</span>
            </button>

            {/* Socket Dot */}
            <span 
              title={isConnected ? 'Socket.io Đang Kết Nối' : 'Mất Kết Nối'}
              className={`w-2.5 h-2.5 rounded-full ml-1 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} 
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'customer' && !isAdmin && (
          <CustomerPortal user={currentUser} />
        )}

        {currentView === 'admin' && isAdmin && (
          <AdminPortal />
        )}

        {currentView === 'checkout' && isAdmin && (
          <ExitCheckoutKiosk />
        )}

        {currentView === 'simulator' && (
          <HardwareSimulator currentUser={currentUser} isAdmin={isAdmin} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        <p>
          Tap Take Go — Hệ thống bán lẻ thông minh tự động hoá • Đang đăng nhập: <strong>{currentUser.name}</strong> ({isAdmin ? 'Quản Lý' : 'Khách Hàng'})
        </p>
      </footer>
    </div>
  );
}
