import React, { useState, useEffect, useRef } from 'react';
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
  UserPlus,
  Scale,
  Sliders,
  Grid,
  Cpu,
  X
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

  // Physical Shelves & 3x3 Slot Management State
  const [physicalShelves, setPhysicalShelves] = useState([
    { id: 'SHELF_01', name: 'Kệ Hàng Số 1 (Gian Trưng Bày Chính)', rows: 3, cols: 3 }
  ]);
  const [selectedShelfId, setSelectedShelfId] = useState('SHELF_01');
  const [slotModalData, setSlotModalData] = useState(null); // When not null, opens 3x3 slot config modal
  const [showAddPhysicalShelfModal, setShowAddPhysicalShelfModal] = useState(false);
  const [newPhysicalShelfName, setNewPhysicalShelfName] = useState('');
  const [restockModalSlot, setRestockModalSlot] = useState(null);
  const [restockUnits, setRestockUnits] = useState(1);
  const [restockMode, setRestockMode] = useState('add');

  // Real-time Loadcell Telemetry & Browser Web Serial (USB ESP32) State
  const [sensorReadings, setSensorReadings] = useState({});
  const [usbTargetSlotId, setUsbTargetSlotId] = useState('KH1_1');
  const [usbConnected, setUsbConnected] = useState(false);
  const [usbConnecting, setUsbConnecting] = useState(false);
  const [usbLastLog, setUsbLastLog] = useState(null);
  const [usbError, setUsbError] = useState('');
  const usbPortRef = useRef(null);
  const usbReaderRef = useRef(null);
  const usbKeepReadingRef = useRef(false);
  const usbTargetSlotRef = useRef('KH1_1');

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

    const onShelfUpdated = (payload) => {
      if (payload?.slot?._id) {
        setShelves((prev) => {
          const idx = prev.findIndex((s) => s._id === payload.slot._id || s.slot_id === payload.slot.slot_id);
          if (idx === -1) {
            fetchShelves();
            return prev;
          }
          const next = [...prev];
          next[idx] = { ...next[idx], ...payload.slot, product: payload.product || next[idx].product };
          return next;
        });
      } else {
        fetchShelves();
      }
    };
    const onSensorReading = (telemetry) => {
      if (telemetry?.slot_id) {
        setSensorReadings((prev) => ({ ...prev, [telemetry.slot_id]: telemetry }));
      }
    };
    const onPaymentSuccess = () => { fetchOrders(); fetchCustomers(); };
    const onCartUpdated = () => { fetchActiveShoppers(); fetchCustomers(); };
    const onUsersUpdated = () => { fetchCustomers(); fetchActiveShoppers(); };

    socket.on('shelf_updated', onShelfUpdated);
    socket.on('sensor_reading', onSensorReading);
    socket.on('payment_success', onPaymentSuccess);
    socket.on('cart_updated', onCartUpdated);
    socket.on('users_status_updated', onUsersUpdated);

    return () => {
      socket.off('shelf_updated', onShelfUpdated);
      socket.off('sensor_reading', onSensorReading);
      socket.off('payment_success', onPaymentSuccess);
      socket.off('cart_updated', onCartUpdated);
      socket.off('users_status_updated', onUsersUpdated);
      usbKeepReadingRef.current = false;
      if (usbReaderRef.current) {
        usbReaderRef.current.cancel().catch(() => {});
      }
      if (usbPortRef.current) {
        usbPortRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    usbTargetSlotRef.current = (usbTargetSlotId || 'KH1_1').trim().toUpperCase() || 'KH1_1';
  }, [usbTargetSlotId]);

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
      if (res.sensorReadings) setSensorReadings(res.sensorReadings);
      if (Array.isArray(res.physicalShelves) && res.physicalShelves.length > 0) {
        setPhysicalShelves(res.physicalShelves);
        setSelectedShelfId((prev) =>
          res.physicalShelves.some((ps) => ps.id === prev) ? prev : res.physicalShelves[0].id
        );
      }
    } catch (err) {
      console.warn(err);
    }
  };

  const disconnectUsbScale = async () => {
    usbKeepReadingRef.current = false;
    try {
      if (usbReaderRef.current) {
        await usbReaderRef.current.cancel();
        usbReaderRef.current.releaseLock();
        usbReaderRef.current = null;
      }
    } catch {}
    try {
      if (usbPortRef.current) {
        await usbPortRef.current.close();
        usbPortRef.current = null;
      }
    } catch {}
    setUsbConnected(false);
    setUsbConnecting(false);
  };

  const sendUsbCommand = async (cmd) => {
    const port = usbPortRef.current;
    if (!port?.writable) return;
    try {
      const writer = port.writable.getWriter();
      await writer.write(new TextEncoder().encode(`${cmd}\n`));
      writer.releaseLock();
      showNotice(`Đã gửi lệnh "${cmd}" xuống ESP32 qua USB!`);
    } catch (err) {
      setUsbError(`Không gửi được lệnh xuống ESP32: ${err.message}`);
    }
  };

  const connectUsbScale = async () => {
    if (usbConnected) {
      await disconnectUsbScale();
      return;
    }

    if (!('serial' in navigator)) {
      setUsbError('Trình duyệt không hỗ trợ Web Serial. Hãy dùng Chrome/Edge trên HTTPS hoặc localhost, hoặc chạy file CHAY_CAU_NOI_USB_CAN.bat.');
      return;
    }

    setUsbError('');
    setUsbConnecting(true);

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      usbPortRef.current = port;
      usbKeepReadingRef.current = true;
      setUsbConnected(true);
      setUsbConnecting(false);
      showNotice(`Đã kết nối ESP32 qua USB -> đẩy dữ liệu vào ${usbTargetSlotRef.current}`);

      const decoder = new TextDecoder();
      let buffer = '';
      let lastSentWeight = null;
      let lastSentStable = null;
      let lastSentAt = 0;
      let inFlight = false;

      const reader = port.readable.getReader();
      usbReaderRef.current = reader;

      while (usbKeepReadingRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('{') || !line.endsWith('}')) continue;

          try {
            const parsed = JSON.parse(line);
            if (parsed.weight === undefined) continue;

            const weightVal = Number(parsed.weight);
            if (Number.isNaN(weightVal)) continue;

            const isStable = parsed.stable === undefined ? true : Boolean(parsed.stable);
            const pcsVal = parsed.pcs !== undefined ? Number(parsed.pcs) : null;
            const targetSlot = usbTargetSlotRef.current;

            setUsbLastLog({ slot_id: targetSlot, weight: weightVal, pcs: pcsVal, stable: isStable });

            // Cap nhat UI ngay lap tuc khong can cho phan hoi mang
            const roundedWeight = Math.max(0, Math.round(weightVal * 10) / 10);
            const nowIso = new Date().toISOString();
            setSensorReadings((prev) => ({
              ...prev,
              [targetSlot]: {
                slot_id: targetSlot,
                weight: roundedWeight,
                pcs: pcsVal,
                stable: isStable,
                updated_at: nowIso
              }
            }));
            setShelves((prev) =>
              prev.map((s) => {
                if (s.slot_id !== targetSlot) return s;
                const unitW = s.product?.weight_per_unit || s.expected_unit_weight || 48;
                return {
                  ...s,
                  current_total_weight: roundedWeight,
                  scale_stable: isStable,
                  scale_pcs: pcsVal,
                  last_sensor_at: nowIso,
                  estimated_quantity: unitW > 0 ? Math.round(roundedWeight / unitW) : s.estimated_quantity
                };
              })
            );

            const now = Date.now();
            const weightMoved = lastSentWeight === null || Math.abs(weightVal - lastSentWeight) >= 0.2;
            const stableFlipped = isStable !== lastSentStable;
            const heartbeatDue = now - lastSentAt >= 1500;

            if ((weightMoved || stableFlipped) && now - lastSentAt >= 80 || heartbeatDue) {
              const payload = {
                slot_id: targetSlot,
                weight: weightVal,
                pcs: pcsVal,
                stable: isStable
              };

              if (socket.connected) {
                lastSentWeight = weightVal;
                lastSentStable = isStable;
                lastSentAt = now;
                socket.emit('sensor_reading', payload);
              } else if (!inFlight) {
                inFlight = true;
                lastSentWeight = weightVal;
                lastSentStable = isStable;
                lastSentAt = now;

                apiFetch('/shelves/sensor-reading', {
                  method: 'POST',
                  body: JSON.stringify(payload)
                })
                  .catch((err) => {
                    setUsbError(`Lỗi đẩy dữ liệu cân: ${err.message}`);
                  })
                  .finally(() => {
                    inFlight = false;
                  });
              }
            }
          } catch {
            // Ignore malformed partial JSON lines
          }
        }
      }
    } catch (err) {
      if (err?.name !== 'NotFoundError') {
        setUsbError(
          err?.message?.includes('Failed to open serial port')
            ? 'Không mở được cổng COM (hãy đóng Serial Monitor trong Arduino IDE trước rồi thử lại).'
            : `Lỗi cổng USB Serial: ${err.message}`
        );
      }
    } finally {
      await disconnectUsbScale();
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

  const handleRestoreDefaultProducts = async () => {
    if (!window.confirm('Khôi phục lại danh mục sản phẩm mẫu mặc định (Coca, RedBull, Lay\'s, Aquafina, Vật 48g)?')) return;
    try {
      const res = await apiFetch('/products/restore-defaults', { method: 'POST' });
      showNotice(res.message || 'Đã khôi phục danh mục sản phẩm mẫu!');
      await Promise.all([fetchProducts(), fetchShelves()]);
    } catch (err) {
      alert(err.message);
    }
  };

  // Physical Shelves & 3x3 Slot Helpers
  const getStandardSlotId = (shelfId, slotNum) => {
    const shelfNum = Number(String(shelfId || 'SHELF_01').replace(/\D/g, '')) || 1;
    return `KH${shelfNum}_${slotNum}`;
  };

  const handleCreatePhysicalShelf = async (e) => {
    e.preventDefault();
    if (!newPhysicalShelfName.trim()) return;
    try {
      const res = await apiFetch('/shelves/physical', {
        method: 'POST',
        body: JSON.stringify({ name: newPhysicalShelfName.trim(), rows: 3, cols: 3 })
      });
      setNewPhysicalShelfName('');
      setShowAddPhysicalShelfModal(false);
      showNotice(res.message || 'Đã thêm kệ hàng vật lý mới!');
      await fetchShelves();
      if (res.data?.id) setSelectedShelfId(res.data.id);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeletePhysicalShelf = async (shelfId, shelfName) => {
    if (!window.confirm(`Xóa "${shelfName}" và toàn bộ các cân trên kệ này?`)) return;
    try {
      const res = await apiFetch(`/shelves/physical/${shelfId}`, { method: 'DELETE' });
      showNotice(res.message || `Đã xóa kệ ${shelfName}`);
      await fetchShelves();
    } catch (err) {
      alert(err.message);
    }
  };

  const openSlotConfigModal = (slotNumber, existingSlot = null) => {
    const shelfId = existingSlot?.shelf_id || selectedShelfId || 'SHELF_01';
    const shelfObj = physicalShelves.find((ps) => ps.id === shelfId);
    const defaultProduct = products[0] || null;
    const defaultSlotId = existingSlot?.slot_id || getStandardSlotId(shelfId, slotNumber);
    const liveReading = sensorReadings[defaultSlotId];
    const defaultUnitWeight = existingSlot
      ? existingSlot.expected_unit_weight || existingSlot.product?.weight_per_unit || 48
      : defaultProduct?.weight_per_unit || 48;
    const initialTotalWeight = liveReading
      ? liveReading.weight
      : (existingSlot ? (existingSlot.current_total_weight ?? 0) : defaultUnitWeight);

    setSlotModalData({
      shelf_id: shelfId,
      shelf_name: shelfObj?.name || shelfId,
      slot_number: slotNumber,
      slot_id: defaultSlotId,
      product_id: existingSlot ? (existingSlot.product_id || existingSlot.product?._id || '') : (defaultProduct?._id || ''),
      expected_unit_weight: defaultUnitWeight,
      current_total_weight: initialTotalWeight,
      isCustomProduct: existingSlot ? false : !defaultProduct,
      customProdName: '',
      customProdWeight: '48',
      customProdPrice: '15000',
      isExisting: Boolean(existingSlot)
    });
  };

  const handleSaveSlotConfig = async (e) => {
    e.preventDefault();
    if (!slotModalData) return;

    if (!slotModalData.isCustomProduct && !slotModalData.product_id) {
      alert('Vui lòng chọn một sản phẩm trong danh sách hoặc chuyển sang tab "Tự nhập sản phẩm cho cân"!');
      return;
    }

    try {
      const unitWeight = Number(
        slotModalData.expected_unit_weight || (slotModalData.isCustomProduct ? slotModalData.customProdWeight : 48)
      );
      const payload = {
        shelf_id: slotModalData.shelf_id,
        slot_number: slotModalData.slot_number,
        slot_id: slotModalData.slot_id,
        expected_unit_weight: unitWeight,
        current_total_weight:
          slotModalData.current_total_weight !== '' && slotModalData.current_total_weight !== undefined
            ? Number(slotModalData.current_total_weight)
            : unitWeight
      };

      if (slotModalData.isCustomProduct) {
        payload.product_id = '__NEW_CUSTOM_PRODUCT__';
        payload.product_name = slotModalData.customProdName;
        payload.product_price = Number(slotModalData.customProdPrice) || 15000;
      } else {
        payload.product_id = slotModalData.product_id;
      }

      const res = await apiFetch('/shelves/configure-slot', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setSlotModalData(null);
      showNotice(res.message || 'Đã lưu cấu hình cân thành công!');
      await Promise.all([fetchShelves(), fetchProducts()]);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleClearSlot = async (shelfId, slotNumber, slotId) => {
    if (!window.confirm(`Gỡ cân ${slotId} khỏi Ô ${slotNumber}?`)) return;
    try {
      const res = await apiFetch(`/shelves/slot/${shelfId}/${slotNumber}`, { method: 'DELETE' });
      setSlotModalData(null);
      showNotice(res.message || `Đã giải phóng Ô ${slotNumber}`);
      await fetchShelves();
    } catch (err) {
      alert(err.message);
    }
  };

  const openRestockModal = (slot, mode = 'add', units = 1) => {
    setRestockModalSlot(slot);
    setRestockMode(mode);
    setRestockUnits(units);
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

  const handleRestockShelf = async (slotId, units = 10, mode = 'add') => {
    try {
      const res = await apiFetch(`/shelves/${slotId}/restock`, {
        method: 'POST',
        body: JSON.stringify({ units, mode })
      });
      setRestockModalSlot(null);
      showNotice(res.message || `Đã bổ sung hàng cho kệ ${slotId}`);
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
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-bold text-slate-900 text-base">Danh Mục Sản Phẩm ({products.length})</h3>
              <button
                type="button"
                onClick={handleRestoreDefaultProducts}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                title="Khôi phục lại các sản phẩm mẫu (Coca, RedBull, Lay's, Aquafina, Vật 48g)"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Khôi Phục Sản Phẩm Mẫu
              </button>
            </div>

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

      {/* TAB 3: SHELVES - PHYSICAL SHELVES & 3X3 SCALE MATRIX */}
      {activeTab === 'shelves' && (
        <div className="space-y-6">
          {/* 1. PHYSICAL SHELVES TABS BAR */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" /> Kệ Vật Lý:
              </span>
              {physicalShelves.map((ps) => {
                const isSelected = ps.id === selectedShelfId;
                const shelfSlots = shelves.filter(
                  (s) => (s.shelf_id === ps.id || (!s.shelf_id && ps.id === 'SHELF_01'))
                );
                return (
                  <button
                    key={ps.id}
                    onClick={() => setSelectedShelfId(ps.id)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-105'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span>🏢 {ps.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                        isSelected ? 'bg-blue-700/80 text-blue-100' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {shelfSlots.length}/9 cân
                    </span>
                  </button>
                );
              })}

              <button
                onClick={() => setShowAddPhysicalShelfModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-2xl text-xs font-bold transition"
                title="Thêm kệ hàng vật lý mới"
              >
                <Plus className="w-4 h-4" /> Thêm Kệ Mới
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchShelves}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Làm mới
              </button>
              {physicalShelves.length > 1 && (
                <button
                  onClick={() => {
                    const curr = physicalShelves.find((ps) => ps.id === selectedShelfId);
                    if (curr) handleDeletePhysicalShelf(curr.id, curr.name);
                  }}
                  className="flex items-center gap-1 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition border border-rose-200"
                  title="Xóa kệ hàng vật lý này"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xóa kệ này
                </button>
              )}
            </div>
          </div>

          {/* 2. HARDWARE SCALE TELEMETRY BAR (ESP32 USB SERIAL & WIFI) */}
          <div className="bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className={`w-2.5 h-2.5 rounded-full ${usbConnected ? 'bg-emerald-500 animate-ping' : 'bg-slate-300'}`} />
              <div>
                <div className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                  <span>Kết Nối Trực Tiếp Cân Thực Tế (ESP32 + HX711)</span>
                  {usbConnected && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                      Đang đọc USB 115200 baud
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Cắm ESP32 qua cáp USB (đóng Serial Monitor trước) hoặc nạp firmware WiFi gửi về{' '}
                  <code className="px-1 py-0.5 bg-slate-100 rounded text-blue-700 font-mono">/api/shelves/sensor-reading</code>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-[11px] font-bold text-slate-600">Đẩy vào ô:</label>
              <input
                type="text"
                value={usbTargetSlotId}
                onChange={(e) => setUsbTargetSlotId(e.target.value.toUpperCase())}
                disabled={usbConnected}
                placeholder="KH1_1"
                className="w-24 px-2.5 py-1.5 text-xs font-mono font-black uppercase rounded-xl border border-slate-300 bg-slate-50 text-blue-700 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={connectUsbScale}
                disabled={usbConnecting}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                  usbConnected
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                {usbConnecting ? 'Đang mở cổng...' : usbConnected ? 'Ngắt Cân USB' : 'Kết Nối Cân USB'}
              </button>
              {usbConnected && (
                <button
                  type="button"
                  onClick={() => sendUsbCommand('t')}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition"
                  title="Gửi lệnh Tare (về 0g) xuống ESP32"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Tare 0g
                </button>
              )}
              {usbLastLog && (
                <span className="px-2.5 py-1 bg-slate-900 text-emerald-300 rounded-xl text-[11px] font-mono font-bold">
                  {usbLastLog.slot_id}: {usbLastLog.weight}g {usbLastLog.stable ? '●' : '⏳'}
                </span>
              )}
            </div>
          </div>

          {usbError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2.5 rounded-2xl text-xs font-semibold flex items-center justify-between">
              <span>⚠️ {usbError}</span>
              <button onClick={() => setUsbError('')} className="text-rose-500 hover:text-rose-800 font-bold ml-3">✕</button>
            </div>
          )}

          {/* 3. ACTIVE SHELF OVERVIEW BANNER */}
          {(() => {
            const currentShelf = physicalShelves.find((ps) => ps.id === selectedShelfId) || physicalShelves[0] || {
              id: 'SHELF_01',
              name: 'Kệ Hàng Số 1'
            };
            const currentShelfSlots = shelves.filter(
              (s) => (s.shelf_id === currentShelf.id || (!s.shelf_id && currentShelf.id === 'SHELF_01'))
            );
            const totalWeight = currentShelfSlots.reduce((sum, s) => sum + (Number(s.current_total_weight) || 0), 0);
            const totalItems = currentShelfSlots.reduce((sum, s) => sum + (Number(s.estimated_quantity) || 0), 0);
            const restockCount = currentShelfSlots.filter((s) => s.status === 'Needs Restock').length;

            return (
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-blue-500/10 pointer-events-none blur-3xl rounded-full" />
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="px-2.5 py-1 bg-blue-500/30 text-blue-300 border border-blue-400/40 rounded-xl text-xs font-mono font-bold tracking-wider">
                        {currentShelf.id}
                      </span>
                      <h2 className="text-xl font-black text-white flex items-center gap-2">
                        {currentShelf.name} — MA TRẬN 3x3 CẢM BIẾN CÂN
                      </h2>
                    </div>
                    <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                      💡 <strong>Mô hình định danh 1:1:</strong> Mỗi ô trong ma trận 3x3 đại diện cho 1 chiếc cân Loadcell vật lý (Node ID). Bạn chỉ cần cấu hình sản phẩm và khối lượng chuẩn (g) ở chiếc cân đó để cân nặng và số lượng không bao giờ bị hiểu nhầm!
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-center min-w-[100px]">
                      <span className="text-[10px] uppercase font-bold text-slate-300 block">Số Cân Đã Gắn</span>
                      <strong className="text-lg font-black text-emerald-400 font-mono">
                        {currentShelfSlots.length} / 9
                      </strong>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-center min-w-[110px]">
                      <span className="text-[10px] uppercase font-bold text-slate-300 block">Tổng Tải Trọng</span>
                      <strong className="text-lg font-black text-blue-300 font-mono">
                        {totalWeight.toLocaleString()}g
                      </strong>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-center min-w-[100px]">
                      <span className="text-[10px] uppercase font-bold text-slate-300 block">Tổng Số Lượng</span>
                      <strong className="text-lg font-black text-amber-300 font-mono">
                        {totalItems} món
                      </strong>
                    </div>
                    {restockCount > 0 && (
                      <div className="bg-rose-500/20 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-rose-400/30 text-center">
                        <span className="text-[10px] uppercase font-bold text-rose-300 block">Cảnh Báo Hết</span>
                        <strong className="text-lg font-black text-rose-400 font-mono">
                          {restockCount} ô
                        </strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 3. THE 3X3 GRID MATRIX (9 PHYSICAL SCALE SLOTS) */}
          <div className="space-y-6">
            {[
              { rowNum: 1, title: 'TẦNG 1 (HÀNG TRÊN CÙNG)', slots: [1, 2, 3] },
              { rowNum: 2, title: 'TẦNG 2 (HÀNG GIỮA)', slots: [4, 5, 6] },
              { rowNum: 3, title: 'TẦNG 3 (HÀNG DƯỚI CÙNG)', slots: [7, 8, 9] }
            ].map((row) => (
              <div key={row.rowNum} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600">
                    {row.title}
                  </h4>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {row.slots.map((slotNum) => {
                    const slot = shelves.find(
                      (s) =>
                        (s.shelf_id === selectedShelfId || (!s.shelf_id && selectedShelfId === 'SHELF_01')) &&
                        Number(s.slot_number) === slotNum
                    );

                    // CASE A: SLOT HAS CONFIGURED SCALE
                    if (slot) {
                      const isLowStock = slot.status === 'Needs Restock';
                      const prodName = slot.product?.name || 'Sản phẩm chưa đặt tên';
                      const prodImage = slot.product?.image;
                      const liveTelemetry = sensorReadings[slot.slot_id];
                      const hasLiveSensor = Boolean(liveTelemetry || slot.last_sensor_at);
                      const isScaleStable = liveTelemetry?.stable ?? slot.scale_stable ?? true;
                      const displayWeight = Number(slot.current_total_weight || 0).toLocaleString('vi-VN', {
                        maximumFractionDigits: 1
                      });

                      return (
                        <div
                          key={slotNum}
                          className={`bg-white rounded-3xl p-5 border transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between relative group ${
                            isLowStock
                              ? 'border-rose-300 ring-2 ring-rose-100'
                              : 'border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          {/* Card Header */}
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 bg-slate-900 text-white font-mono font-bold text-xs rounded-xl shadow-sm">
                                  Ô {String(slotNum).padStart(2, '0')}
                                </span>
                                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 font-mono font-extrabold text-xs rounded-xl flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                  {slot.slot_id}
                                </span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isLowStock
                                    ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                    : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {isLowStock ? '⚠️ Cần bổ sung' : '✓ Hoạt động'}
                              </span>
                            </div>

                            {/* Product Info */}
                            <div className="flex items-start gap-3 my-3">
                              {prodImage ? (
                                <img
                                  src={prodImage}
                                  alt={prodName}
                                  className="w-14 h-14 object-cover rounded-2xl border border-slate-100 shadow-sm shrink-0"
                                />
                              ) : (
                                <div className="w-14 h-14 bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 rounded-2xl flex items-center justify-center font-bold text-xl shrink-0 border border-blue-200/60 shadow-sm">
                                  📦
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <h4
                                  className="font-black text-slate-900 text-sm leading-snug line-clamp-2"
                                  title={prodName}
                                >
                                  {prodName}
                                </h4>
                                <p className="text-xs font-extrabold text-blue-600 mt-1">
                                  {formatVND(slot.product?.price || 0)}
                                </p>
                              </div>
                            </div>

                            {/* Scale Calibration & Metrics Grid */}
                            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center my-3">
                              <div>
                                <span className="text-[10px] text-slate-500 block font-medium">Chuẩn 1 món</span>
                                <strong className="text-xs font-mono font-extrabold text-slate-800">
                                  {slot.expected_unit_weight || 48}g
                                </strong>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 block font-medium">
                                  Tải trọng cân {hasLiveSensor ? (isScaleStable ? '●' : '⏳') : ''}
                                </span>
                                <strong className="text-xs font-mono font-extrabold text-blue-600">
                                  {displayWeight}g
                                </strong>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 block font-medium">Ước tính SL</span>
                                <strong className="text-xs font-mono font-black text-emerald-600">
                                  {slot.estimated_quantity || 0} món
                                </strong>
                              </div>
                            </div>
                          </div>

                          {/* Card Footer Actions */}
                          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5 flex-wrap">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleRestockShelf(slot.slot_id, 1, 'add')}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition border border-emerald-200"
                                title="Thêm nhanh 1 món (+1)"
                              >
                                +1
                              </button>
                              <button
                                onClick={() => handleRestockShelf(slot.slot_id, 2, 'add')}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition border border-emerald-200"
                                title="Thêm nhanh 2 món (+2)"
                              >
                                +2
                              </button>
                              <button
                                onClick={() => openRestockModal(slot)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                                title="Bổ sung số lượng tùy ý"
                              >
                                Bổ sung...
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openSlotConfigModal(slotNum, slot)}
                                className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition border border-blue-200 flex items-center gap-1"
                                title="Cấu hình lại chiếc cân này (sản phẩm, khối lượng chuẩn, mã Node)"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> Sửa
                              </button>
                              <button
                                onClick={() => handleClearSlot(selectedShelfId, slotNum, slot.slot_id)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition"
                                title="Giải phóng / Gỡ cân khỏi ô này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // CASE B: EMPTY SLOT (NO SCALE CONFIGURED YET)
                    const standardSlotId = getStandardSlotId(selectedShelfId, slotNum);
                    const unconfiguredLive = sensorReadings[standardSlotId];

                    return (
                      <div
                        key={slotNum}
                        onClick={() => openSlotConfigModal(slotNum, null)}
                        className={`rounded-3xl p-6 border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center text-center cursor-pointer min-h-[260px] group shadow-inner ${
                          unconfiguredLive
                            ? 'bg-emerald-50/50 hover:bg-emerald-50 border-emerald-300 hover:border-emerald-500'
                            : 'bg-slate-50/70 hover:bg-blue-50/40 border-slate-300 hover:border-blue-400'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-3">
                          <span className="px-2.5 py-1 bg-slate-200 text-slate-700 font-mono font-bold text-xs rounded-xl">
                            Ô {String(slotNum).padStart(2, '0')}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-mono text-[11px] font-black border border-blue-200 flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${unconfiguredLive ? 'bg-emerald-500 animate-ping' : 'bg-blue-500'}`} />
                            {standardSlotId}
                          </span>
                        </div>

                        <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:border-blue-300 group-hover:scale-110 transition shadow-sm my-2">
                          <Scale className="w-7 h-7" />
                        </div>

                        <h4 className="font-bold text-slate-700 text-sm group-hover:text-blue-700 transition">
                          Ô Trống — Chưa Gắn Cân
                        </h4>

                        {unconfiguredLive ? (
                          <div className="my-2 px-3 py-1.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-mono font-extrabold">
                            📡 Đang đo thực tế: {unconfiguredLive.weight}g ({unconfiguredLive.stable ? 'Ổn định' : 'Đang cân'})
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 max-w-[200px] mt-1 mb-4">
                            Chiếc cân vật lý mặc định: <strong className="font-mono text-blue-600">{standardSlotId}</strong>
                          </p>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openSlotConfigModal(slotNum, null);
                          }}
                          className="px-4 py-2 bg-white hover:bg-blue-600 text-blue-700 hover:text-white rounded-xl text-xs font-bold border border-blue-300 shadow-sm transition flex items-center gap-1.5 mt-1"
                        >
                          <Plus className="w-4 h-4" /> Gắn Cân {standardSlotId}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* 4. EXPANDABLE SUMMARY TABLE OF ALL CONFIGURED SCALES */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
              <Grid className="w-5 h-5 text-blue-600" /> Bảng Tổng Hợp Chi Tiết Tất Cả Chiếc Cân ({shelves.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-800 uppercase font-bold text-[11px]">
                  <tr>
                    <th className="p-3 rounded-l-xl">Kệ & Vị Trí</th>
                    <th className="p-3">Mã Node Cân</th>
                    <th className="p-3">Sản Phẩm Gán</th>
                    <th className="p-3">Cân Nặng Đơn Vị</th>
                    <th className="p-3">Tải Trọng Hiện Tại</th>
                    <th className="p-3">Ước Tính SL</th>
                    <th className="p-3">Trạng Thái</th>
                    <th className="p-3 rounded-r-xl text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shelves.map((s) => {
                    const parentShelf = physicalShelves.find((ps) => ps.id === s.shelf_id);
                    return (
                      <tr key={s._id} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-semibold text-slate-900">
                          {parentShelf?.name || s.shelf_id || 'Kệ 1'} • Ô {s.slot_number || '—'}
                        </td>
                        <td className="p-3 font-mono font-bold text-blue-600 text-sm">{s.slot_id}</td>
                        <td className="p-3">
                          <p className="font-bold text-slate-900">{s.product?.name || 'Chưa gán'}</p>
                          <span className="text-[10px] text-blue-600 font-bold">{formatVND(s.product?.price || 0)}</span>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800">{s.expected_unit_weight || 48}g</td>
                        <td className="p-3 font-mono font-bold text-blue-600">{s.current_total_weight || 0}g</td>
                        <td className="p-3 font-bold text-emerald-600">{s.estimated_quantity || 0} món</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              s.status === 'Needs Restock' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {s.status === 'Needs Restock' ? 'Cần bổ sung' : 'Active'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              onClick={() => handleRestockShelf(s.slot_id, 1, 'add')}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-bold text-xs transition border border-emerald-200"
                              title="Thêm nhanh 1 món (+1)"
                            >
                              +1
                            </button>
                            <button
                              onClick={() => openRestockModal(s, 'add', 1)}
                              className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold text-xs transition border border-blue-200"
                              title="Bổ sung số lượng"
                            >
                              Bổ sung...
                            </button>
                            <button
                              onClick={() => openSlotConfigModal(s.slot_number || 1, s)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Chỉnh sửa cân"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteShelf(s.slot_id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition ml-1"
                              title="Xóa slot"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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

                  </div>
      )}

      {/* ======================================================== */}
      {/* GLOBAL MODALS (RENDERED AT ROOT LEVEL, WORKS ON ANY TAB) */}
      {/* ======================================================== */}

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

      {/* MODAL: CẤU HÌNH CHIẾC CÂN CHO Ô 3X3 (SLOT CONFIG MODAL) */}
      {slotModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Cấu Hình Cân Cho Ô {slotModalData.slot_number}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {slotModalData.shelf_name} • Định danh 1:1 Chiếc Cân & Sản Phẩm
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSlotModalData(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSlotConfig} className="space-y-4 pt-4">
              {/* Mã Cân Node ID (Chuẩn hóa KH1_1, KH1_2...) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-blue-600" /> Mã Định Danh Của Cân (Node ID) *
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setSlotModalData({
                        ...slotModalData,
                        slot_id: getStandardSlotId(slotModalData.shelf_id, slotModalData.slot_number)
                      })
                    }
                    className="text-[10px] text-blue-600 hover:underline font-mono font-bold bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200"
                    title="Bấm để đặt mã chuẩn tự động"
                  >
                    Dùng chuẩn: {getStandardSlotId(slotModalData.shelf_id, slotModalData.slot_number)}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={slotModalData.slot_id}
                    onChange={(e) =>
                      setSlotModalData({
                        ...slotModalData,
                        slot_id: e.target.value.toUpperCase()
                      })
                    }
                    placeholder={getStandardSlotId(slotModalData.shelf_id, slotModalData.slot_number)}
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 font-mono font-black uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none bg-slate-50 text-blue-700"
                  />
                  <Cpu className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  💡 Khớp với <code>SHELF_SLOT_ID = "{slotModalData.slot_id}"</code> trong code ESP32 của bạn.
                </p>
              </div>

              {/* Chọn Hình Thức Gán Sản Phẩm: Có Sẵn Hoặc Tự Nhập */}
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  Sản phẩm gán vào chiếc cân này *
                </label>

                <div className="flex rounded-2xl bg-slate-100 p-1 mb-3">
                  <button
                    type="button"
                    onClick={() => setSlotModalData({ ...slotModalData, isCustomProduct: false })}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      !slotModalData.isCustomProduct
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" /> Chọn từ kho ({products.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlotModalData({ ...slotModalData, isCustomProduct: true })}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      slotModalData.isCustomProduct
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Tự nhập sản phẩm cho cân
                  </button>
                </div>

                {!slotModalData.isCustomProduct ? (
                  <div>
                    {products.length > 0 ? (
                      <select
                        value={slotModalData.product_id}
                        onChange={(e) => {
                          const val = e.target.value;
                          const prod = products.find((p) => p._id === val);
                          setSlotModalData({
                            ...slotModalData,
                            product_id: val,
                            expected_unit_weight: prod ? prod.weight_per_unit : slotModalData.expected_unit_weight,
                            current_total_weight: prod ? prod.weight_per_unit : slotModalData.current_total_weight
                          });
                        }}
                        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-medium"
                      >
                        <option value="">-- Chọn một sản phẩm trong danh sách --</option>
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name} ({p.weight_per_unit}g) — {formatVND(p.price || 0)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 flex items-center justify-between">
                        <span>Kho hàng đang trống (chưa có sản phẩm).</span>
                        <button
                          type="button"
                          onClick={handleRestoreDefaultProducts}
                          className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold"
                        >
                          Khôi phục mẫu
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-gradient-to-br from-blue-50/80 to-indigo-50/80 border border-blue-200 rounded-2xl space-y-3 animate-fade-in shadow-inner">
                    <div className="flex items-center gap-1.5 text-xs font-black text-blue-900 uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-blue-600" /> Nhập Sản Phẩm Trực Tiếp Cho Cân
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                        Tên sản phẩm *
                      </label>
                      <input
                        type="text"
                        required
                        value={slotModalData.customProdName}
                        onChange={(e) =>
                          setSlotModalData({ ...slotModalData, customProdName: e.target.value })
                        }
                        placeholder="VD: Vật mẫu cân 48g, Bánh quy, Nước ngọt..."
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none bg-white font-medium"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                          Khối lượng chuẩn 1 món (g) *
                        </label>
                        <input
                          type="number"
                          required
                          value={slotModalData.customProdWeight}
                          onChange={(e) => {
                            const w = e.target.value;
                            setSlotModalData({
                              ...slotModalData,
                              customProdWeight: w,
                              expected_unit_weight: w,
                              current_total_weight: w
                            });
                          }}
                          placeholder="48"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono font-bold focus:outline-none bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-0.5">
                          Giá bán (VNĐ) *
                        </label>
                        <input
                          type="number"
                          required
                          value={slotModalData.customProdPrice}
                          onChange={(e) =>
                            setSlotModalData({ ...slotModalData, customProdPrice: e.target.value })
                          }
                          placeholder="15000"
                          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono font-bold focus:outline-none bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Hiệu Chuẩn Khối Lượng Tịnh & Tải Trọng Đang Đo */}
              <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Khối lượng chuẩn 1 món (g) *
                  </label>
                  <input
                    type="number"
                    required
                    value={slotModalData.expected_unit_weight}
                    onChange={(e) =>
                      setSlotModalData({
                        ...slotModalData,
                        expected_unit_weight: e.target.value
                      })
                    }
                    placeholder="48"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono font-black focus:outline-none bg-white text-slate-900"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Dùng chia độ lệch tải trọng
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-slate-700 block">
                      Tải trọng hiện tại trên cân (g)
                    </label>
                    {sensorReadings[slotModalData.slot_id] && (
                      <button
                        type="button"
                        onClick={() =>
                          setSlotModalData({
                            ...slotModalData,
                            current_total_weight: sensorReadings[slotModalData.slot_id].weight
                          })
                        }
                        className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded"
                      >
                        Đọc cân: {sensorReadings[slotModalData.slot_id].weight}g
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={slotModalData.current_total_weight}
                    onChange={(e) =>
                      setSlotModalData({
                        ...slotModalData,
                        current_total_weight: e.target.value
                      })
                    }
                    placeholder="48"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono font-black focus:outline-none bg-white text-blue-600"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Vật đang đặt trên cân thực tế
                  </span>
                </div>
              </div>

              {/* Dự tính số lượng */}
              <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800">
                <span className="font-semibold">Dự tính số lượng trên cân:</span>
                <strong className="font-mono font-black text-sm text-emerald-900">
                  {slotModalData.expected_unit_weight > 0
                    ? Math.round(Number(slotModalData.current_total_weight || 0) / Number(slotModalData.expected_unit_weight))
                    : 0}{' '}
                  món
                </strong>
              </div>

              {/* Buttons */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" /> Lưu Cấu Hình Chiếc Cân
                </button>
                {slotModalData.isExisting && (
                  <button
                    type="button"
                    onClick={() =>
                      handleClearSlot(
                        slotModalData.shelf_id,
                        slotModalData.slot_number,
                        slotModalData.slot_id
                      )
                    }
                    className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1"
                    title="Giải phóng ô này"
                  >
                    <Trash2 className="w-4 h-4" /> Gỡ cân
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSlotModalData(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: THÊM KỆ HÀNG VẬT LÝ MỚI */}
      {showAddPhysicalShelfModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-blue-600" /> Thêm Kệ Hàng Vật Lý Mới
              </h3>
              <button
                onClick={() => setShowAddPhysicalShelfModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePhysicalShelf} className="space-y-4 pt-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Tên Kệ Hàng Mới *
                </label>
                <input
                  type="text"
                  required
                  value={newPhysicalShelfName}
                  onChange={(e) => setNewPhysicalShelfName(e.target.value)}
                  placeholder="VD: Kệ Số 2 (Gian Đồ Uống & Bánh Snack)"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Hệ thống sẽ tự động khởi tạo ma trận 3 tầng x 3 ô (9 vị trí cân Loadcell) cho kệ này.
                </p>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition"
                >
                  Xác Nhận Tạo Kệ
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddPhysicalShelfModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BỔ SUNG HÀNG VÀO KỆ */}
      {restockModalSlot && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Bổ Sung Hàng Vào Kệ</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Slot: {restockModalSlot.slot_id} • {restockModalSlot.product?.name || 'Sản phẩm'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRestockModalSlot(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <div className="my-4 p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500 block">Hiện tại trên kệ:</span>
                <strong className="text-slate-900 text-sm">{restockModalSlot.estimated_quantity} món</strong>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Trọng lượng cảm biến:</span>
                <strong className="text-blue-600 font-mono text-sm">{restockModalSlot.current_total_weight}g</strong>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Hình thức thao tác</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRestockMode('add')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      restockMode === 'add'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    ➕ Xếp thêm vào kệ (+N)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestockMode('set')}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      restockMode === 'set'
                        ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🎯 Đặt lại tổng số (=N)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  {restockMode === 'add' ? 'Chọn nhanh số món xếp thêm:' : 'Chọn nhanh tổng số lượng:'}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 5, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setRestockUnits(num)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition border ${
                        restockUnits === num
                          ? 'bg-blue-600 text-white border-blue-600 shadow'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-transparent'
                      }`}
                    >
                      {restockMode === 'add' ? `+${num} món` : `${num} món`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {restockMode === 'add' ? 'Hoặc tự nhập số món thêm vào:' : 'Hoặc tự nhập tổng số món:'}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={restockUnits}
                  onChange={(e) => setRestockUnits(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-2xl text-xs text-emerald-800">
                <span className="font-semibold block">Dự tính sau khi lưu:</span>
                <strong className="text-sm font-bold text-emerald-900">
                  {restockMode === 'add' 
                    ? (restockModalSlot.estimated_quantity + restockUnits) 
                    : restockUnits} món
                </strong>
                {' '}(~
                {((restockMode === 'add' 
                  ? (restockModalSlot.estimated_quantity + restockUnits) 
                  : restockUnits) * (restockModalSlot.expected_unit_weight || 100))}g)
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRestockShelf(restockModalSlot.slot_id, restockUnits, restockMode)}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md transition"
                >
                  {restockMode === 'add' ? `Xác nhận thêm +${restockUnits} món` : `Xác nhận đặt ${restockUnits} món`}
                </button>
                <button
                  type="button"
                  onClick={() => setRestockModalSlot(null)}
                  className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-200"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
