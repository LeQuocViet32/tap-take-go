# TAP TAKE GO — CỬA HÀNG THÔNG MINH (SMART RETAILING STORE)

Dự án website và hệ thống IoT cho mô hình cửa hàng tiện lợi thông minh không người bán (**Tap Take Go** / **Grab & Go**).

---

## 🌟 TỔNG QUAN HỆ THỐNG

1. **Khách hàng quẹt thẻ RFID/QR tại cổng vào**:
   - ESP32 đọc thẻ RC522 -> Gửi về Backend -> Cổng vào mở chốt -> Khởi tạo phiên giỏ hàng ảo `Shopping`.
2. **Khách nhấc sản phẩm từ kệ hàng**:
   - Cảm biến tải trọng Loadcell HX711 trên kệ phát hiện biến thiên trọng lượng.
   - ESP32 gửi bản tin MQTT lên topic: `store/sensor/weight` với payload `{"slot_id": "NODE_01", "weight_change": -390}`.
   - Backend tính toán số lượng ($\Delta Q = -390 / 390 = -1 \rightarrow$ Khách lấy 1 lon) và tự động cập nhật giỏ hàng ảo real-time qua WebSockets (Socket.io).
3. **Khách trả lại đồ lên kệ**:
   - Trọng lượng tăng lại $+390g \rightarrow$ Giỏ hàng tự động giảm 1 lon.
4. **Khách bước tới cửa ra (Exit Kiosk)**:
   - Màn hình Kiosk hiển thị danh sách các món hàng đã nhặt, tổng tiền và tự động sinh mã **VietQR động** (chuẩn NAPAS / SePay) với nội dung `TTG <MÃ_ĐƠN>`.
5. **Thanh toán & Mở cổng ra**:
   - Khách quét VietQR bằng bất kỳ app ngân hàng nào (MB, VCB, Techcombank, Momo,...).
   - Ngân hàng kích hoạt Webhook SePay `POST /api/webhook/payment`.
   - Backend xác thực thanh toán -> Màn hình Kiosk chuyển sang màu xanh "Cảm ơn quý khách" -> Gửi lệnh MQTT mở cổng từ `store/gate/exit` cho khách ra ngoài.

---

## 🚀 CÁCH KHỞI ĐỘNG NHANH

### Cách 1: Chạy file Batch (Khuyên dùng trên Windows)
- Nhấp đúp chuột vào file `start.bat` trong thư mục gốc.
- Mở trình duyệt truy cập: **`http://localhost:5000`**

### Cách 2: Chạy qua dòng lệnh Terminal
```bash
# Di chuyển vào thư mục server
cd server

# Khởi động Backend (tích hợp sẵn Web UI, MQTT Broker và WebSockets)
node src/index.js
```
Truy cập: **`http://localhost:5000`**

### Chế độ phát triển Frontend (Hot-Reload)
Nếu muốn phát triển giao diện React với Vite:
```bash
cd client
npm run dev
```
Truy cập: **`http://localhost:5173`** (Tự động kết nối proxy tới backend port 5000).

---

## 📱 4 GIAO DIỆN CHÍNH TRÊN WEB

| Giao diện | Đường dẫn / Tab | Mô tả |
| :--- | :--- | :--- |
| **🧪 Giả Lập IoT & Quy Trình** | `Giả Lập IoT` | Công cụ trực quan giúp kiểm thử toàn bộ luồng mua sắm (Quẹt thẻ vào, nhấc đồ trên kệ, bắn webhook ngân hàng, mở cổng) mà chưa cần cắm mạch thật. |
| **📱 Khách Hàng (Customer Portal)** | `Khách Hàng` | Xem giỏ hàng ảo nhảy trực tiếp khi nhấc đồ, mã thẻ RFID định danh, lịch sử mua sắm. |
| **🖥️ Màn Hình Cửa Ra (Exit Kiosk)** | `Màn Hình Cửa Ra` | Màn hình lớn đặt tại cổng ra: chi tiết hóa đơn, mã VietQR động, hiệu ứng âm thanh và cổng mở khi tiền về. |
| **⚙️ Quản Trị (Admin Portal)** | `Quản Trị` | Dashboard doanh thu, quản lý kho sản phẩm, ánh xạ slot kệ Loadcell, xử lý hoàn tiền / hủy đơn, cài đặt tài khoản ngân hàng. |

---

## 📡 TÍCH HỢP PHẦN CỨNG IOT (HARDWARE INTEGRATION)

### 1. Cấu hình MQTT Broker
Backend đã tích hợp sẵn một **MQTT Broker (Aedes)** chạy trên cổng tiêu chuẩn **`1883`**. ESP32 chỉ cần kết nối vào IP máy tính của bạn qua port 1883.

### 2. Các Topic và Bản tin MQTT:

#### A. Cổng vào (RFID RC522 + ESP32)
- **Topic gửi (Publish):** `store/gate/entry`
- **Payload JSON:**
  ```json
  { "rfid_card_id": "RFID_88A1B2" }
  ```
- **Topic nhận lệnh mở cổng (Subscribe):** `store/gate/entry`
  - Payload từ Server: `{"command": "OPEN", "user_id": "...", "card_id": "..."}`

#### B. Kệ hàng thông minh (HX711 Loadcell + ESP32)
- **Topic gửi (Publish):** `store/sensor/weight`
- **Payload JSON:**
  ```json
  { "slot_id": "NODE_01", "weight_change": -390 }
  ```
  *(Khi khách nhấc 1 lon Coca nặng 390g: `weight_change` là `-390`. Khi đặt lại: `+390`)*

#### C. Cổng ra (Relay Turnstile Exit)
- **Topic nhận lệnh mở chốt (Subscribe):** `store/gate/exit`
- **Payload từ Server:**
  ```json
  { "command": "OPEN", "order_code": "TTG1234", "duration_ms": 5000 }
  ```

---

## 💳 TÍCH HỢP WEBHOOK THANH TOÁN SEPAY

1. Đăng ký tài khoản tại [SePay.vn](https://sepay.vn).
2. Vào phần **Cấu hình Webhooks** trên SePay:
   - **URL Webhook:** `http://<domain_cua_ban>/api/webhook/payment` (có thể dùng ngrok để thử nghiệm: `ngrok http 5000`)
   - **Phương thức:** `POST`
3. Trong tab **Quản Trị -> Cài Đặt Ngân Hàng** trên Web Tap Take Go:
   - Điền Mã ngân hàng (MB, VCB, TCB, ACB, TPB,...).
   - Điền Số tài khoản & Tên chủ tài khoản.
   - Điền API Secret Token từ SePay.
4. Khi khách chuyển tiền đúng cú pháp `TTG <MÃ_ĐƠN>`, SePay tự động bắn Webhook về, hệ thống ghi nhận và mở cổng ra ngay lập tức.
