/*
 * ================================================================
 *  TAP TAKE GO - HE THONG 2 CAN LOADCELL + OLED (ESP32 DevKit V1)
 *  Phien ban on dinh (FINAL)
 * ================================================================
 *  DAU DAY:
 *   HX711 #1 (Can 1 - KH1_1): DT -> GPIO16, SCK -> GPIO17
 *   HX711 #2 (Can 2 - KH1_2): DT -> GPIO25, SCK -> GPIO26
 *   OLED I2C 128x64 (SH1106): SDA -> GPIO21, SCL -> GPIO22
 *   VCC cua 2 HX711 -> 3V3 (hoac 5V/VIN), GND chung voi ESP32
 *   OLED VCC -> 3V3, GND -> GND
 *
 *  LENH SERIAL (115200 baud, chon "New Line"):
 *   t        : Tru bi ca 2 can
 *   t1 / t2  : Tru bi rieng can 1 / can 2
 *   c1 500   : Hieu chuan can 1 voi qua chuan 500g (dat vat len truoc)
 *   c2 500   : Hieu chuan can 2 voi qua chuan 500g
 *   r        : Reset he so hieu chuan ve mac dinh
 *   i        : In thong tin trang thai
 *
 *  THU VIEN CAN CAI: "HX711 Arduino Library" (Bogdan Necula), "U8g2"
 * ================================================================
 */

#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <HX711.h>
#include <Preferences.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ============================================================
// 1. CAU HINH
// ============================================================
// Dat false neu chi dung cap USB (Web Serial) -> chay muot nhat
#define USE_WIFI true

const char* WIFI_SSID     = "Minh Hien";
const char* WIFI_PASSWORD = "Khongbiet";
const char* SERVER_URL    = "http://192.168.1.116:5000/api/shelves/sensor-reading";

const char* SLOT_ID_1 = "KH1_1";
const char* SLOT_ID_2 = "KH1_2";

const int HX1_DT  = 16;
const int HX1_SCK = 17;
const int HX2_DT  = 25;
const int HX2_SCK = 26;

const int I2C_SDA = 21;
const int I2C_SCL = 22;

const float DEFAULT_CAL = 420.0;   // He so mac dinh (can hieu chuan lai)
const float ZERO_BAND   = 1.0;     // |g| nho hon nguong nay -> hien 0
const float STABLE_BAND = 1.5;     // Dao dong < 1.5g trong cua so -> on dinh

// ============================================================
// 2. DOI TUONG
// ============================================================
// Neu man hinh bi lech/nhoe chu, doi sang dong SSD1306 ben duoi:
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
// U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

Preferences prefs;

// Gom moi thu cua 1 can vao 1 struct cho gon
struct Scale {
  HX711 hx;
  int dt, sck;
  const char* slot;
  const char* name;
  float cal;
  bool  ready;           // Da nhan cam bien
  float weight;          // Gia tri da loc (g)
  bool  stable;
  unsigned long lastSample;
  float win[8];          // Cua so kiem tra on dinh
  uint8_t winIdx;
  uint8_t winCount;
};

Scale s1 = { HX711(), HX1_DT, HX1_SCK, SLOT_ID_1, "CAN 1", DEFAULT_CAL };
Scale s2 = { HX711(), HX2_DT, HX2_SCK, SLOT_ID_2, "CAN 2", DEFAULT_CAL };

// Du lieu chia se cho task WiFi (chay o core 0)
volatile float sharedW1 = 0, sharedW2 = 0;
volatile bool  sharedSt1 = true, sharedSt2 = true;
volatile bool  sharedR1 = false, sharedR2 = false;
volatile bool  wifiOk = false;

// ============================================================
// 3. KHOI TAO / PHAT HIEN CAM BIEN (KHONG BAO GIO TREO)
// ============================================================
// Keo SCK xuong LOW de danh thuc HX711 (SCK HIGH > 60us = HX711 ngu!)
void prepPins(Scale& s) {
  pinMode(s.sck, OUTPUT);
  digitalWrite(s.sck, LOW);
  pinMode(s.dt, INPUT_PULLUP);  // Khong cam -> DT luon HIGH
}

// Cho toi da timeoutMs de DT xuong LOW (HX711 bao co du lieu)
bool waitDtLow(Scale& s, unsigned long timeoutMs) {
  unsigned long t0 = millis();
  while (millis() - t0 < timeoutMs) {
    if (digitalRead(s.dt) == LOW) return true;
    delay(2);
  }
  return false;
}

void resetFilter(Scale& s) {
  s.weight = 0;
  s.stable = true;
  s.winIdx = 0;
  s.winCount = 0;
}

void activate(Scale& s) {
  s.hx.begin(s.dt, s.sck);   // An toan vi DT da san sang
  s.hx.set_scale(s.cal);
  s.hx.tare(5);
  resetFilter(s);
  s.ready = true;
  s.lastSample = millis();
}

// ============================================================
// 4. DOC + LOC NHIEU (goi lien tuc trong loop, khong chan)
// ============================================================
void updateScale(Scale& s) {
  if (!s.ready) {
    // Cam nong: neu vua cam day vao -> tu kich hoat
    if (digitalRead(s.dt) == LOW) {
      activate(s);
      Serial.printf("{\"event\":\"connected\",\"slot_id\":\"%s\"}\n", s.slot);
    }
    return;
  }

  if (!s.hx.is_ready()) {
    // Qua 1.5s khong co du lieu -> coi nhu rut day
    if (millis() - s.lastSample > 1500) {
      s.ready = false;
      resetFilter(s);
      Serial.printf("{\"event\":\"disconnected\",\"slot_id\":\"%s\"}\n", s.slot);
    }
    return;
  }

  s.lastSample = millis();
  float raw = s.hx.get_units(1);   // Da san sang -> doc ngay, ~0ms
  if (isnan(raw) || isinf(raw)) return;

  // Loc EMA: thay doi lon (dat/lay do) -> nhay ngay; nho -> lam muot
  float diff = raw - s.weight;
  if (fabs(diff) > 20.0) s.weight = raw;
  else                   s.weight += 0.35 * diff;

  // Cua so on dinh 8 mau (~0.8s)
  s.win[s.winIdx] = s.weight;
  s.winIdx = (s.winIdx + 1) % 8;
  if (s.winCount < 8) s.winCount++;
  float mn = s.win[0], mx = s.win[0];
  for (uint8_t i = 1; i < s.winCount; i++) {
    if (s.win[i] < mn) mn = s.win[i];
    if (s.win[i] > mx) mx = s.win[i];
  }
  s.stable = (s.winCount >= 4) && (mx - mn < STABLE_BAND);
}

float shown(const Scale& s) {
  return (fabs(s.weight) < ZERO_BAND) ? 0.0 : s.weight;
}

// ============================================================
// 5. MAN HINH OLED - CHIA DOI 2 CAN
// ============================================================
void drawHalf(const Scale& s, int yTop) {
  // Nhan
  u8g2.setFont(u8g2_font_6x10_tr);
  char label[24];
  snprintf(label, sizeof(label), "%s (%s)", s.name, s.slot);
  u8g2.drawStr(0, yTop + 9, label);

  if (!s.ready) {
    u8g2.drawStr(10, yTop + 26, "-- Chua ket noi --");
    return;
  }

  // Dau hieu on dinh
  if (s.stable) u8g2.drawStr(110, yTop + 9, "OK");
  else          u8g2.drawStr(110, yTop + 9, "~");

  // So can lon, can phai
  char buf[16];
  snprintf(buf, sizeof(buf), "%.1f", shown(s));
  u8g2.setFont(u8g2_font_logisoso16_tr);
  int w = u8g2.getStrWidth(buf);
  u8g2.drawStr(112 - w, yTop + 30, buf);
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.drawStr(116, yTop + 30, "g");
}

void drawScreen() {
  u8g2.clearBuffer();
  drawHalf(s1, 0);
  u8g2.drawHLine(0, 32, 128);
  drawHalf(s2, 33);
#if USE_WIFI
  if (wifiOk) u8g2.drawDisc(100, 4, 2);   // Cham = WiFi OK
#endif
  u8g2.sendBuffer();
}

void drawSplash(const char* line2) {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB12_tr);
  u8g2.drawStr(10, 26, "TAP TAKE GO");
  u8g2.setFont(u8g2_font_6x10_tr);
  u8g2.drawStr(10, 48, line2);
  u8g2.sendBuffer();
}

// ============================================================
// 6. XUAT SERIAL CHO WEB (JSON moi dong)
// ============================================================
void printScale(const Scale& s) {
  Serial.printf("{\"slot_id\":\"%s\",\"weight\":%.1f,\"stable\":%s}\n",
                s.slot, shown(s), s.stable ? "true" : "false");
}

// ============================================================
// 7. TASK WIFI CHAY NEN (CORE 0) -> OLED KHONG BAO GIO GIAT
// ============================================================
#if USE_WIFI
void postSlot(const char* slot, float g, bool st) {
  HTTPClient http;
  http.setTimeout(1500);
  if (!http.begin(SERVER_URL)) return;
  http.addHeader("Content-Type", "application/json");
  char body[96];
  snprintf(body, sizeof(body), "{\"slot_id\":\"%s\",\"weight\":%.1f,\"stable\":%s}",
           slot, g, st ? "true" : "false");
  http.POST((uint8_t*)body, strlen(body));
  http.end();
}

void wifiTask(void*) {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  float lastW1 = -9999, lastW2 = -9999;
  unsigned long lastBeat = 0, lastRetry = 0;
  bool announced = false;

  for (;;) {
    wifiOk = (WiFi.status() == WL_CONNECTED);

    if (!wifiOk) {
      announced = false;
      if (millis() - lastRetry > 15000) {
        lastRetry = millis();
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      }
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }

    if (!announced) {
      announced = true;
      Serial.printf("{\"event\":\"wifi_connected\",\"ip\":\"%s\"}\n",
                    WiFi.localIP().toString().c_str());
    }

    bool beat = millis() - lastBeat > 3000;
    float w1 = sharedW1, w2 = sharedW2;

    if (sharedR1 && (beat || fabs(w1 - lastW1) >= 0.5)) {
      postSlot(SLOT_ID_1, w1, sharedSt1);
      lastW1 = w1;
    }
    if (sharedR2 && (beat || fabs(w2 - lastW2) >= 0.5)) {
      postSlot(SLOT_ID_2, w2, sharedSt2);
      lastW2 = w2;
    }
    if (beat) lastBeat = millis();

    vTaskDelay(pdMS_TO_TICKS(250));
  }
}
#endif

// ============================================================
// 8. LENH SERIAL
// ============================================================
void tareScale(Scale& s) {
  if (!s.ready) return;
  s.hx.tare(5);
  resetFilter(s);
}

void calibrate(Scale& s, float knownGrams, const char* key) {
  if (!s.ready || knownGrams <= 0) {
    Serial.println("{\"event\":\"calib_error\"}");
    return;
  }
  long avg = s.hx.get_value(10);    // Da tru bi (offset)
  float f = avg / knownGrams;
  if (fabs(f) < 1) { Serial.println("{\"event\":\"calib_error\"}"); return; }
  s.cal = f;
  s.hx.set_scale(f);
  prefs.putFloat(key, f);
  resetFilter(s);
  Serial.printf("{\"event\":\"calib_ok\",\"slot_id\":\"%s\",\"factor\":%.2f}\n", s.slot, f);
}

void handleSerial() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  if (cmd == "t" || cmd == "TARE") {
    tareScale(s1); tareScale(s2);
    Serial.println("{\"event\":\"tare_success\"}");
  } else if (cmd == "t1") {
    tareScale(s1); Serial.println("{\"event\":\"tare_success\",\"slot_id\":\"KH1_1\"}");
  } else if (cmd == "t2") {
    tareScale(s2); Serial.println("{\"event\":\"tare_success\",\"slot_id\":\"KH1_2\"}");
  } else if (cmd.startsWith("c1 ")) {
    calibrate(s1, cmd.substring(3).toFloat(), "cal1");
  } else if (cmd.startsWith("c2 ")) {
    calibrate(s2, cmd.substring(3).toFloat(), "cal2");
  } else if (cmd == "r") {
    s1.cal = s2.cal = DEFAULT_CAL;
    prefs.putFloat("cal1", DEFAULT_CAL);
    prefs.putFloat("cal2", DEFAULT_CAL);
    if (s1.ready) s1.hx.set_scale(DEFAULT_CAL);
    if (s2.ready) s2.hx.set_scale(DEFAULT_CAL);
    Serial.println("{\"event\":\"reset_calibration_both\"}");
  } else if (cmd == "i") {
    Serial.printf("Can1: %s cal=%.2f | Can2: %s cal=%.2f | WiFi: %s\n",
                  s1.ready ? "OK" : "KHONG", s1.cal,
                  s2.ready ? "OK" : "KHONG", s2.cal,
                  wifiOk ? WiFi.localIP().toString().c_str() : "chua");
  }
}

// ============================================================
// 9. SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);
  delay(200);
  Serial.println();
  Serial.println("=== TAP TAKE GO - 2 CAN LOADCELL (ESP32) ===");

  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(400000);           // I2C nhanh -> OLED ve muot
  u8g2.begin();
  drawSplash("Dang khoi dong...");

  prefs.begin("scales", false);
  s1.cal = prefs.getFloat("cal1", DEFAULT_CAL);
  s2.cal = prefs.getFloat("cal2", DEFAULT_CAL);

  // Danh thuc ca 2 HX711 cung luc roi doi toi da 1s
  prepPins(s1);
  prepPins(s2);
  delay(50);

  Serial.print("Can 1 (GPIO16/17)... ");
  if (waitDtLow(s1, 1000)) { activate(s1); Serial.println("OK"); }
  else Serial.println("KHONG THAY (se tu nhan khi cam)");

  Serial.print("Can 2 (GPIO25/26)... ");
  if (waitDtLow(s2, 1000)) { activate(s2); Serial.println("OK"); }
  else Serial.println("KHONG THAY (se tu nhan khi cam)");

#if USE_WIFI
  xTaskCreatePinnedToCore(wifiTask, "wifi", 8192, NULL, 1, NULL, 0);
#endif

  Serial.println(">>> SAN SANG <<<");
}

// ============================================================
// 10. LOOP (core 1) - chi doc can, ve OLED, xuat Serial
// ============================================================
void loop() {
  handleSerial();

  updateScale(s1);
  updateScale(s2);

  // Cap nhat du lieu cho task WiFi
  sharedW1 = shown(s1); sharedSt1 = s1.stable; sharedR1 = s1.ready;
  sharedW2 = shown(s2); sharedSt2 = s2.stable; sharedR2 = s2.ready;

  // OLED ~10 khung/giay
  static unsigned long lastDraw = 0;
  if (millis() - lastDraw >= 100) {
    lastDraw = millis();
    drawScreen();
  }

  // Serial: gui khi thay doi >= 0.5g hoac moi 1s (heartbeat)
  static float lastP1 = -9999, lastP2 = -9999;
  static bool  lastS1 = false, lastS2 = false;
  static unsigned long lastBeat = 0;
  bool beat = millis() - lastBeat >= 1000;

  if (s1.ready && (beat || fabs(shown(s1) - lastP1) >= 0.5 || s1.stable != lastS1)) {
    printScale(s1); lastP1 = shown(s1); lastS1 = s1.stable;
  }
  if (s2.ready && (beat || fabs(shown(s2) - lastP2) >= 0.5 || s2.stable != lastS2)) {
    printScale(s2); lastP2 = shown(s2); lastS2 = s2.stable;
  }
  if (beat) lastBeat = millis();

  delay(5);
}
