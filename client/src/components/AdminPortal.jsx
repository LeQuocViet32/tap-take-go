import React, { useState, useEffect } from 'react';
import { apiFetch, formatVND, socket } from '../services/api';
import { 
  LayoutDashboard, 
  Package, 
  Layers, 
  FileText, 
  Settings as SettingsIcon, 
  Plus, 
  Trash2, 
  Edit3, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  DollarSign, 
  Users, 
  TrendingUp, 
  Save, 
  RotateCcw,
  Sparkles,
  Eye,
  EyeOff,
  Key,
  Shield,
  UserPlus
} from 'lucide-react';

export default function AdminPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [shelves, setShelves] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [showPasswords, setShowPasswords] = useState({});
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [newAccForm, setNewAccForm] = useState({
    name: '',
    phone_number: '',
    password: '',
    rfid_card_id: '',
    role: 'customer'
  });
  const [selectedCustomerHistory, setSelectedCustomerHistory] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activeShopperCount, setActiveShopperCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Form states
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    price: '',
    weight_per_unit: '',
    stock: '',
    image: '',
    category: 'Nước giải khát'
  });
  const [editingProductId, setEditingProductId] = useState(null);

  const [shelfForm, setShelfForm] = useState({
    slot_id: '',
    product_id: '',
    current_total_weight: '',
    expected_unit_weight: ''
  });

  const [settingsForm, setSettingsForm] = useState({
    bank_id: 'MB',
    bank_account: '',
    account_name: '',
    sepay_token: '',
    store_name: '',
    address: ''
  });

  useEffect(() => {
    fetchAll();

    const onShelfUpdated = () => fetchShelves();
    const onPaymentSuccess = () => { fetchOrders(); fetchCustomers(); };
    const onCartUpdated = () => { fetchActiveShoppers(); fetchCustomers(); };
    const onUsersUpdated = () => { fetchCustomers(); fetchActiveShoppers(); };

    socket.on('shelf_updated', onShelfUpdated);
    socket.on('payment_success', onPaymentSuccess);
    socket.on('cart_updated', onCartUpdated);
    socket.on('users_status_updated', onUsersUpdated);

    return () => {
      socket.off('shelf_updated', onShelfUpdated);
      socket.off('payment_success', onPaymentSuccess);
      socket.off('cart_updated', onCartUpdated);
      socket.off('users_status_updated', onUsersUpdated);
    };
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchProducts(), fetchShelves(), fetchOrders(), fetchSettings(), fetchActiveShoppers(), fetchCustomers()]);
    setLoading(false);
  };

  const fetchCustomers = async () => {
    try {
      const res = await apiFetch('/auth/customers-monitoring');
      if (res.data) setCustomers(res.data);
      if (res.all_accounts) setAllAccounts(res.all_accounts);
    } catch (err) {
      console.warn('Error fetching customer monitoring:', err);
    }
  };

  const toggleShowPassword = (id) => {
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleResetUserPassword = async (userId, userName) => {
    const newPass = window.prompt(`Nhập mật khẩu mới cho tài khoản ${userName}:`, '123456');
    if (!newPass) return;
    try {
      await apiFetch(`/auth/users/${userId}/update-password`, {
        method: 'PUT',
        body: JSON.stringify({ password: newPass })
      });
      showNotice(`Đã đổi mật khẩu cho ${userName} thành: ${newPass}`);
      fetchCustomers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa tài khoản "${userName}"?`)) return;
    try {
      await apiFetch(`/auth/users/${userId}`, { method: 'DELETE' });
      showNotice(`Đã xóa tài khoản ${userName}`);
      fetchCustomers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCreateAccountSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/auth/admin/create-account', {
        method: 'POST',
        body: JSON.stringify(newAccForm)
      });
      showNotice(`Đã tạo tài khoản cho ${newAccForm.name}!`);
      setShowAddAccountModal(false);
      setNewAccForm({ name: '', phone_number: '', password: '', rfid_card_id: '', role: 'customer' });
      fetchCustomers();
    } catch (err) {
      alert(err.message);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await apiFetch('/products');
      if (res.data) setProducts(res.data);
    } catch (err) {
      console.warn(err);
    }
  };

  const fetchShelves = async () => {
    try {
      const res = await apiFetch('/shelves');
      if (res.data) setShelves(res.data);
    } catch (err) {
      console.warn(err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await apiFetch('/orders');
      if (res.data) setOrders(res.data);
    } catch (err) {
      console.warn(err);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await apiFetch('/settings');
      if (res.data) {
        setSettings(res.data);
        setSettingsForm(res.data);
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const fetchActiveShoppers = async () => {
    try {
      const res = await apiFetch('/auth/current-shopper');
      setActiveShopperCount(res.data.shopper ? 1 : 0);
    } catch {
      setActiveShopperCount(0);
    }
  };

  // Product CRUD
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      if (editingProductId) {
        await apiFetch(`/products/${editingProductId}`, {
          method: 'PUT',
          body: JSON.stringify(productForm)
        });
        showNotice('Đã cập nhật sản phẩm thành công!');
      } else {
        await apiFetch('/products', {
          method: 'POST',
          body: JSON.stringify(productForm)
        });
        showNotice('Đã tạo sản phẩm mới thành công!');
      }
      setEditingProductId(null);
      setProductForm({ name: '', sku: '', barcode: '', price: '', weight_per_unit: '', stock: '', image: '', category: 'Nước giải khát' });
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditProduct = (prod) => {
    setEditingProductId(prod._id);
    setProductForm({
      name: prod.name,
      sku: prod.sku,
      barcode: prod.barcode || '',
      price: prod.price,
      weight_per_unit: prod.weight_per_unit,
      stock: prod.stock || 0,
      image: prod.image || '',
      category: prod.category || 'Nước giải khát'
    });
    setActiveTab('products');
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa sản phẩm này?')) return;
    try {
      await apiFetch(`/products/${id}`, { method: 'DELETE' });
      showNotice('Đã xóa sản phẩm');
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  // Shelf Slot Actions
  const handleSaveShelf = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/shelves', {
        method: 'POST',
        body: JSON.stringify(shelfForm)
      });
      showNotice(`Đã thêm Kệ/Slot ${shelfForm.slot_id}`);
      setShelfForm({ slot_id: '', product_id: '', current_total_weight: '', expected_unit_weight: '' });
      fetchShelves();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRestockShelf = async (slotId, units = 10) => {
    try {
      await apiFetch(`/shelves/${slotId}/restock`, {
        method: 'POST',
        body: JSON.stringify({ units })
      });
      showNotice(`Đã bổ sung đầy hàng cho kệ ${slotId}`);
      fetchShelves();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteShelf = async (slotId) => {
    if (!window.confirm(`Xóa cấu hình kệ ${slotId}?`)) return;
    try {
      await apiFetch(`/shelves/${slotId}`, { method: 'DELETE' });
      showNotice(`Đã xóa kệ ${slotId}`);
      fetchShelves();
    } catch (err) {
      alert(err.message);
    }
  };

  // Order Refund
  const handleRefundOrder = async (orderId) => {
    const reason = window.prompt('Nhập lý do hoàn tiền/hủy đơn:', 'Khách khiếu nại thao tác nhầm trên kệ');
    if (!reason) return;
    try {
      await apiFetch(`/orders/${orderId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      showNotice('Đã hoàn tiền và hoàn kho sản phẩm thành công!');
      fetchOrders();
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  // Settings Save
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm)
      });
      showNotice('Đã lưu cấu hình tài khoản ngân hàng và SePay!');
      fetchSettings();
    } catch (err) {
      alert(err.message);
    }
  };

  const showNotice = (msg) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  // Computations for dashboard
  const todayRevenue = orders
    .filter((o) => o.payment_status === 'Completed')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  const lowStockShelves = shelves.filter((s) => s.status === 'Needs Restock');

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Quản Trị Tap Take Go</span>
            <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-full uppercase">Admin Portal</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý kho hàng, ánh xạ cảm biến kệ Loadcell HX711, đơn hàng và tài khoản VietQR
          </p>
        </div>

        <div className="flex items-center gap-2">
          {statusMsg && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl animate-fade-in flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4" /> {statusMsg}
            </span>
          )}
          <button
            onClick={fetchAll}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 transition"
            title="Làm mới toàn bộ dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Admin Nav Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-200/70 p-1.5 rounded-2xl">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Dashboard
        </button>

        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'products' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-4 h-4" /> Sản Phẩm ({products.length})
        </button>

        <button
          onClick={() => setActiveTab('shelves')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'shelves' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="w-4 h-4" /> Kệ Hàng & Cảm Biến ({shelves.length})
          {lowStockShelves.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center font-bold">
              {lowStockShelves.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'orders' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" /> Đơn Hàng ({orders.length})
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'customers' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" /> Khách Hàng ({customers.length})
          {customers.filter((c) => c.is_in_store).length > 0 && (
            <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold animate-pulse">
              {customers.filter((c) => c.is_in_store).length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <SettingsIcon className="w-4 h-4" /> Cài Đặt Ngân Hàng & VietQR
        </button>
      </div>

      {/* TAB 1: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* 4 Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Doanh Thu Hôm Nay</p>
                <p className="text-xl font-black text-slate-900">{formatVND(todayRevenue)}</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Tổng Hóa Đơn</p>
                <p className="text-xl font-black text-slate-900">{orders.length} đơn</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Khách Đang Mua Sắm</p>
                <p className="text-xl font-black text-slate-900">{activeShopperCount} khách</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                lowStockShelves.length > 0 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-slate-100 text-slate-600'
              }`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold">Kệ Cần Bổ Sung (Restock)</p>
                <p className={`text-xl font-black ${lowStockShelves.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {lowStockShelves.length} kệ
                </p>
              </div>
            </div>
          </div>

          {/* Shelf Realtime Health Matrix */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" />
                Tình Trạng Trọng Lượng & Hàng Tồn Trên Kệ Thời Gian Thực
              </h3>
              <span className="text-xs text-slate-500 font-mono">ESP32 + Loadcell HX711</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {shelves.map((slot) => {
                const isLow = slot.status === 'Needs Restock';
                return (
                  <div key={slot._id} className={`p-4 rounded-2xl border transition-all ${
                    isLow ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2 py-0.5 rounded">
                        {slot.slot_id}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        isLow ? 'bg-rose-200 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isLow ? 'Sắp Hết' : 'Bình Thường'}
                      </span>
                    </div>

                    <h4 className="font-bold text-slate-800 text-sm truncate">{slot.product?.name || 'Chưa gán SP'}</h4>
                    <p className="text-xs text-slate-500 mb-3">
                      Ước tính còn: <strong className="text-slate-900 font-bold">{slot.estimated_quantity} món</strong>
                    </p>

                    <div className="flex justify-between items-center text-xs font-mono text-slate-600 bg-white p-2 rounded-xl border border-slate-200 mb-3">
                      <span>Cân nặng:</span>
                      <strong className="text-blue-600 font-bold">{slot.current_total_weight}g</strong>
                    </div>

                    {isLow && (
                      <button
                        onClick={() => handleRestockShelf(slot.slot_id, 10)}
                        className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Nạp Đầy Kệ (10 Món)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRODUCTS */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Form: Add / Edit Product */}
          <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-fit">
            <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
              {editingProductId ? <Edit3 className="w-5 h-5 text-blue-600" /> : <Plus className="w-5 h-5 text-blue-600" />}
              {editingProductId ? 'Chỉnh Sửa Sản Phẩm' : 'Thêm Sản Phẩm Mới'}
            </h3>

            <form onSubmit={handleSaveProduct} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Tên sản phẩm *</label>
                <input
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  placeholder="VD: Coca Cola Sleek 330ml"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Mã SKU</label>
                  <input
                    type="text"
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    placeholder="BEV-COCA-330"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Cân nặng chuẩn (g) *</label>
                  <input
                    type="number"
                    required
                    value={productForm.weight_per_unit}
                    onChange={(e) => setProductForm({ ...productForm, weight_per_unit: e.target.value })}
                    placeholder="390"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Đơn giá (VND) *</label>
                  <input
                    type="number"
                    required
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    placeholder="12000"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Số lượng tồn kho</label>
                  <input
                    type="number"
                    value={productForm.stock}
                    onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                    placeholder="20"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Link ảnh sản phẩm</label>
                <input
                  type="text"
                  value={productForm.image}
                  onChange={(e) => setProductForm({ ...productForm, image: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition"
                >
                  {editingProductId ? 'Lưu Thay Đổi' : 'Thêm Vào Kho'}
                </button>
                {editingProductId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProductId(null);
                      setProductForm({ name: '', sku: '', barcode: '', price: '', weight_per_unit: '', stock: '', image: '', category: 'Nước giải khát' });
                    }}
                    className="px-4 py-2.5 bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold"
                  >
                    Hủy
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right Table: Product List */}
          <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <h3 className="font-bold text-slate-900 text-base mb-4">Danh Mục Sản Phẩm ({products.length})</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                  <tr>
                    <th className="p-3 rounded-l-xl">Sản Phẩm</th>
                    <th className="p-3">SKU</th>
                    <th className="p-3">Cân Nặng</th>
                    <th className="p-3">Giá Bán</th>
                    <th className="p-3">Kho</th>
                    <th className="p-3 rounded-r-xl text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-50 transition">
                      <td className="p-3 flex items-center gap-3">
                        <img src={p.image} alt={p.name} className="w-10 h-10 object-cover rounded-lg bg-slate-100 border" />
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                          <span className="text-[10px] text-slate-400">{p.category}</span>
                        </div>
                      </td>
                      <td className="p-3 font-mono">{p.sku}</td>
                      <td className="p-3 font-mono font-bold text-blue-600">{p.weight_per_unit}g</td>
                      <td className="p-3 font-bold text-slate-900">{formatVND(p.price)}</td>
                      <td className="p-3 font-mono">{p.stock}</td>
                      <td className="p-3 text-right space-x-1">
                        <button
                          onClick={() => handleEditProduct(p)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                          title="Sửa"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProduct(p._id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SHELVES */}
      {activeTab === 'shelves' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Add / Map Shelf Slot Form */}
          <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm h-fit">
            <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-600" />
              Thiết Lập Kệ Mới (Slot Mapping)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Ánh xạ mã Node vi điều khiển (VD: <code>NODE_05</code>) tới sản phẩm vật lý trên kệ.
            </p>

            <form onSubmit={handleSaveShelf} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mã Slot / Node ID *</label>
                <input
                  type="text"
                  required
                  value={shelfForm.slot_id}
                  onChange={(e) => setShelfForm({ ...shelfForm, slot_id: e.target.value })}
                  placeholder="VD: NODE_05"
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 font-mono uppercase focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Sản phẩm gán vào kệ *</label>
                <select
                  required
                  value={shelfForm.product_id}
                  onChange={(e) => {
                    const prod = products.find((p) => p._id === e.target.value);
                    setShelfForm({
                      ...shelfForm,
                      product_id: e.target.value,
                      expected_unit_weight: prod ? prod.weight_per_unit : '',
                      current_total_weight: prod ? prod.weight_per_unit * 10 : ''
                    });
                  }}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none"
                >
                  <option value="">-- Chọn sản phẩm --</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({p.weight_per_unit}g)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Trọng lượng ban đầu (g)</label>
                  <input
                    type="number"
                    value={shelfForm.current_total_weight}
                    onChange={(e) => setShelfForm({ ...shelfForm, current_total_weight: e.target.value })}
                    placeholder="3900"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Trọng lượng 1 đơn vị (g)</label>
                  <input
                    type="number"
                    value={shelfForm.expected_unit_weight}
                    onChange={(e) => setShelfForm({ ...shelfForm, expected_unit_weight: e.target.value })}
                    placeholder="390"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition"
              >
                Lưu Ánh Xạ Kệ
              </button>
            </form>
          </div>

          {/* Shelves List */}
          <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <h3 className="font-bold text-slate-900 text-base mb-4">Danh Sách Kệ Đang Hoạt Động ({shelves.length})</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                  <tr>
                    <th className="p-3 rounded-l-xl">Mã Node Slot</th>
                    <th className="p-3">Sản Phẩm Gán</th>
                    <th className="p-3">Cân Nặng Hiện Tại</th>
                    <th className="p-3">Ước Tính SL</th>
                    <th className="p-3">Trạng Thái</th>
                    <th className="p-3 rounded-r-xl text-right">Bổ Sung / Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shelves.map((s) => (
                    <tr key={s._id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-mono font-bold text-blue-600 text-sm">{s.slot_id}</td>
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{s.product?.name || 'Chưa gán'}</p>
                        <span className="text-[10px] text-slate-400">Chuẩn: {s.expected_unit_weight}g/món</span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900">{s.current_total_weight}g</td>
                      <td className="p-3 font-bold text-emerald-600">{s.estimated_quantity} món</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.status === 'Needs Restock' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {s.status === 'Needs Restock' ? 'Cần bổ sung' : 'Active'}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => handleRestockShelf(s.slot_id, 10)}
                          className="px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-bold text-xs transition"
                          title="Bổ sung đầy 10 đơn vị"
                        >
                          Restock +10
                        </button>
                        <button
                          onClick={() => handleDeleteShelf(s.slot_id)}
                          className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Xóa slot"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ORDERS */}
      {activeTab === 'orders' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 text-base">Lịch Sử Đơn Hàng & Xử Lý Sự Cố ({orders.length})</h3>
            <button
              onClick={fetchOrders}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Làm mới
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                <tr>
                  <th className="p-3 rounded-l-xl">Mã Đơn</th>
                  <th className="p-3">Khách Hàng</th>
                  <th className="p-3">Chi Tiết Hàng</th>
                  <th className="p-3">Tổng Tiền</th>
                  <th className="p-3">Trạng Thái</th>
                  <th className="p-3">Thời Gian</th>
                  <th className="p-3 rounded-r-xl text-right">Xử Lý Khiếu Nại</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o) => (
                  <tr key={o._id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-mono font-bold text-blue-600">#{o.order_code}</td>
                    <td className="p-3">
                      <p className="font-bold text-slate-900">{o.customer_name || 'Khách vãng lai'}</p>
                      <span className="text-[10px] text-slate-400">{o.phone_number}</span>
                    </td>
                    <td className="p-3">
                      <ul className="space-y-0.5">
                        {o.items.map((i, idx) => (
                          <li key={idx} className="text-slate-600">
                            • {i.name} x<strong>{i.quantity}</strong>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-3 font-extrabold text-slate-900 text-sm">{formatVND(o.total_amount)}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        o.payment_status === 'Completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : o.payment_status === 'Refunded'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {o.payment_status === 'Completed' ? 'Thành công' : o.payment_status === 'Refunded' ? 'Đã hoàn tiền' : 'Chờ xử lý'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400">{new Date(o.created_at).toLocaleString('vi-VN')}</td>
                    <td className="p-3 text-right">
                      {o.payment_status === 'Completed' ? (
                        <button
                          onClick={() => handleRefundOrder(o._id)}
                          className="px-3 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg font-bold text-xs transition"
                        >
                          Hoàn Tiền / Hủy
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Đã xử lý</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="max-w-2xl bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-600" />
            Cấu Hình Ngân Hàng VietQR & Webhook SePay
          </h3>
          <p className="text-xs text-slate-500 mb-6">
            Thông tin bên dưới dùng để sinh mã QR chuyển khoản động trên màn hình Cửa ra và xác thực Webhook khi có tiền vào tài khoản.
          </p>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mã Ngân Hàng (Bank BIN/Shortcode) *</label>
                <select
                  value={settingsForm.bank_id}
                  onChange={(e) => setSettingsForm({ ...settingsForm, bank_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 font-semibold focus:outline-none"
                >
                  <option value="MB">MBBank (Ngân hàng Quân Đội)</option>
                  <option value="VCB">Vietcombank (Ngoại Thương)</option>
                  <option value="TCB">Techcombank (Kỹ Thương)</option>
                  <option value="ACB">ACB (Á Châu)</option>
                  <option value="TPB">TPBank (Tiên Phong)</option>
                  <option value="VPB">VPBank (Việt Nam Thịnh Vượng)</option>
                  <option value="BIDV">BIDV (Đầu Tư & Phát Triển)</option>
                  <option value="ICB">VietinBank (Công Thương)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Số Tài Khoản Ngân Hàng *</label>
                <input
                  type="text"
                  required
                  value={settingsForm.bank_account}
                  onChange={(e) => setSettingsForm({ ...settingsForm, bank_account: e.target.value })}
                  placeholder="090123456789"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 font-mono font-bold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tên Chủ Tài Khoản (Không dấu) *</label>
              <input
                type="text"
                required
                value={settingsForm.account_name}
                onChange={(e) => setSettingsForm({ ...settingsForm, account_name: e.target.value })}
                placeholder="TAP TAKE GO STORE"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 font-bold uppercase focus:outline-none"
              />
            </div>

            <div className="border-t border-slate-200 pt-4">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                SePay Webhook Token / API Secret
              </label>
              <input
                type="text"
                value={settingsForm.sepay_token}
                onChange={(e) => setSettingsForm({ ...settingsForm, sepay_token: e.target.value })}
                placeholder="Nhập secret token từ SePay dashboard"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 font-mono focus:outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Địa chỉ Webhook cấu hình trên SePay: <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-600 font-bold">http://&lt;domain_hoặc_ngrok&gt;/api/webhook/payment</code>
              </p>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <label className="text-xs font-bold text-slate-700 block mb-1">Tên Cửa Hàng & Địa Chỉ</label>
              <input
                type="text"
                value={settingsForm.store_name}
                onChange={(e) => setSettingsForm({ ...settingsForm, store_name: e.target.value })}
                placeholder="Tap Take Go - Cửa Hàng Số 1"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 mb-2 focus:outline-none"
              />
              <input
                type="text"
                value={settingsForm.address}
                onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                placeholder="Địa chỉ..."
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" /> Lưu Cấu Hình Ngân Hàng
            </button>
          </form>
        </div>
      )}

      {/* TAB 6: CUSTOMERS MONITORING & ACCOUNT DIRECTORY */}
      {activeTab === 'customers' && (
        <div className="space-y-6">
          {/* Top Header Card */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Users className="w-6 h-6 text-blue-600" />
                Danh Mục Tài Khoản, Mật Khẩu & Giám Sát Khách Hàng
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Theo dõi tất cả tài khoản hệ thống (Tên đăng nhập, Mật khẩu, Thẻ RFID), trạng thái khách trong cửa hàng và lịch sử hóa đơn
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowAddAccountModal(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-blue-500/20 active:scale-95"
              >
                <UserPlus className="w-4 h-4" /> + Tạo Tài Khoản Mới
              </button>

              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                {customers.filter((c) => c.is_in_store).length} khách đang trong shop
              </span>

              <button
                onClick={fetchCustomers}
                className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 transition"
                title="Làm mới"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 1. MASTER ACCOUNT & PASSWORD DIRECTORY TABLE */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-600" />
                Bảng Danh Sách Tài Khoản & Mật Khẩu Hệ Thống ({allAccounts.length || customers.length + 1} tài khoản)
              </h4>
              <span className="text-xs text-slate-500">
                Quản lý <code>quanly1</code> có toàn quyền tra cứu & đổi mật khẩu cho người dùng
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                  <tr>
                    <th className="p-3 rounded-l-xl">Họ Và Tên</th>
                    <th className="p-3">Tên Đăng Nhập / SĐT</th>
                    <th className="p-3">Mật Khẩu</th>
                    <th className="p-3">Mã Thẻ RFID</th>
                    <th className="p-3">Vai Trò</th>
                    <th className="p-3">Tình Trạng</th>
                    <th className="p-3 rounded-r-xl text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allAccounts.map((acc) => {
                    const isVisible = showPasswords[acc._id];
                    const isAdmin = acc.role === 'admin';
                    return (
                      <tr key={acc._id} className="hover:bg-slate-50/80 transition">
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                              isAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {acc.name ? acc.name.charAt(0) : 'U'}
                            </div>
                            <span className="font-bold text-slate-900">{acc.name}</span>
                          </div>
                        </td>

                        <td className="p-3 font-mono font-bold text-blue-600 text-xs">
                          {acc.username || acc.phone_number}
                        </td>

                        <td className="p-3">
                          <div className="inline-flex items-center gap-2 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                            <span className="font-mono font-bold text-slate-800">
                              {isVisible ? acc.password : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleShowPassword(acc._id)}
                              className="text-slate-400 hover:text-slate-700 transition"
                              title={isVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                            >
                              {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>

                        <td className="p-3 font-mono font-bold text-slate-700 text-xs">
                          {acc.rfid_card_id}
                        </td>

                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            isAdmin
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {isAdmin ? <Shield className="w-3 h-3 text-indigo-600" /> : <Users className="w-3 h-3" />}
                            {isAdmin ? 'Quản Lý' : 'Khách Hàng'}
                          </span>
                        </td>

                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            acc.is_in_store
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${acc.is_in_store ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            {acc.is_in_store ? 'Trong shop' : 'Ngoài shop'}
                          </span>
                        </td>

                        <td className="p-3 text-right space-x-1.5">
                          <button
                            onClick={() => handleResetUserPassword(acc._id, acc.name)}
                            className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold transition inline-flex items-center gap-1"
                            title="Đổi mật khẩu tài khoản này"
                          >
                            <Key className="w-3 h-3" /> Đổi MK
                          </button>

                          {!isAdmin && (
                            <button
                              onClick={() => handleDeleteUser(acc._id, acc.name)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition inline-flex items-center"
                              title="Xóa tài khoản"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. REALTIME CUSTOMER PRESENCE, LIVE CARTS & ORDER HISTORY */}
          <div>
            <h4 className="font-bold text-slate-900 text-base mb-3 flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-600" />
              Chi Tiết Giỏ Hàng Trực Tiếp & Lịch Sử Mua Sắm Của Từng Khách
            </h4>

            {/* Customer Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {customers.map((c) => {
              const inStore = c.is_in_store;
              const cart = c.current_cart;

              return (
                <div
                  key={c._id}
                  className={`bg-white rounded-3xl p-6 border transition-all shadow-sm ${
                    inStore ? 'border-emerald-400 ring-2 ring-emerald-400/20 shadow-emerald-500/5' : 'border-slate-200'
                  }`}
                >
                  {/* Customer Header */}
                  <div className="flex items-start justify-between pb-4 border-b border-slate-100 gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg ${
                        inStore ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-base">{c.name}</h4>
                        <p className="text-xs text-slate-500 font-mono">SĐT: {c.phone_number}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        inStore
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${inStore ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {inStore ? 'ĐANG Ở TRONG CỬA HÀNG' : 'Ngoài Cửa Hàng'}
                      </span>
                      <p className="text-[10px] text-slate-400 font-mono mt-1">Mã Thẻ: {c.rfid_card_id}</p>
                    </div>
                  </div>

                  {/* Real-time Virtual Cart Section */}
                  <div className="my-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-blue-600" /> Giỏ Hàng Hiện Tại
                      </span>
                      {inStore && cart?.items?.length > 0 && (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          Đang Cầm {cart.items.reduce((s, i) => s + i.quantity, 0)} Món
                        </span>
                      )}
                    </div>

                    {inStore && cart && cart.items && cart.items.length > 0 ? (
                      <div className="space-y-2 mt-2">
                        <div className="divide-y divide-slate-200/60 max-h-36 overflow-y-auto pr-1">
                          {cart.items.map((item, idx) => (
                            <div key={idx} className="py-2 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <img src={item.image} alt={item.name} className="w-8 h-8 rounded-lg object-cover border" />
                                <div>
                                  <p className="font-bold text-slate-800">{item.name}</p>
                                  <span className="text-[10px] text-slate-500">{formatVND(item.price)} x {item.quantity}</span>
                                </div>
                              </div>
                              <span className="font-bold text-blue-600 font-mono">{formatVND(item.subtotal)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs font-bold">
                          <span className="text-slate-600">Tổng giỏ ảo:</span>
                          <span className="text-base text-blue-700 font-black font-mono">{formatVND(cart.total_amount)}</span>
                        </div>
                      </div>
                    ) : inStore ? (
                      <p className="text-xs text-slate-500 italic py-2">Khách đang ở trong cửa hàng nhưng chưa nhặt món nào.</p>
                    ) : (
                      <p className="text-xs text-slate-400 italic py-2">Khách không ở trong cửa hàng (Chưa có giỏ ảo).</p>
                    )}
                  </div>

                  {/* Order History Summary & Action Button */}
                  <div className="pt-2 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-slate-500">Lịch sử: </span>
                      <strong className="text-slate-900">{c.total_orders_count} đơn hàng</strong>
                      <span className="text-slate-400"> • Đã chi: </span>
                      <strong className="text-emerald-600 font-mono">{formatVND(c.total_spent)}</strong>
                    </div>

                    <button
                      onClick={() => setSelectedCustomerHistory(c)}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-xl transition flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" /> Xem Hóa Đơn ({c.total_orders_count})
                    </button>
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {/* Modal Order History Detail */}
          {selectedCustomerHistory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div>
                    <h3 className="font-black text-lg text-slate-900">
                      Lịch Sử Mua Hàng: {selectedCustomerHistory.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">
                      SĐT: {selectedCustomerHistory.phone_number} • Thẻ RFID: {selectedCustomerHistory.rfid_card_id}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedCustomerHistory(null)}
                    className="p-2 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto py-4 space-y-4">
                  {selectedCustomerHistory.orders.length === 0 ? (
                    <p className="text-center text-slate-500 text-sm py-8">Khách hàng này chưa có đơn hàng nào.</p>
                  ) : (
                    selectedCustomerHistory.orders.map((ord) => (
                      <div key={ord._id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <div>
                            <span className="font-mono font-bold text-blue-600">#{ord.order_code}</span>
                            <span className="text-slate-400 ml-2">{new Date(ord.created_at).toLocaleString('vi-VN')}</span>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                            ord.payment_status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {ord.payment_status === 'Completed' ? '✓ Đã thanh toán' : ord.payment_status}
                          </span>
                        </div>

                        <div className="divide-y divide-slate-200/60 text-xs">
                          {ord.items.map((i, idx) => (
                            <div key={idx} className="py-1.5 flex justify-between text-slate-700">
                              <span>• {i.name} (x{i.quantity})</span>
                              <span className="font-mono font-semibold">{formatVND(i.subtotal)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-xs font-bold">
                          <span className="text-slate-600">Tổng hóa đơn:</span>
                          <span className="text-sm font-black text-slate-900 font-mono">{formatVND(ord.total_amount)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-4 border-t border-slate-200 text-right">
                  <button
                    onClick={() => setSelectedCustomerHistory(null)}
                    className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal Create New Account Directly From Admin */}
          {showAddAccountModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-blue-600" />
                    Thêm Tài Khoản Người Dùng Mới
                  </h3>
                  <button
                    onClick={() => setShowAddAccountModal(false)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateAccountSubmit} className="space-y-3 pt-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Họ và tên *</label>
                    <input
                      type="text"
                      required
                      value={newAccForm.name}
                      onChange={(e) => setNewAccForm({ ...newAccForm, name: e.target.value })}
                      placeholder="VD: Hoàng Tuấn Kiệt"
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Số điện thoại / Tên đăng nhập *</label>
                    <input
                      type="text"
                      required
                      value={newAccForm.phone_number}
                      onChange={(e) => setNewAccForm({ ...newAccForm, phone_number: e.target.value })}
                      placeholder="0933445566"
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Mật khẩu *</label>
                    <input
                      type="text"
                      required
                      value={newAccForm.password}
                      onChange={(e) => setNewAccForm({ ...newAccForm, password: e.target.value })}
                      placeholder="123456"
                      className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Mã thẻ RFID (Tùy chọn)</label>
                    <input
                      type="text"
                      value={newAccForm.rfid_card_id}
                      onChange={(e) => setNewAccForm({ ...newAccForm, rfid_card_id: e.target.value })}
                      placeholder="Bỏ trống để tự tạo mã thẻ mới"
                      className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-none"
                    />
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition"
                    >
                      Lưu & Cấp Thẻ
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddAccountModal(false)}
                      className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200"
                    >
                      Hủy
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
