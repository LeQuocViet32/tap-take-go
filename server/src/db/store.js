import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial sample data
const initialData = {
  users: [
    {
      _id: 'usr_admin',
      username: 'quanly1',
      phone_number: 'quanly1',
      password: 'quanly1',
      rfid_card_id: 'RFID_ADMIN_01',
      name: 'Quản Lý Cửa Hàng 1',
      role: 'admin',
      is_in_store: false,
      created_at: new Date('2026-11-01T00:00:00Z').toISOString()
    }
  ],
  products: [
    {
      _id: 'prod_001',
      sku: 'BEV-COCA-330',
      barcode: '8934567890123',
      name: 'Coca Cola Sleek 330ml',
      image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&auto=format&fit=crop&q=80',
      weight_per_unit: 390, // gram
      price: 12000,
      stock: 24,
      category: 'Nước giải khát'
    },
    {
      _id: 'prod_002',
      sku: 'BEV-REDBULL-250',
      barcode: '8934567890124',
      name: 'Nước tăng lực Red Bull 250ml',
      image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&auto=format&fit=crop&q=80',
      weight_per_unit: 280, // gram
      price: 15000,
      stock: 20,
      category: 'Nước giải khát'
    },
    {
      _id: 'prod_003',
      sku: 'SNK-LAYS-060',
      barcode: '8934567890125',
      name: "Snack Khoai Tây Lay's Tảo Biển 60g",
      image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&auto=format&fit=crop&q=80',
      weight_per_unit: 65, // gram (bao gồm bao bì)
      price: 16000,
      stock: 15,
      category: 'Bánh snack'
    },
    {
      _id: 'prod_004',
      sku: 'BEV-AQUA-500',
      barcode: '8934567890126',
      name: 'Nước khoáng thiên nhiên Aquafina 500ml',
      image: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=400&auto=format&fit=crop&q=80',
      weight_per_unit: 520, // gram
      price: 8000,
      stock: 30,
      category: 'Nước đóng chai'
    }
  ],
  shelfSlots: [
    {
      _id: 'slot_001',
      shelf_id: 'SHELF_01',
      slot_number: 1,
      slot_id: 'NODE_01',
      product_id: 'prod_001',
      current_total_weight: 3900, // 10 lon x 390g
      expected_unit_weight: 390,
      status: 'Active',
      last_updated: new Date().toISOString()
    },
    {
      _id: 'slot_002',
      shelf_id: 'SHELF_01',
      slot_number: 2,
      slot_id: 'NODE_02',
      product_id: 'prod_002',
      current_total_weight: 2800, // 10 lon x 280g
      expected_unit_weight: 280,
      status: 'Active',
      last_updated: new Date().toISOString()
    },
    {
      _id: 'slot_003',
      shelf_id: 'SHELF_01',
      slot_number: 3,
      slot_id: 'NODE_03',
      product_id: 'prod_003',
      current_total_weight: 650, // 10 gói x 65g
      expected_unit_weight: 65,
      status: 'Active',
      last_updated: new Date().toISOString()
    },
    {
      _id: 'slot_004',
      shelf_id: 'SHELF_01',
      slot_number: 4,
      slot_id: 'NODE_04',
      product_id: 'prod_004',
      current_total_weight: 5200, // 10 chai x 520g
      expected_unit_weight: 520,
      status: 'Active',
      last_updated: new Date().toISOString()
    }
  ],
  physicalShelves: [
    {
      id: 'SHELF_01',
      name: 'Kệ Hàng Số 1 (Gian Trưng Bày Chính)',
      description: 'Kệ 3 tầng x 3 ô (9 vị trí cảm biến cân)',
      rows: 3,
      cols: 3,
      created_at: new Date('2026-11-01T00:00:00Z').toISOString()
    }
  ],
  virtualCarts: [],
  orders: [],
  settings: {
    bank_id: 'MB', // MBBank
    bank_account: '090123456789',
    account_name: 'TAP TAKE GO STORE',
    sepay_token: 'tap_take_go_secret_demo',
    store_name: 'Tap Take Go - Cửa hàng Số 1',
    address: 'Khu Công Nghệ Cao, TP. Thủ Đức, TP. Hồ Chí Minh'
  },
  activeGate: {
    entryGateOpen: false,
    exitGateOpen: false,
    activeShopperId: null,
    lastEntryTime: null
  }
};

class Store {
  constructor() {
    this.data = this.loadData();
    this.isMongoConnected = false;
  }

  loadData() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);

        // Ensure admin user exists
        if (!parsed.users) parsed.users = [];
        const hasAdmin = parsed.users.some((u) => u.username === 'quanly1' || u.phone_number === 'quanly1');
        if (!hasAdmin) {
          parsed.users.unshift({
            _id: 'usr_admin',
            username: 'quanly1',
            phone_number: 'quanly1',
            password: 'quanly1',
            rfid_card_id: 'RFID_ADMIN_01',
            name: 'Quản Lý Cửa Hàng 1',
            role: 'admin',
            is_in_store: false,
            created_at: new Date('2026-11-01T00:00:00Z').toISOString()
          });
        }

        // Ensure customers have passwords & roles
        parsed.users.forEach((u) => {
          if (!u.role) u.role = (u.username === 'quanly1' || u.phone_number === 'quanly1') ? 'admin' : 'customer';
          if (!u.password) u.password = u.role === 'admin' ? 'quanly1' : '123';
          if (u.is_in_store === undefined) u.is_in_store = false;
        });

        // Ensure physicalShelves exists
        if (!parsed.physicalShelves || !Array.isArray(parsed.physicalShelves) || parsed.physicalShelves.length === 0) {
          parsed.physicalShelves = [
            {
              id: 'SHELF_01',
              name: 'Kệ Hàng Số 1 (Gian Trưng Bày Chính)',
              description: 'Kệ 3 tầng x 3 ô (9 vị trí cảm biến cân)',
              rows: 3,
              cols: 3,
              created_at: new Date('2026-11-01T00:00:00Z').toISOString()
            }
          ];
        }

        // Ensure shelfSlots have shelf_id and slot_number (1 to 9)
        if (!parsed.shelfSlots) parsed.shelfSlots = [];
        const usedSlotNumbers = new Set();
        parsed.shelfSlots.forEach((slot, idx) => {
          if (!slot.shelf_id) slot.shelf_id = 'SHELF_01';
          if (!slot.slot_number) {
            let num = idx + 1;
            while (num <= 9 && usedSlotNumbers.has(num)) num++;
            slot.slot_number = num <= 9 ? num : idx + 1;
          }
          usedSlotNumbers.add(slot.slot_number);
        });

        this.saveData(parsed);
        return parsed;
      }
    } catch (err) {
      console.warn('Could not read existing store.json, using initial defaults:', err.message);
    }
    this.saveData(initialData);
    return JSON.parse(JSON.stringify(initialData));
  }

  saveData(dataToSave = this.data) {
    try {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving store.json:', err.message);
    }
  }

  saveDataDebounced(delayMs = 500) {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      fs.promises
        .writeFile(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8')
        .catch((err) => console.error('Error saving store.json:', err.message));
    }, delayMs);
  }

  async initMongo(uri) {
    if (!uri) return false;
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
      this.isMongoConnected = true;
      console.log(' Connected to MongoDB Atlas/Local successfully.');
      return true;
    } catch (err) {
      console.warn(' MongoDB connection skipped or failed, using local file store:', err.message);
      this.isMongoConnected = false;
      return false;
    }
  }
}

export const store = new Store();
export default store;
