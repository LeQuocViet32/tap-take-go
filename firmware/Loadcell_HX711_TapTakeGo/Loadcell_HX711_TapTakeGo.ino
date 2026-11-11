#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <HX711.h>
#include <Preferences.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

// ============================================================
// 1. CAU HINH WIFI & SERVER TAP TAKE GO (SUA THEO MANG NHA BAN)
// ============================================================
const char* WIFI_SSID     = "11111111";
const char* WIFI_PASSWORD = "homnaytest5";

// Chon 1 trong 2 dia chi Server:
// - Qua Tailscale Funnel (khuyen dung khi WiFi la mang Public/truong hoc hoac khac mang):
//     "https://qviet.tailb1dece.ts.net/api/shelves/sensor-reading"
// - Cung mang WiFi noi bo (neu may tinh da mo cong 5000 trong Firewall):
//     "http://10.103.4.146:5000/api/shelves/sensor-reading"
const char* SERVER_URL    = "https://qviet.tailb1dece.ts.net/api/shelves/sensor-reading";

// Ma o can tren Web Admin (O 01 = KH1_1, O 02 = KH1_2, ...)
const char* SHELF_SLOT_ID = "KH1_1";

// --- CAU HINH CHAN GPIO (GIU NGUYEN PHAN CUNG CUA BAN) ---
const int HX_DT      = 16;
const int HX_SCK     = 17;
const int BTN_TARE   = 4;
const int BTN_SAMPLE = 5;
const int I2C_SDA    = 21;
const int I2C_SCL    = 22;

// --- KHOI TAO DOI TUONG ---
U8G2_SH1106_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
HX711 scale;
Preferences prefs;

// --- CAC BIEN HE THONG ---
float calFactor = 420.0;
float unitWeight = 0.0;
float lastWeight = 0.0;
bool isStable = false;

// Bo loc truot khong block (1 mau/lan doc) giup phan hoi nhanh gap 5 lan
float sampleBuf[3] = {0.0, 0.0, 0.0};
int sampleIdx = 0;
bool sampleWarm = false;

// OLED state cache de tranh ve lai khong can thiet
float lastOledGrams = -9999.0;
int lastOledCount   = -1;
bool lastOledStable = false;
bool lastOledWifi   = false;

unsigned long lastDrawTime   = 0;
unsigned long lastSerialTime = 0;
unsigned long lastHttpQueue  = 0;
unsigned long lastWifiRetry  = 0;
unsigned long lastBtnTare    = 0;
unsigned long lastBtnSample  = 0;

float lastSerialWeight = -9999.0;
bool lastSerialStable  = false;
float lastQueuedWeight = -9999.0;
bool lastQueuedStable  = false;

// Dong bo du lieu giua Core 1 (Cam bien) va Core 0 (Mang WiFi)
portMUX_TYPE netMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool hasPendingNetPush = false;
float pendingNetWeight = 0.0;
int pendingNetPcs = 0;
bool pendingNetStable = false;

void drawMessage(const char *l1, const char *l2 = "") {
  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_ncenB10_tr);
  u8g2.drawStr(0, 26, l1);
  u8g2.drawStr(0, 52, l2);
  u8g2.sendBuffer();
}

void drawDisplay(float grams, int count, bool stable) {
  u8g2.clearBuffer();

  u8g2.setFont(u8g2_font_5x8_tr);
  u8g2.drawStr(18, 10, "GRAM");
  u8g2.drawStr(76, 10, "SO LUONG");
  u8g2.drawHLine(0, 13, 128);

  u8g2.drawVLine(64, 0, 64);

  char bufGram[16];
  snprintf(bufGram, sizeof(bufGram), "%.1f", grams);
  u8g2.setFont(u8g2_font_ncenB12_tr);
  int wG = u8g2.getStrWidth(bufGram);
  u8g2.drawStr((62 - wG) / 2, 38, bufGram);

  u8g2.setFont(u8g2_font_6x12_tr);
  u8g2.drawStr(26, 58, "g");

  char bufPcs[16];
  snprintf(bufPcs, sizeof(bufPcs), "%d", count);
  u8g2.setFont(u8g2_font_ncenB12_tr);
  int wC = u8g2.getStrWidth(bufPcs);
  u8g2.drawStr(66 + (60 - wC) / 2, 38, bufPcs);

  u8g2.setFont(u8g2_font_6x12_tr);
  u8g2.drawStr(86, 58, "pcs");

  if (stable && grams > 0.5) {
    u8g2.drawDisc(4, 6, 2);
  }
  if (WiFi.status() == WL_CONNECTED) {
    u8g2.drawDisc(123, 6, 2); // Cham goc phai bao hieu da ket noi WiFi
  }

  u8g2.sendBuffer();
}

void connectWiFiInitial() {
  if (strcmp(WIFI_SSID, "TEN_WIFI_CUA_BAN") == 0 || strlen(WIFI_SSID) == 0) {
    Serial.println("{\"info\":\"Chua cau hinh WiFi, chay che do USB Serial\"}");
    return;
  }

  drawMessage("Ket noi WiFi...", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // Tat che do ngu modem WiFi de giam do tre goi tin
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 8000) {
    delay(250);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("{\"event\":\"wifi_connected\",\"ip\":\"");
    Serial.print(WiFi.localIP());
    Serial.println("\"}");
  } else {
    Serial.println("{\"warn\":\"wifi_timeout_retrying_in_background\"}");
  }
}

WiFiClient plainClient;
WiFiClientSecure secureClient;

void pushWeightToServer(float grams, int pcs, bool stable) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.setReuse(true);
  http.setTimeout(3000);

  bool began = false;
  if (strncmp(SERVER_URL, "https://", 8) == 0) {
    secureClient.setInsecure();
    began = http.begin(secureClient, SERVER_URL);
  } else {
    began = http.begin(plainClient, SERVER_URL);
  }

  if (!began) return;

  http.addHeader("Content-Type", "application/json");
  char payload[160];
  snprintf(
    payload,
    sizeof(payload),
    "{\"slot_id\":\"%s\",\"weight\":%.1f,\"pcs\":%d,\"stable\":%s}",
    SHELF_SLOT_ID,
    grams,
    pcs,
    stable ? "true" : "false"
  );

  int httpCode = http.POST((uint8_t*)payload, strlen(payload));
  if (httpCode <= 0 || httpCode >= 400) {
    Serial.print("{\"http_error\":");
    Serial.print(httpCode);
    Serial.println("}");
  }
  http.end();
}

// Tac vu chay ngam tren Core 0: gui HTTP khong lam ngat HX711/OLED tren Core 1
void networkPushTask(void* param) {
  for (;;) {
    bool shouldPush = false;
    float w = 0.0;
    int p = 0;
    bool st = false;

    portENTER_CRITICAL(&netMux);
    if (hasPendingNetPush) {
      shouldPush = true;
      w = pendingNetWeight;
      p = pendingNetPcs;
      st = pendingNetStable;
      hasPendingNetPush = false;
    }
    portEXIT_CRITICAL(&netMux);

    if (shouldPush) {
      pushWeightToServer(w, p, st);
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void doTare() {
  drawMessage("Dang tru bi...", "Vui long cho");
  scale.tare(10);
  Serial.println("{\"event\":\"tare_success\"}");
}

void doCalibrate(float knownGrams) {
  if (knownGrams <= 0) {
    Serial.println("{\"error\":\"Khoi luong mau khong hop le\"}");
    return;
  }
  drawMessage("Dang hieu chuan...", "Giu nguyen vat");

  scale.set_scale(1.0);
  float raw = scale.get_value(20);
  calFactor = raw / knownGrams;
  scale.set_scale(calFactor);

  prefs.putFloat("cal", calFactor);

  char msg[32];
  snprintf(msg, sizeof(msg), "H/so: %.1f", calFactor);
  drawMessage("Hieu chuan XONG!", msg);

  Serial.print("{\"event\":\"cal_success\",\"new_factor\":");
  Serial.print(calFactor, 2);
  Serial.println("}");
  delay(1500);
}

void handleSerial() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();

  if (cmd == "t" || cmd == "TARE") {
    doTare();
  } else if (cmd.startsWith("c")) {
    float weight = cmd.substring(1).toFloat();
    doCalibrate(weight);
  } else if (cmd == "r") {
    calFactor = 420.0;
    prefs.putFloat("cal", calFactor);
    scale.set_scale(calFactor);
    Serial.println("{\"event\":\"reset_calibration\"}");
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(BTN_TARE, INPUT_PULLUP);
  pinMode(BTN_SAMPLE, INPUT_PULLUP);

  Wire.begin(I2C_SDA, I2C_SCL);
  u8g2.begin();
  drawMessage("PBL4 - CAN SMART", "Khoi dong...");

  prefs.begin("scale", false);
  calFactor = prefs.getFloat("cal", 420.0);

  scale.begin(HX_DT, HX_SCK);
  scale.set_scale(calFactor);

  if (!scale.wait_ready_timeout(2000)) {
    drawMessage("Loi HX711!", "Kiem tra day");
    Serial.println("{\"error\":\"HX711_not_found\"}");
    while (true) delay(1000);
  }

  doTare();
  connectWiFiInitial();

  xTaskCreatePinnedToCore(networkPushTask, "WiFiPush", 8192, NULL, 1, NULL, 0);
}

void loop() {
  handleSerial();

  if (digitalRead(BTN_TARE) == LOW && (millis() - lastBtnTare > 400)) {
    lastBtnTare = millis();
    doTare();
    sampleWarm = false;
  }

  if (digitalRead(BTN_SAMPLE) == LOW && (millis() - lastBtnSample > 400)) {
    lastBtnSample = millis();
    float currentW = scale.get_units(5);
    if (currentW > 0.5) {
      unitWeight = currentW;
      drawMessage("Da luu 1 PCS!", "Bat dau dem...");
      delay(1000);
    } else {
      drawMessage("Loi:", "Chua dat vat mau!");
      delay(1000);
    }
    lastOledGrams = -9999.0;
  }

  // Thu ket noi lai WiFi ngam neu mat ket noi (khong block cam bien)
  if (strcmp(WIFI_SSID, "TEN_WIFI_CUA_BAN") != 0 && WiFi.status() != WL_CONNECTED && millis() - lastWifiRetry > 15000) {
    lastWifiRetry = millis();
    WiFi.reconnect();
  }

  // Doc 1 mau moi ngay khi HX711 san sang (khong cho 5 mau lien tiep gay tre 500ms)
  if (scale.is_ready()) {
    float rawGrams = scale.get_units(1);

    if (!sampleWarm) {
      sampleBuf[0] = rawGrams;
      sampleBuf[1] = rawGrams;
      sampleBuf[2] = rawGrams;
      sampleWarm = true;
    } else {
      float curAvg = (sampleBuf[0] + sampleBuf[1] + sampleBuf[2]) / 3.0;
      if (fabs(rawGrams - curAvg) >= 5.0) {
        // Nhay buoc nhanh khi dat/nhac vat (khong bi tre bo loc trung binh)
        sampleBuf[0] = rawGrams;
        sampleBuf[1] = rawGrams;
        sampleBuf[2] = rawGrams;
      } else {
        sampleBuf[sampleIdx] = rawGrams;
        sampleIdx = (sampleIdx + 1) % 3;
      }
    }

    float filteredRaw = (sampleBuf[0] + sampleBuf[1] + sampleBuf[2]) / 3.0;
    float currentGrams = filteredRaw;

    // THUAT TOAN AUTO-ZERO TRACKING (BAM DIEM 0)
    if (fabs(currentGrams) <= 0.8) {
      currentGrams = 0.0;
    }
    static unsigned long zeroStartTime = 0;
    if (fabs(filteredRaw) > 0.3 && fabs(filteredRaw) <= 1.0) {
      if (zeroStartTime == 0) zeroStartTime = millis();
      if (millis() - zeroStartTime > 2000) {
        scale.tare(5);
        sampleWarm = false;
        zeroStartTime = 0;
      }
    } else {
      zeroStartTime = 0;
    }

    isStable = (fabs(currentGrams - lastWeight) < 0.4);
    lastWeight = currentGrams;

    int count = 0;
    if (currentGrams > 0.5 && unitWeight > 0.0) {
      count = round(currentGrams / unitWeight);
    }

    bool wifiOk = (WiFi.status() == WL_CONNECTED);
    if (millis() - lastDrawTime >= 120 &&
        (fabs(currentGrams - lastOledGrams) >= 0.1 || count != lastOledCount || isStable != lastOledStable || wifiOk != lastOledWifi)) {
      lastDrawTime = millis();
      lastOledGrams = currentGrams;
      lastOledCount = count;
      lastOledStable = isStable;
      lastOledWifi = wifiOk;
      drawDisplay(currentGrams, count, isStable);
    }

    // Xuat Serial ngay khi thay doi >= 0.2g hoac doi stable (toi da moi 80ms), heartbeat 1.5s
    bool serialChanged = fabs(currentGrams - lastSerialWeight) >= 0.2 || (isStable != lastSerialStable);
    bool serialBeat    = millis() - lastSerialTime >= 1500;
    if ((serialChanged && millis() - lastSerialTime >= 80) || serialBeat) {
      lastSerialTime = millis();
      lastSerialWeight = currentGrams;
      lastSerialStable = isStable;

      Serial.print("{\"weight\":");
      Serial.print(currentGrams, 1);
      Serial.print(",\"pcs\":");
      Serial.print(count);
      Serial.print(",\"stable\":");
      Serial.print(isStable ? "true" : "false");
      Serial.println("}");
    }

    // Day vao hang doi Core 0 de gui WiFi ngam ngay khi co thay doi (toi da moi 100ms), heartbeat 2.5s
    bool netChanged = fabs(currentGrams - lastQueuedWeight) >= 0.2 || (isStable != lastQueuedStable);
    bool netBeat    = millis() - lastHttpQueue >= 2500;
    if (wifiOk && ((netChanged && millis() - lastHttpQueue >= 100) || netBeat)) {
      lastHttpQueue = millis();
      lastQueuedWeight = currentGrams;
      lastQueuedStable = isStable;

      portENTER_CRITICAL(&netMux);
      pendingNetWeight = currentGrams;
      pendingNetPcs = count;
      pendingNetStable = isStable;
      hasPendingNetPush = true;
      portEXIT_CRITICAL(&netMux);
    }
  }
}
