/*
 * ==============================================================================
 *  TAP TAKE GO - ESP32 SỐ 2: SLAVE (CÂN 2 - PHÁT DỮ LIỆU QUA DÂY UART)
 * ==============================================================================
 *  CHỨC NĂNG:
 *   1. Độc lập đọc Cân 2 (Ô KH1_2) qua mạch HX711 (GPIO 25, 26)
 *   2. Bắn trực tiếp dữ liệu qua DÂY ĐỒNG UART (Chân GPIO 17) sang ESP32 Số 1 (< 0.5ms)
 *   3. Nguồn cấp độc lập: cắm củ sạc điện thoại 5V qua cổng Micro-USB
 *
 *  ĐẤU DÂY:
 *   - HX711 Cân 2:
 *       + VCC -> Chân 5V/VIN
 *       + GND -> Chân GND
 *       + DT  -> Chân GPIO 25
 *       + SCK -> Chân GPIO 26
 *
 *   - DÂY NỐI SANG ESP32 SỐ 1 (CHỈ 2 SỢI):
 *       + Chân GPIO 17 (TX2)  ───────>  Nối vào chân GPIO 4 (RX2) của ESP32 Số 1
 *       + Chân GND            ───────>  Nối vào chân GND của ESP32 Số 1 (BẮT BUỘC CHUNG MASS)
 *
 *  LỆNH SERIAL (Khi cần cắm máy tính để hiệu chuẩn riêng):
 *   - t     : Trừ bì (về 0)
 *   - c 500 : Đặt quả 500g lên rồi gõ để hiệu chuẩn chuẩn xác
 * ==============================================================================
 */

#include <Arduino.h>
#include <HX711.h>
#include <Preferences.h>

// ============================================================
// 1. CẤU HÌNH PHẦN CỨNG
// ============================================================
const int HX2_DT      = 25;  // Chân Data của HX711 Cân 2
const int HX2_SCK     = 26;  // Chân Clock của HX711 Cân 2
const int UART_TX_PIN = 17;  // Chân phát dữ liệu UART sang ESP32 Số 1

const char* SLOT_ID = "KH1_2";
const float DEFAULT_CAL = 420.0;
const float ZERO_BAND   = 1.0;
const float STABLE_BAND = 1.5;

HX711 scale2;
Preferences prefs;
float calFactor2 = DEFAULT_CAL;
bool hx2Ready = false;

// Cổng Serial phần cứng 2 để bắn dây sang ESP32 Số 1
HardwareSerial SerialToMaster(2);

float weight2 = 0.0;
bool  stable2 = true;
float win2[8];
uint8_t winIdx2 = 0, winCount2 = 0;

// ============================================================
// 2. KHỞI TẠO (SETUP)
// ============================================================
void setup() {
  // Cổng Serial debug qua cáp USB máy tính
  Serial.begin(115200);
  delay(200);

  Serial.println();
  Serial.println("==================================================");
  Serial.println("  TAP TAKE GO - ESP32 SLAVE (CAN 2 - DAY UART)    ");
  Serial.println("==================================================");

  // Khởi tạo cổng truyền dây UART sang ESP32 Số 1 (RX=16 không dùng, TX=GPIO 17)
  SerialToMaster.begin(115200, SERIAL_8N1, 16, UART_TX_PIN);
  Serial.println("Cong phat day UART (GPIO 17): San sang ✓");

  // Đọc hệ số hiệu chuẩn đã lưu
  prefs.begin("scales", false);
  calFactor2 = prefs.getFloat("cal2", DEFAULT_CAL);

  // Đánh thức và kiểm tra HX711 Cân 2
  pinMode(HX2_SCK, OUTPUT);
  digitalWrite(HX2_SCK, LOW);
  pinMode(HX2_DT, INPUT_PULLUP);
  delay(50);

  Serial.print("Kiem tra HX711 Can 2 (GPIO 25, 26)... ");
  scale2.begin(HX2_DT, HX2_SCK);
  if (scale2.wait_ready_timeout(1000)) {
    scale2.set_scale(calFactor2);
    scale2.tare(3);
    hx2Ready = true;
    Serial.println("OK ✓");
  } else {
    hx2Ready = false;
    Serial.println("CHUA THAY (se tu nhan khi cam day)");
  }

  Serial.println(">>> SLAVE DANG BAN DU LIEU QUA DAY SANG MASTER! <<<");
}

// ============================================================
// 3. LỆNH SERIAL HIỆU CHUẨN
// ============================================================
void handleSerial() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();

  if (cmd == "t" || cmd == "TARE") {
    if (hx2Ready) scale2.tare(5);
    weight2 = 0;
    Serial.println("{\"event\":\"tare_success\"}");
  } else if (cmd.startsWith("c ")) {
    float knownG = cmd.substring(2).toFloat();
    if (knownG > 0 && hx2Ready) {
      long val = scale2.get_value(10);
      calFactor2 = (float)val / knownG;
      scale2.set_scale(calFactor2);
      prefs.putFloat("cal2", calFactor2);
      Serial.printf("{\"event\":\"calib_ok\",\"factor\":%.2f}\n", calFactor2);
    }
  }
}

// ============================================================
// 4. VÒNG LẶP CHÍNH (LOOP)
// ============================================================
void loop() {
  handleSerial();

  // Đọc cảm biến Cân 2
  if (hx2Ready && scale2.is_ready()) {
    float raw = scale2.get_units(1);
    if (!isnan(raw) && !isinf(raw)) {
      float diff = raw - weight2;
      if (fabs(diff) > 20.0) weight2 = raw;
      else                   weight2 += 0.35 * diff;

      win2[winIdx2] = weight2;
      winIdx2 = (winIdx2 + 1) % 8;
      if (winCount2 < 8) winCount2++;

      float mn = win2[0], mx = win2[0];
      for (uint8_t i = 1; i < winCount2; i++) {
        if (win2[i] < mn) mn = win2[i];
        if (win2[i] > mx) mx = win2[i];
      }
      stable2 = (winCount2 >= 4) && (mx - mn < STABLE_BAND);
    }
  } else if (!hx2Ready && digitalRead(HX2_DT) == LOW) {
    scale2.begin(HX2_DT, HX2_SCK);
    scale2.set_scale(calFactor2);
    scale2.tare(3);
    hx2Ready = true;
    Serial.println("{\"event\":\"can2_plugged\"}");
  }

  // Chuẩn bị dữ liệu gửi đi
  float shownW = (fabs(weight2) < ZERO_BAND) ? 0.0 : weight2;

  // Bắn qua dây UART sang Master: mỗi khi có thay đổi hoặc heartbeat mỗi 500ms
  static float lastSentW = -9999.0;
  static bool  lastSentSt = false;
  static unsigned long lastSendTime = 0;
  bool timeToSend = (millis() - lastSendTime >= 500);
  bool changed    = (fabs(shownW - lastSentW) >= 0.3) || (stable2 != lastSentSt);

  if (timeToSend || changed) {
    lastSendTime = millis();
    lastSentW    = shownW;
    lastSentSt   = stable2;

    if (hx2Ready) {
      // 1. Gửi dữ liệu cân thật sang Master
      SerialToMaster.printf("{\"slot_id\":\"%s\",\"weight\":%.1f,\"stable\":%s}\n",
                            SLOT_ID, shownW, stable2 ? "true" : "false");
      Serial.printf(">> Gui day UART: %.1fg (%s)\n", shownW, stable2 ? "On dinh" : "Dao dong");
    } else {
      // 2. Nếu chưa cắm HX711, vẫn bắn heartbeat để Master biết 2 chip đã thông dây!
      SerialToMaster.printf("{\"slot_id\":\"%s\",\"weight\":0.0,\"stable\":false,\"error\":\"no_sensor\"}\n", SLOT_ID);
      Serial.println(">> Canh bao: 2 chip thong day nhung chua nhan HX711 Can 2");
    }
  }

  delay(5);
}
