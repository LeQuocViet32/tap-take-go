# HƯỚNG DẪN ĐƯA HỆ THỐNG TAP TAKE GO LÊN SERVER INTERNET
## PUBLIC ACCESS & CLOUD DEPLOYMENT GUIDE

---

## 🌟 ĐƯỜNG LINK INTERNET TAILSCALE HIỆN TẠI (ĐANG HOẠT ĐỘNG TRỰC TIẾP)

Hệ thống **Tailscale Funnel** đã được cài đặt và cấu hình thành công trên máy tính của bạn:

- 🔗 **Địa chỉ Web công khai (HTTPS):**  
  [https://taptakego.tail9f43b5.ts.net/](https://taptakego.tail9f43b5.ts.net/)
- 📱 **Địa chỉ IP nội bộ Tailnet:**  
  `http://100.68.137.95:5000`
- 💳 **Địa chỉ Webhook Ngân Hàng SePay:**  
  `https://taptakego.tail9f43b5.ts.net/api/webhook/payment`

> Mọi thiết bị trên toàn thế giới (điện thoại 4G/WiFi, máy tính ngoài quán net, hoặc ngân hàng SePay) đều có thể truy cập thẳng vào link HTTPS trên mà **không cần cài Tailscale**.

---

## 🚀 CÁC GIẢI PHÁP TRIỂN KHAI KHÁC

*Phù hợp nhất để demo, kiểm thử với điện thoại thật quét VietQR và nhận Webhook SePay từ ngân hàng ngay hôm nay mà chưa cần mua máy chủ VPS.*

Dự án hiện đang chạy tại cổng `5000`. Bạn có thể sử dụng công cụ Tunneling bảo mật miễn phí để sinh một đường link **HTTPS công khai**.

### Cách 1.1: Sử dụng LocalTunnel (Đơn giản nhất, không cần cài đặt phần mềm)
Mở một cửa sổ Terminal (PowerShell hoặc CMD) và gõ lệnh sau:

```bash
npx localtunnel --port 5000
```

Hệ thống sẽ cấp cho bạn một đường dẫn dạng:
`https://sharp-dogs-jump.loca.lt`

> Khi mở link lần đầu trên điện thoại, trang web sẽ hỏi "Endpoint IP", bạn chỉ cần gõ địa chỉ IP công khai của máy tính bạn (xem tại [ipv4.icanhazip.com](https://ipv4.icanhazip.com)) rồi bấm Submit là vào được bình thường.

---

### Cách 1.2: Sử dụng Cloudflare Tunnel (Tốc độ cao nhất, không bị hỏi IP)
1. Tải công cụ miễn phí `cloudflared` từ Cloudflare:
   - Link tải trực tiếp file `.exe` cho Windows: [cloudflared-windows-amd64.exe](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe)
2. Đổi tên file vừa tải thành `cloudflared.exe`.
3. Mở CMD / PowerShell tại thư mục chứa file đó và chạy:
   ```bash
   .\cloudflared.exe tunnel --url http://localhost:5000
   ```
4. Terminal sẽ in ra một đường link HTTPS trực tiếp, ví dụ:
   `https://funny-cats-domain.trycloudflare.com`
5. Bạn có thể gửi link này cho bất kỳ ai, mở trên điện thoại bất cứ nơi đâu qua 4G/5G!

> [!TIP]
> **Cấu hình SePay Webhook:** Khi có link Internet, bạn vào trang quản trị ngân hàng SePay $\rightarrow$ Cấu hình Webhook $\rightarrow$ Nhập:
> `https://<domain_cua_ban>/api/webhook/payment`
> Khi có khách chuyển tiền qua VietQR, SePay sẽ bắn thông báo vào link này để mở cổng tự động ngay lập tức!

---

## ☁️ GIẢI PHÁP 2: TRIỂN KHAI LÊN CLOUD SERVER MIỄN PHÍ (RENDER HOẶC RAILWAY)
*Hệ thống sẽ chạy 24/7 trên máy chủ đám mây, tự động khởi động lại, có sẵn SSL HTTPS vĩnh viễn.*

Dự án đã được đóng gói sẵn file `Dockerfile` chuẩn đa tầng (Multi-stage build).

### Các bước triển khai lên Render.com:
1. Đẩy mã nguồn dự án lên tài khoản GitHub của bạn:
   ```bash
   git init
   git add .
   git commit -m "Deploy Tap Take Go Smart Store"
   git branch -M main
   git remote add origin https://github.com/<tai_khoan_cua_ban>/tap-take-go.git
   git push -u origin main
   ```
2. Truy cập [render.com](https://render.com) và đăng ký tài khoản miễn phí.
3. Bấm **New +** $\rightarrow$ Chọn **Web Service**.
4. Chọn repository GitHub `tap-take-go` vừa tạo.
5. Tại mục **Runtime**, Render sẽ tự động nhận diện file `Dockerfile`.
6. Tại mục **Environment Variables**:
   - `PORT`: `5000`
   - `NODE_ENV`: `production`
7. Bấm **Deploy Web Service**.
8. Sau khoảng 2 - 3 phút, Render sẽ cấp cho bạn tên miền vĩnh viễn dạng:
   `https://tap-take-go-xxxx.onrender.com`

---

## 🖥️ GIẢI PHÁP 3: TRIỂN KHAI LÊN MÁY CHỦ RIÊNG VPS (UBUNTU LINUX)
*Đây là giải pháp chuyên nghiệp nhất cho một cửa hàng thực tế, hỗ trợ cổng MQTT TCP 1883 trực tiếp cho hàng chục mạch ESP32 kết nối.*

Bạn có thể thuê máy chủ ảo VPS giá rẻ (từ 5$/tháng tại DigitalOcean, Vultr, Linode, AWS hoặc OVH) chạy hệ điều hành **Ubuntu 22.04 LTS**.

### Bước 1: Cài đặt Docker & Docker Compose trên VPS
Kết nối SSH vào VPS và chạy lệnh:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git docker.io docker-compose
sudo systemctl enable --now docker
```

### Bước 2: Clone dự án và khởi chạy bằng Docker
```bash
# Clone source code
git clone https://github.com/<tai_khoan>/tap-take-go.git
cd tap-take-go

# Khởi chạy toàn bộ hệ thống bằng Docker Compose (Background)
sudo docker-compose up -d --build
```
Lệnh trên sẽ tự động:
- Build ứng dụng React thành tài nguyên tĩnh.
- Khởi chạy Web Server & Socket.io tại cổng `5000`.
- Khởi chạy MQTT Broker tại cổng `1883`.
- Tự động restart container nếu máy chủ bị mất điện hoặc khởi động lại.

### Bước 3: Mở tường lửa (Firewall) cho Web và MQTT
```bash
sudo ufw allow 80/tcp     # Cổng HTTP
sudo ufw allow 443/tcp    # Cổng HTTPS
sudo ufw allow 5000/tcp   # Cổng Web App
sudo ufw allow 1883/tcp   # Cổng MQTT Broker cho ESP32
sudo ufw enable
```

### Bước 4: Cài Nginx và Chứng chỉ SSL Let's Encrypt (Miễn phí)
Để gắn tên miền riêng (ví dụ `store.yourdomain.com`):
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Tạo file cấu hình Nginx `/etc/nginx/sites-available/taptakego`:
```nginx
server {
    server_name store.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Kích hoạt và cấp chứng chỉ bảo mật HTTPS tự động:
```bash
sudo ln -s /etc/nginx/sites-available/taptakego /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d store.yourdomain.com
```

---

## 📡 CẤU HÌNH PHẦN CỨNG ESP32 KHI ĐÃ ĐƯA LÊN SERVER

Khi đã có IP máy chủ hoặc Domain Internet:
1. Mở file code ESP32 trong Arduino IDE (xem tại [HUONG_DAN_KET_NOI_PHAN_CUNG_IOT.md](file:///C:/Users/thang/.gemini/antigravity/scratch/tap-take-go/HUONG_DAN_KET_NOI_PHAN_CUNG_IOT.md)).
2. Cập nhật lại biến:
   ```cpp
   // Nếu dùng VPS có IP tĩnh:
   const char* mqtt_server = "103.123.45.67"; // Thay bằng IP VPS

   // Hoặc nếu dùng Domain:
   const char* mqtt_server = "store.yourdomain.com";
   const int mqtt_port = 1883;
   ```
3. Nạp code vào ESP32. Thiết bị sẽ tự động kết nối qua WiFi Internet đến máy chủ đám mây dù bạn đặt kệ hàng ở bất kỳ đâu!
