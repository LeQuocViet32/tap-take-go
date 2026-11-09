# HƯỚNG DẪN ĐẤU NỐI & LẬP TRÌNH PHẦN CỨNG IOT
## HỆ THỐNG BÁN LẺ TỰ ĐỘNG TAP TAKE GO

Tài liệu này hướng dẫn chi tiết cách kết nối linh kiện thực tế (ESP32, Đầu đọc thẻ RFID RC522, Cảm biến tải trọng Loadcell + HX711, Khóa điện từ Relay) với hệ thống máy chủ **Tap Take Go**.

---

## 1. DANH SÁCH LINH KIỆN CẦN CHUẨN BỊ (BOM)

| STT | Thiết Bị / Linh Kiện | Số Lượng Đề Xuất | Mục Đích Sử Dụng |
| :--- | :--- | :---: | :--- |
| 1 | **ESP32 DevKit V1 (30 hoặc 38 chân)** | 1 - 3 mạch | Bộ xử lý trung tâm, kết nối WiFi & gửi nhận MQTT |
| 2 | **Module Đọc Thẻ RFID RC522 (13.56 MHz)** | 1 cái | Đặt tại Cổng Vào để nhận diện thẻ khách hàng |
| 3 | **Thẻ từ RFID Mifare 1K / Móc khóa RFID** | 2 - 5 cái | Cấp cho khách hàng để định danh |
| 4 | **Cảm biến Loadcell (1kg, 5kg hoặc 10kg)** | 2 - 4 thanh | Đặt dưới từng slot hàng trên kệ |
| 5 | **Module khuếch đại 24-bit ADC HX711** | 2 - 4 mạch | Đọc tín hiệu điện áp từ Loadcell chuyển đổi thành gram |
| 6 | **Module Relay 5V (Optocoupler cách ly)** | 1 - 2 module | Đóng ngắt cuộn hút khóa cổng từ |
| 7 | **Khóa chốt điện từ Solenoid Lock 12V** | 1 - 2 cái | Khóa chốt vật lý cổng vào / cổng ra |
| 8 | **Nguồn Adapter 12V DC (2A - 3A)** | 1 cái | Cấp nguồn riêng cho khóa điện từ |
| 9 | **Module hạ áp Buck LM2596 (12V xuống 5V)** | 1 cái | Cấp nguồn nuôi ổn định cho ESP32 |

> [!WARNING]
> **Lưu ý nguồn điện:** Khóa chốt điện từ 12V tiêu thụ dòng tức thời khá lớn khi hút. **Tuyệt đối không cấp chung nguồn 5V của ESP32 cho khóa 12V** để tránh làm sụt áp khiến vi điều khiển bị khởi động lại (reset). Hãy dùng nguồn 12V riêng hoặc qua mạch hạ áp có diode chống ngược dòng.

---

## 2. SƠ ĐỒ ĐẤU NỐI DÂY (PINOUT DIAGRAM)

### 2.1. CỔNG VÀO (ENTRY GATE): ESP32 + RC522 + RELAY 1

Đầu đọc RC522 giao tiếp với ESP32 qua chuẩn **SPI**. 

| Chân RC522 | Chân ESP32 | Ghi Chú Quan Trọng |
| :--- | :--- | :--- |
| **3.3V** | **3V3** | ⚠️ **CẮM 3.3V, TUYỆT ĐỐI KHÔNG CẮM 5V SẼ CHÁY CHIP** |
| **GND** | **GND** | Nối Mass chung |
| **RST** | **GPIO 22** | Chân Reset |
| **SDA (SS)** | **GPIO 5** | Chip Select |
| **SCK** | **GPIO 18** | SPI Clock |
| **MISO** | **GPIO 19** | SPI Master In Slave Out |
| **MOSI** | **GPIO 23** | SPI Master Out Slave In |
| **IRQ** | Không nối | Bỏ trống |

**Nối Relay mở chốt Cổng Vào:**
- `VCC` Relay $\rightarrow$ Chân `VIN` (5V) của ESP32.
- `GND` Relay $\rightarrow$ Chân `GND`.
- `IN` Relay $\rightarrow$ Chân **GPIO 2** của ESP32.
- Đầu ra tiếp điểm Relay: Nối tiếp với dây nguồn dương 12V của Khóa chốt Cổng vào.

---

### 2.2. KỆ HÀNG THÔNG MINH (SMART SHELF): ESP32 + LOADCELL + HX711

Mỗi vị trí khay/kệ hàng (Slot) sử dụng 1 thanh Loadcell nối vào 1 mạch HX711:

**Đấu Loadcell vào mạch HX711 (Chuẩn 4 dây màu):**
- **Dây Đỏ** $\rightarrow$ Chân **E+** (Excitation +)
- **Dây Đen** $\rightarrow$ Chân **E-** (Excitation -)
- **Dây Trắng** $\rightarrow$ Chân **A-** (Signal -)
- **Dây Xanh lá** $\rightarrow$ Chân **A+** (Signal +)

**Đấu mạch HX711 vào ESP32:**

| Chân HX711 | Chân ESP32 (Slot 1 - NODE_01) | Chân ESP32 (Slot 2 - NODE_02) |
| :--- | :--- | :--- |
| **VCC** | **5V (hoặc 3V3)** | **5V (hoặc 3V3)** |
| **GND** | **GND** | **GND** |
| **DT (Data)** | **GPIO 16** | **GPIO 17** |
| **SCK (Clock)**| **GPIO 4** | **GPIO 15** |

---

### 2.3. CỔNG RA (EXIT GATE): ESP32 + RELAY 2
- `VCC` Relay $\rightarrow$ `VIN` (5V)
- `GND` Relay $\rightarrow$ `GND`
- `IN` Relay $\rightarrow$ **GPIO 27**
- Tiếp điểm Relay nối với khóa chốt Cổng ra.

---

## 3. CÀI ĐẶT MÔI TRƯỜNG ARDUINO IDE

1. Mở **Arduino IDE** (phiên bản 2.x hoặc 1.8.x).
2. Vào **Tools** $\rightarrow$ **Manage Libraries...** và cài đặt 4 thư viện sau:
   - `PubSubClient` (tác giả Nick O'Leary) - Thư viện giao thức MQTT.
   - `MFRC522` (tác giả GithubCommunity) - Đọc thẻ RFID.
   - `HX711 Arduino Library` (tác giả Bogdan Necula / Olav Kallhovd).
   - `ArduinoJson` (tác giả Benoit Blanchon) - Tạo và phân tích bản tin JSON.
3. Trong menu `PubSubClient.h`, nếu cần gửi gói tin JSON dài, mở file `PubSubClient.h` và sửa `#define MQTT_MAX_PACKET_SIZE 128` thành `512`.

---

## 4. MÃ NGUỒN C++ HOÀN CHỈNH CHO ESP32

Dưới đây là mã nguồn tổng hợp đầy đủ cho ESP32 đảm nhận cả 3 chức năng: Đọc thẻ cổng vào, Giám sát kệ hàng, và Mở chốt cửa ra:

```cpp
#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include "HX711.h"
#include <ArduinoJson.h>

// ==========================================
// 1. CẤU HÌNH WIFI & MÁY CHỦ MQTT
// ==========================================
const char* ssid = "YOUR_WIFI_SSID";           // Tên WiFi nhà bạn
const char* password = "YOUR_WIFI_PASSWORD";   // Mật khẩu WiFi

// Đổi thành IP máy tính hoặc Domain Internet của Server
const char* mqtt_server = "192.168.1.100";     // Ví dụ: IP máy chạy server hoặc domain cloud
const int mqtt_port = 1883;

// ==========================================
// 2. KHAI BÁO CHÂN PIN
// ==========================================
// RFID RC522
#define SS_PIN 5
#define RST_PIN 22
MFRC522 rfid(SS_PIN, RST_PIN);

// Relay Cổng vào & Cổng ra
#define RELAY_ENTRY_PIN 2    // Kích mở cổng vào
#define RELAY_EXIT_PIN  27   // Kích mở cổng ra

// Cảm biến Kệ hàng HX711 (Slot 1 - Coca Cola)
#define HX711_DT_PIN  16
#define HX711_SCK_PIN 4
HX711 scale;

// Hệ số hiệu chuẩn Loadcell (Cần chỉnh lại theo mục 5)
float calibration_factor = -420.0; 
float last_weight = 0.0;
unsigned long last_weight_check_time = 0;

WiFiClient espClient;
PubSubClient client(espClient);

// ==========================================
// 3. HÀM KẾT NỐI WIFI
// ==========================================
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Dang ket noi WiFi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi da ket noi!");
  Serial.print("IP ESP32: ");
  Serial.println(WiFi.localIP());
}

// ==========================================
// 4. XỬ LÝ LỆNH TỪ SERVER (MQTT CALLBACK)
// ==========================================
void mqttCallback(char* topic, byte* message, unsigned int length) {
  String messageTemp;
  for (int i = 0; i < length; i++) {
    messageTemp += (char)message[i];
  }
  Serial.print("[MQTT In] [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(messageTemp);

  // Phân tích JSON từ Server
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, messageTemp);
  if (error) return;

  // LỆNH MỞ CỔNG VÀO: {"command":"OPEN"}
  if (String(topic) == "store/gate/entry") {
    const char* cmd = doc["command"];
    if (cmd && String(cmd) == "OPEN") {
      Serial.println(">>> LENH: MO CHOT CONG VAO!");
      digitalWrite(RELAY_ENTRY_PIN, LOW); // Relay kich muc LOW (hoac HIGH tuy module)
      delay(4000); // Giữ mở 4 giây
      digitalWrite(RELAY_ENTRY_PIN, HIGH);
      Serial.println(">>> DONG CHOT CONG VAO");
    }
  }

  // LỆNH MỞ CỔNG RA: {"command":"OPEN"}
  if (String(topic) == "store/gate/exit") {
    const char* cmd = doc["command"];
    if (cmd && String(cmd) == "OPEN") {
      Serial.println(">>> LENH: MO CHOT CONG RA (THANH TOAN THANH CONG)!");
      digitalWrite(RELAY_EXIT_PIN, LOW);
      delay(5000); // Giữ mở 5 giây cho khách bước qua
      digitalWrite(RELAY_EXIT_PIN, HIGH);
      Serial.println(">>> DONG CHOT CONG RA");
    }
  }
}

// ==========================================
// 5. TỰ ĐỘNG RECONNECT MQTT
// ==========================================
void reconnectMQTT() {
  while (!client.connected()) {
    Serial.print("Dang ket noi MQTT Broker...");
    String clientId = "ESP32-TapTakeGo-" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      Serial.println(" Da ket noi thanh cong!");
      // Dang ky nhan lenh dieu khien cong
      client.subscribe("store/gate/entry");
      client.subscribe("store/gate/exit");
    } else {
      Serial.print("That bai, ma loi = ");
      Serial.print(client.state());
      Serial.println(" -> Thu lai sau 3 giay");
      delay(3000);
    }
  }
}

// ==========================================
// 6. SETUP HỆ THỐNG
// ==========================================
void setup() {
  Serial.begin(115200);

  // Thiết lập chân Relay (Khởi tạo ở trạng thái đóng chốt)
  pinMode(RELAY_ENTRY_PIN, OUTPUT);
  pinMode(RELAY_EXIT_PIN, OUTPUT);
  digitalWrite(RELAY_ENTRY_PIN, HIGH);
  digitalWrite(RELAY_EXIT_PIN, HIGH);

  // Khởi động SPI và Module RFID RC522
  SPI.begin();
  rfid.PCD_Init();
  Serial.println("RC522 RFID Reader Ready.");

  // Khởi động Cảm biến trọng lượng HX711
  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  scale.set_scale(calibration_factor);
  scale.tare(); // Reset ve 0 gram
  Serial.println("HX711 Loadcell Ready. Tared to 0g.");

  // Kết nối mạng
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(mqttCallback);
}

// ==========================================
// 7. VÒNG LẶP CHÍNH (LOOP)
// ==========================================
void loop() {
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();

  // ----------------------------------------------------
  // NHIỆM VỤ 1: QUÉT THẺ RFID CỔNG VÀO
  // ----------------------------------------------------
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String cardUID = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      cardUID += (rfid.uid.uidByte[i] < 0x10 ? "0" : "");
      cardUID += String(rfid.uid.uidByte[i], HEX);
    }
    cardUID.toUpperCase();
    String rfidFormatted = "RFID_" + cardUID;

    Serial.print("Phat hien the RFID: ");
    Serial.println(rfidFormatted);

    // Bắn bản tin MQTT cổng vào lên Server
    StaticJsonDocument<128> doc;
    doc["rfid_card_id"] = rfidFormatted;
    char buffer[128];
    serializeJson(doc, buffer);
    client.publish("store/gate/entry", buffer);

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    delay(1000); // Chống quẹt lặp liên tục
  }

  // ----------------------------------------------------
  // NHIỆM VỤ 2: QUAN SÁT TRỌNG LƯỢNG KỆ (LOADCELL HX711)
  // ----------------------------------------------------
  if (millis() - last_weight_check_time > 800) { // Đọc mỗi 800ms
    last_weight_check_time = millis();

    if (scale.is_ready()) {
      // Đọc trung bình 3 lần để khử rung
      float current_weight = scale.get_units(3);
      if (current_weight < 0) current_weight = 0;

      float weight_delta = current_weight - last_weight;

      // Ngưỡng phát hiện: nếu thay đổi lớn hơn 50g (bỏ qua rung lắc nhẹ)
      if (abs(weight_delta) >= 50.0) {
        Serial.print("Phat hien bien thien tai trong: ");
        Serial.print(weight_delta);
        Serial.println(" g");

        // Bắn bản tin MQTT trọng lượng
        StaticJsonDocument<128> doc;
        doc["slot_id"] = "NODE_01"; // Mã kệ ánh xạ trên Admin
        doc["weight_change"] = (int)round(weight_delta);

        char buffer[128];
        serializeJson(doc, buffer);
        client.publish("store/sensor/weight", buffer);

        last_weight = current_weight;
      }
    }
  }
}
```

---

## 5. HƯỚNG DẪN HIỆU CHUẨN TRỌNG LƯỢNG LOADCELL (CALIBRATION)

Để cảm biến đọc chính xác số gram thực tế của lon nước hoặc gói snack:
1. Nạp code mẫu kiểm tra giá trị thô từ thư viện HX711: `scale.set_scale(); scale.tare();`.
2. Đặt một vật thể có trọng lượng chuẩn đã biết trước (ví dụ 1 lon Coca Cola nguyên = **390g**).
3. Đọc giá trị raw trên Serial Monitor:
   $$\text{calibration\_factor} = \frac{\text{Giá trị Raw đo được}}{\text{Trọng lượng thực tế (390g)}}$$
4. Điền hệ số `calibration_factor` vừa tìm được vào dòng:
   `float calibration_factor = ...;` trong code ESP32.

---

## 6. ĐẶC TẢ BẢN TIN MQTT GIAO TIẾP VỚI SERVER

Máy chủ Tap Take Go đã tích hợp sẵn **Aedes MQTT Broker** tại cổng `1883`.

### Topic 1: Quẹt thẻ vào cổng
- **Topic:** `store/gate/entry`
- **Hướng:** ESP32 $\rightarrow$ Server
- **Payload:** `{"rfid_card_id": "RFID_8CFFE"}`
- **Server phản hồi lệnh mở cổng:** `{"command": "OPEN", "user_id": "usr_001", "card_id": "RFID_8CFFE"}`

### Topic 2: Khách lấy / trả đồ trên kệ
- **Topic:** `store/sensor/weight`
- **Hướng:** ESP32 $\rightarrow$ Server
- **Payload:**
  - Nhấc 1 lon Coca (390g): `{"slot_id": "NODE_01", "weight_change": -390}`
  - Trả lại 1 lon Coca: `{"slot_id": "NODE_01", "weight_change": 390}`

### Topic 3: Mở cửa ra khi thanh toán thành công
- **Topic:** `store/gate/exit`
- **Hướng:** Server $\rightarrow$ ESP32
- **Payload:** `{"command": "OPEN", "order_code": "TTG4631", "duration_ms": 5000}`
