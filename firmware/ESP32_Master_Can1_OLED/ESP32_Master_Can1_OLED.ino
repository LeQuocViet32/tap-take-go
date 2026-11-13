/*
 * ==============================================================================
 *  TAP TAKE GO - ESP32 SỐ 1: MASTER (DÂY NỐI UART)
 *  (CÂN 1 + MÀN HÌNH OLED + NHẬN DÂY UART TỪ CÂN 2 + CÁP USB MÁY TÍNH)
 * ==============================================================================
 *  CHỨC NĂNG:
 *   1. Đọc Cân 1 (Ô KH1_1) trực tiếp qua HX711 (GPIO 16, 17)
 *   2. Nhận dữ liệu Cân 2 qua DÂY ĐỒNG UART (Chân GPIO 4) với độ trễ 0.5ms
 *   3. Hiển thị đồng thời cả 2 Cân lên màn hình OLED 128x64
 *   4. Bắn toàn bộ dữ liệu 2 Cân qua Cáp USB vào máy tính cho Web Admin
 *
 *  ĐẤU DÂY:
 *   - HX711 Cân 1    : VCC -> 5V/VIN, GND -> GND, DT -> GPIO 16, SCK -> GPIO 17
 *   - OLED 128x64    : VCC -> 3V3 (hoặc 5V), GND -> GND, SDA -> GPIO 21, SCL -> GPIO 22
 *   - DÂY NỐI VỚI ESP32 SỐ 2:
 *       + Chân GPIO 4 (RX2)  <--- Nối vào chân GPIO 17 (TX2) của ESP32 Số 2
 *       + Chân GND           <--- Nối vào chân GND của ESP32 Số 2 (BẮT BUỘC CHUNG MASS)
 *   - Cáp USB        : Cắm trực tiếp vào máy tính (115200 baud)
 * ==============================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <HX711.h>
#include <Preferences.h>

// ============================================================
// 1. CẤU HÌNH PHẦN CỨNG
// ============================================================
const int HX1_DT     = 16;
const int HX1_SCK    = 17;
const int I2C_SDA    = 21;
const int I2C_SCL    = 22;
const int UART_RX_PIN = 4;   // Chân nhận dữ liệu từ ESP32 Cân 2 qua dây đồng

const char* SLOT_ID_1 = "KH1_1";
const char* SLOT_ID_2 = "KH1_2";

const float DEFAULT_CAL = 420.0;
const float ZERO_BAND   = 1.0;
const float STABLE_BAND = 1.5;

// Màn hình OLED (đổi sang U8G2_SSD1306 nếu màn hình của bạn là SSD1306)
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

HX711 scale1;
Preferences prefs;
float calFactor1 = DEFAULT_CAL;
bool hx1Ready = false;

// Cổng Serial phần cứng số 2 để nhận dây từ ESP32 Cân 2
HardwareSerial SerialFromCan2(2);

// Dữ liệu Cân 1 (Đọc tại chỗ)
float weight1 = 0.0;
bool  stable1 = true;
float win1[8];
uint8_t winIdx1 = 0, winCount1 = 0;

// Dữ liệu Cân 2 (Nhận qua dây UART)
float can2Weight = 0.0;
bool  can2Stable = true;
bool  can2SensorOk = false;
unsigned long lastCan2Recv = 0;
bool  can2Online = false;
String uartBuffer = "";

// ============================================================
// 2. HIỂN THỊ MÀN HÌNH OLED 128x64 (CHIA ĐÔI 2 CÂN)
// ============================================================
float shown(float w) {
  return (fabs(w) < ZERO_BAND) ? 0.0 : w;
}

void drawScreen() {
  u8g2.clearBuffer();

  // --- NỬA TRÊN: CÂN 1 (Ô 01 - KH1_1) ---
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.drawStr(0, 9, "CAN 1 (KH1_1)");
  if (hx1Ready) {
    u8g2.drawStr(108, 9, stable1 ? "OK" : "~");
    char buf1[16];
    snprintf(buf1, sizeof(buf1), "%.1f", shown(weight1));
    u8g2.setFont(u8g2_font_logisoso16_tr);
    int w1 = u8g2.getStrWidth(buf1);
    u8g2.drawStr(110 - w1, 30, buf1);
    u8g2.setFont(u8g2_font_6x10_tr);
    u8g2.drawStr(114, 30, "g");
  } else {
    u8g2.drawStr(20, 25, "-- Chua cam day --");
  }

  // Đường kẻ ngang phân cách
  u8g2.drawHLine(0, 32, 128);

  // --- NỬA DƯỚI: CÂN 2 (Ô 02 - KH1_2 - QUA DÂY UART) ---
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.drawStr(0, 42, "CAN 2 (KH1_2) [UART]");
  if (!can2Online) {
    u8g2.drawStr(10, 58, "-- Mat day 2 chip --");
  } else if (!can2SensorOk) {
    u8g2.drawStr(10, 58, "Chua cam HX711!");
  } else {
    u8g2.drawStr(108, 42, can2Stable ? "OK" : "~");
    char buf2[16];
    snprintf(buf2, sizeof(buf2), "%.1f", shown(can2Weight));
    u8g2.setFont(u8g2_font_logisoso16_tr);
    int w2 = u8g2.getStrWidth(buf2);
    u8g2.drawStr(110 - w2, 63, buf2);
    u8g2.setFont(u8g2_font_6x10_tr);
    u8g2.drawStr(114, 63, "g");
  }

  u8g2.sendBuffer();
}

// ============================================================
// 3. LỆNH SERIAL TỪ MÁY TÍNH
// ============================================================
void handlePcSerial() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd == "t" || cmd == "TARE") {
    if (hx1Ready) scale1.tare(5);
    weight1 = 0;
    Serial.println("{\"event\":\"tare_success\",\"slot_id\":\"KH1_1\"}");
  } else if (cmd.startsWith("c1 ")) {
    float knownG = cmd.substring(3).toFloat();
    if (knownG > 0 && hx1Ready) {
      long val = scale1.get_value(10);
      calFactor1 = (float)val / knownG;
      scale1.set_scale(calFactor1);
      prefs.putFloat("cal1", calFactor1);
      Serial.printf("{\"event\":\"calib_ok\",\"slot_id\":\"KH1_1\",\"factor\":%.2f}\n", calFactor1);
    }
  } else if (cmd == "r") {
    calFactor1 = DEFAULT_CAL;
    prefs.putFloat("cal1", DEFAULT_CAL);
    if (hx1Ready) scale1.set_scale(DEFAULT_CAL);
    Serial.println("{\"event\":\"reset_calib\"}");
  }
}

// ============================================================
// 4. ĐỌC DỮ LIỆU TỪ DÂY UART CỦA CÂN 2
// ============================================================
void handleCan2Uart() {
  while (SerialFromCan2.available()) {
    char c = SerialFromCan2.read();
    if (c == '\n') {
      uartBuffer.trim();
      if (uartBuffer.startsWith("{") && uartBuffer.endsWith("}")) {
        // 1. Chuyển tiếp ngay lập tức dòng JSON này lên máy tính qua cáp USB!
        Serial.println(uartBuffer);

        // 2. Bóc tách số cân để cập nhật lên màn hình OLED
        lastCan2Recv = millis();
        can2Online = true;

        if (uartBuffer.indexOf("\"error\":\"no_sensor\"") != -1) {
          can2SensorOk = false;
        } else {
          can2SensorOk = true;
          int wIdx = uartBuffer.indexOf("\"weight\":");
          int stIdx = uartBuffer.indexOf("\"stable\":");
          if (wIdx != -1) {
            can2Weight = uartBuffer.substring(wIdx + 9).toFloat();
            if (stIdx != -1) {
              can2Stable = uartBuffer.substring(stIdx + 9).startsWith("true");
            }
          }
        }
      }
      uartBuffer = "";
    } else if (c != '\r') {
      uartBuffer += c;
    }
  }
}

// ============================================================
// 5. KHỞI TẠO (SETUP)
// ============================================================
void setup() {
  // Cổng USB giao tiếp với Máy tính (Web Admin)
  Serial.begin(115200);
  Serial.setTimeout(50);
  delay(200);

  Serial.println();
  Serial.println("==================================================");
  Serial.println("  TAP TAKE GO - MASTER (CAN 1 + DAY UART CAN 2)   ");
  Serial.println("==================================================");

  // Khởi tạo cổng nhận dây UART từ ESP32 Cân 2 (RX=GPIO 4, TX=GPIO 5 không dùng)
  SerialFromCan2.begin(115200, SERIAL_8N1, UART_RX_PIN, 5);
  Serial.println("Cong nhan day UART (GPIO 4): San sang ✓");

  // Màn hình OLED
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(400000);
  u8g2.begin();

  // Bộ nhớ hiệu chuẩn
  prefs.begin("scales", false);
  calFactor1 = prefs.getFloat("cal1", DEFAULT_CAL);

  // Đánh thức và khởi tạo Cân 1
  pinMode(HX1_SCK, OUTPUT);
  digitalWrite(HX1_SCK, LOW);
  pinMode(HX1_DT, INPUT_PULLUP);
  delay(50);

  Serial.print("Kiem tra Can 1 (GPIO 16, 17)... ");
  scale1.begin(HX1_DT, HX1_SCK);
  if (scale1.wait_ready_timeout(1000)) {
    scale1.set_scale(calFactor1);
    scale1.tare(3);
    hx1Ready = true;
    Serial.println("OK ✓");
  } else {
    hx1Ready = false;
    Serial.println("CHUA THAY (se tu nhan khi cam)");
  }

  drawScreen();
  Serial.println(">>> MASTER SAN SANG BAN USB VA NHAN DAY UART! <<<");
}

// ============================================================
// 6. VÒNG LẶP CHÍNH (LOOP)
// ============================================================
void loop() {
  handlePcSerial();
  handleCan2Uart();

  // 1. Đọc Cân 1 tại chỗ
  if (hx1Ready && scale1.is_ready()) {
    float raw1 = scale1.get_units(1);
    if (!isnan(raw1) && !isinf(raw1)) {
      float diff = raw1 - weight1;
      if (fabs(diff) > 20.0) weight1 = raw1;
      else                   weight1 += 0.35 * diff;

      win1[winIdx1] = weight1;
      winIdx1 = (winIdx1 + 1) % 8;
      if (winCount1 < 8) winCount1++;

      float mn = win1[0], mx = win1[0];
      for (uint8_t i = 1; i < winCount1; i++) {
        if (win1[i] < mn) mn = win1[i];
        if (win1[i] > mx) mx = win1[i];
      }
      stable1 = (winCount1 >= 4) && (mx - mn < STABLE_BAND);
    }
  } else if (!hx1Ready && digitalRead(HX1_DT) == LOW) {
    scale1.begin(HX1_DT, HX1_SCK);
    scale1.set_scale(calFactor1);
    scale1.tare(3);
    hx1Ready = true;
    Serial.println("{\"event\":\"can1_plugged\"}");
  }

  // 2. Kiểm tra dây UART Cân 2 bị tuột (> 2.5s không có tín hiệu)
  if (can2Online && (millis() - lastCan2Recv > 2500)) {
    can2Online = false;
    Serial.println("{\"event\":\"can2_wire_disconnected\"}");
  }

  // 3. Cập nhật Màn hình OLED mỗi 100ms
  static unsigned long lastDraw = 0;
  if (millis() - lastDraw >= 100) {
    lastDraw = millis();
    drawScreen();
  }

  // 4. Bắn Cân 1 vào Cáp USB Máy tính (khi đổi >= 0.3g hoặc heartbeat 1s)
  static float lastP1 = -9999;
  static bool  lastS1 = false;
  static unsigned long lastBeat = 0;
  bool beat = (millis() - lastBeat >= 1000);

  if (hx1Ready && (beat || fabs(shown(weight1) - lastP1) >= 0.3 || stable1 != lastS1)) {
    Serial.printf("{\"slot_id\":\"KH1_1\",\"weight\":%.1f,\"stable\":%s}\n",
                  shown(weight1), stable1 ? "true" : "false");
    lastP1 = shown(weight1);
    lastS1 = stable1;
  }

  if (beat) lastBeat = millis();

  delay(5);
}
