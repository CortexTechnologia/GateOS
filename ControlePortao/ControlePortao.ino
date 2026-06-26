/*
  ARQUIVO: GateOS_Universal.ino
  PROJETO: GateOS Home & Pro (Cortex Technologia)
  DESCRIÇÃO: Firmware Híbrido. O portal cativo define dinamicamente se a placa 
             opera via Sinric Pro (Uso Pessoal) ou via MQTT/HiveMQ (Condomínio SaaS).
*/

#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <DNSServer.h>
#include <LittleFS.h>
#include <EEPROM.h>
#include <SinricPro.h>
#include <SinricProSwitch.h>
#include <PubSubClient.h>
#include <WiFiClientSecure.h>

// --- CONFIGURAÇÕES DE HARDWARE ---
#define PINO_RELE 0        // ESP-01S: GPIO 0 controla o relé
#define BAUD_RATE 115200

// --- CONSTANTES DO MODO CONDOMÍNIO (SaaS) ---
// Estes dados são fixos do teu servidor central. O que muda é o Tópico (Baseado no MAC)
#define MQTT_BROKER "seu-cluster.hivemq.cloud" // Substitui pelo teu Host do HiveMQ
#define MQTT_PORT   8883
#define MQTT_USER   "gateos_admin"             // Utilizador do HiveMQ
#define MQTT_PASS   "SuaSenhaForte123"         // Senha do HiveMQ

// --- VARIÁVEIS GLOBAIS DE MEMÓRIA ---
String ssid_str = "";
String pass_str = "";
String modo_uso_str = ""; // Pode ser "casa" ou "condo"
String app_key_str = "";
String app_secret_str = "";
String sinric_id_str = "";

bool emModoConfig = false;
String macAddress = "";
String mqtt_topic_abrir = "";

// --- OBJETOS DE REDE ---
ESP8266WebServer server(80);
DNSServer dnsServer;
const byte DNS_PORT = 53;

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

// ==========================================
// 1. SISTEMA DE HARD RESET (3 CICLOS)
// ==========================================
void verificarHardReset() {
  EEPROM.begin(512);
  int resetCount = EEPROM.read(0);
  
  if (resetCount >= 3) {
    Serial.println("\n[RESET] Formatação de Fabrica Solicitada!");
    EEPROM.write(0, 0); 
    EEPROM.commit();
    
    // Formata o ficheiro de configurações
    LittleFS.begin();
    LittleFS.format();
    
    WiFi.disconnect(true);
    delay(1000); 
    ESP.restart(); 
  }
  
  // Soma +1 a cada arranque rápido
  EEPROM.write(0, resetCount + 1);
  EEPROM.commit();
  
  Serial.println("[RESET] Janela de 3 segundos para hard reset...");
  delay(3000); // Se não for desligado da tomada, zera o contador
  
  EEPROM.write(0, 0);
  EEPROM.commit();
}

// ==========================================
// 2. GESTÃO DO RELÉ
// ==========================================
void pulsarPortao() {
  Serial.println("[RELÉ] A atracar o portão...");
  digitalWrite(PINO_RELE, LOW);
  delay(1000); // 1 segundo de pulso (padrão de botoeira)
  digitalWrite(PINO_RELE, HIGH);
}

// ==========================================
// 3. LÓGICA: MODO CASA (SINRIC PRO)
// ==========================================
bool onPowerState(const String &deviceId, bool &state) {
  if (state) {
    Serial.println("[SINRIC] Comando de Voz: ABRIR PORTÃO");
    pulsarPortao();
    state = false;
    SinricProSwitch& mySwitch = SinricPro[sinric_id_str];
    mySwitch.sendPowerStateEvent(false);
  }
  return true;
}

void iniciarModoCasa() {
  Serial.println("[MODO] A iniciar em Modo Uso Pessoal (Sinric Pro)");
  SinricProSwitch& mySwitch = SinricPro[sinric_id_str];
  mySwitch.onPowerState(onPowerState);
  SinricPro.begin(app_key_str.c_str(), app_secret_str.c_str());
  SinricPro.restoreDeviceStates(true);
}

// ==========================================
// 4. LÓGICA: MODO CONDOMÍNIO (MQTT)
// ==========================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (int i = 0; i < length; i++) msg += (char)payload[i];
  
  if (msg == "ABRIR") {
    Serial.println("[MQTT] Comando do Servidor: ABRIR PORTÃO");
    pulsarPortao();
  }
}

void iniciarModoCondominio() {
  Serial.println("[MODO] A iniciar em Modo Condomínio (HiveMQ)");
  espClient.setInsecure(); // Necessário para SSL em microcontroladores
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  
  // O tópico escuta especificamente comandos para o MAC desta placa
  mqtt_topic_abrir = "gateos/portoes/" + macAddress + "/abrir";
}

void gerenciarMQTT() {
  if (!mqttClient.connected()) {
    Serial.print("[MQTT] A ligar ao broker HiveMQ... ");
    String clientId = "GateOS_Pro_" + macAddress;
    
    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println("Ligado!");
      mqttClient.subscribe(mqtt_topic_abrir.c_str());
    } else {
      Serial.print("Falhou, rc=");
      Serial.print(mqttClient.state());
      Serial.println(". Nova tentativa em 3 segundos.");
      delay(3000);
    }
  }
  mqttClient.loop();
}

// ==========================================
// 5. MEMÓRIA FLASH (LITTLEFS)
// ==========================================
void carregarConfiguracoes() {
  if (LittleFS.begin()) {
    if (LittleFS.exists("/config.txt")) {
      File f = LittleFS.open("/config.txt", "r");
      if (f) {
        ssid_str = f.readStringUntil('\n'); ssid_str.trim();
        pass_str = f.readStringUntil('\n'); pass_str.trim();
        modo_uso_str = f.readStringUntil('\n'); modo_uso_str.trim();
        app_key_str = f.readStringUntil('\n'); app_key_str.trim();
        app_secret_str = f.readStringUntil('\n'); app_secret_str.trim();
        sinric_id_str = f.readStringUntil('\n'); sinric_id_str.trim();
        f.close();
      }
    }
  }
}

void guardarConfiguracoes(String q_ssid, String q_pass, String q_modo, String q_app_key, String q_app_secret, String q_id) {
  File f = LittleFS.open("/config.txt", "w");
  if (f) {
    f.println(q_ssid);
    f.println(q_pass);
    f.println(q_modo);
    f.println(q_app_key);
    f.println(q_app_secret);
    f.println(q_id);
    f.close();
  }
}

// ==========================================
// 6. PORTAL CATIVO (HTML & JS)
// ==========================================
void setupPortalCativo() {
  emModoConfig = true;
  WiFi.disconnect(true); delay(100);
  WiFi.mode(WIFI_AP);
  IPAddress apIP(192, 168, 4, 1);
  WiFi.softAPConfig(apIP, apIP, IPAddress(255, 255, 255, 0));
  WiFi.softAP("GateOS_Setup", "12345678");

  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  auto pageHandler = []() {
    int n = WiFi.scanNetworks();
    String opcoesWifi = (n == 0) ? "<option value=''>Nenhuma rede encontrada</option>" : "";
    for (int i = 0; i < n; ++i) {
      opcoesWifi += "<option value='" + WiFi.SSID(i) + "'>" + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + "dBm)</option>";
    }

    String html = R"rawliteral(
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <title>GateOS Setup</title>
    <style>
        :root { --bg: #0f172a; --card: #1e293b; --primary: #3b82f6; --text: #f1f5f9; --input-bg: #334155; }
        * { box-sizing: border-box; font-family: -apple-system, sans-serif; margin: 0; padding: 0; }
        body { background-color: var(--bg); color: var(--text); padding: 20px; display: flex; justify-content: center; }
        .container { background-color: var(--card); border-radius: 16px; padding: 30px; width: 100%; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        h1 { text-align: center; color: var(--primary); font-size: 1.8rem; margin-bottom: 5px; }
        .subtitle { text-align: center; color: #94a3b8; font-size: 0.9rem; margin-bottom: 25px; }
        label { display: block; margin: 15px 0 5px; color: #cbd5e1; font-size: 0.9rem; font-weight: bold; }
        select, input[type="text"], input[type="password"] { width: 100%; padding: 12px; background: var(--input-bg); border: 1px solid #475569; color: white; border-radius: 8px; font-size: 1rem; outline: none; }
        select:focus, input:focus { border-color: var(--primary); }
        .step-title { color: var(--primary); border-bottom: 1px solid #334155; padding-bottom: 5px; margin-top: 25px; font-size: 1.1rem; }
        .btn-submit { margin-top: 30px; width: 100%; background: var(--primary); color: white; padding: 14px; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; }
        .helper-text { font-size: 0.8rem; color: #94a3b8; }
        .mac-box { background: #0f172a; padding: 10px; text-align: center; font-family: monospace; font-size: 1.2rem; color: #10b981; border-radius: 5px; margin: 10px 0; }
        .radio-group { display: flex; gap: 15px; margin-top: 10px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>GateOS Home & Pro</h1>
        <p class="subtitle">Assistente de Configuração Universal</p>

        <form action="/save" method="POST">
            
            <div class="step-title">Qual a sua utilização?</div>
            <div class="radio-group">
                <label style="margin:0;"><input type="radio" name="modo_uso" value="casa" checked onchange="toggleModo()"> 🏠 Uso Pessoal</label>
                <label style="margin:0;"><input type="radio" name="modo_uso" value="condo" onchange="toggleModo()"> 🏢 Condomínio</label>
            </div>

            <div class="step-title">Rede Wi-Fi Local</div>
            <label>Sua Rede (SSID)</label>
            <select name="ssid" required>%WIFI_OPTIONS%</select>
            <label>Senha do Wi-Fi</label>
            <input type="password" name="pass" required>

            <div id="bloco-casa">
                <div class="step-title">Integração Smart Home</div>
                <p class="helper-text">Cole os dados do painel Sinric Pro para utilizar com Alexa/Google.</p>
                <label>App Key</label>
                <input type="text" name="app_key" id="input_app_key" placeholder="Ex: 8a7b6c5d...">
                <label>App Secret</label>
                <input type="text" name="app_secret" id="input_app_secret" placeholder="Ex: 12345678-...">
                <label>Device ID</label>
                <input type="text" name="sinric_id" id="input_sinric_id" placeholder="Ex: 5f9e8d7c...">
            </div>

            <div id="bloco-condo" style="display: none; background: rgba(59, 130, 246, 0.1); padding: 15px; border-radius: 8px; margin-top: 20px;">
                <h4 style="color: #3b82f6; margin-bottom: 5px;">Integração GateOS Pro</h4>
                <p class="helper-text">Para vincular este motor ao seu painel de síndico, copie o número de série (MAC) abaixo e cadastre-o no seu painel web.</p>
                <div class="mac-box">%MAC_ADDRESS%</div>
                <p style="font-size: 0.75rem; color: #ef4444; margin:0;">* A placa ligar-se-á automaticamente à nuvem corporativa após guardar.</p>
            </div>

            <button type="submit" class="btn-submit">GUARDAR CONFIGURAÇÃO</button>
        </form>
    </div>

    <script>
        function toggleModo() {
            const isCasa = document.querySelector('input[name="modo_uso"]:checked').value === 'casa';
            const inputsCasa = [document.getElementById('input_app_key'), document.getElementById('input_app_secret'), document.getElementById('input_sinric_id')];

            if (isCasa) {
                document.getElementById('bloco-casa').style.display = 'block';
                document.getElementById('bloco-condo').style.display = 'none';
                inputsCasa.forEach(input => input.setAttribute('required', 'true'));
            } else {
                document.getElementById('bloco-casa').style.display = 'none';
                document.getElementById('bloco-condo').style.display = 'block';
                inputsCasa.forEach(input => { input.removeAttribute('required'); input.value = ''; });
            }
        }
        window.onload = toggleModo;
    </script>
</body>
</html>
)rawliteral";

    html.replace("%WIFI_OPTIONS%", opcoesWifi);
    html.replace("%MAC_ADDRESS%", macAddress);

    server.send(200, "text/html; charset=utf-8", html);
  };

  server.on("/", HTTP_GET, pageHandler);
  
  server.on("/save", HTTP_POST, []() {
    if (server.arg("ssid").length() > 0 && server.arg("modo_uso").length() > 0) {
      
      guardarConfiguracoes(
        server.arg("ssid"), server.arg("pass"), server.arg("modo_uso"), 
        server.arg("app_key"), server.arg("app_secret"), server.arg("sinric_id")
      );
      
      String htmlSucesso = "<html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1'><style>body{background:#0f172a;color:white;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;text-align:center;} .card{background:#1e293b;padding:30px;border-radius:16px;}</style></head><body><div class='card'><h1 style='color:#10b981;'>Configuração Guardada!</h1><p style='color:#94a3b8;'>A sua placa GateOS está a reiniciar para assumir o novo modo. Pode fechar o ecrã.</p></div></body></html>";
      server.send(200, "text/html; charset=utf-8", htmlSucesso);
      
      delay(2000); 
      ESP.restart();
    } else {
      server.send(400, "text/plain", "Faltam dados essenciais.");
    }
  });
  
  server.begin();
  Serial.println("[WIFI] Portal Cativo 'GateOS_Setup' Aberto!");
}

// ==========================================
// 7. ARRANQUE DA PLACA (SETUP)
// ==========================================
void setup() {
  Serial.begin(BAUD_RATE);
  delay(500);

  // Inicializa o MAC Address globalmente
  macAddress = WiFi.macAddress();
  
  // Configuração Segura do Relé
  pinMode(PINO_RELE, OUTPUT);
  digitalWrite(PINO_RELE, HIGH); 

  // Verifica se o cliente solicitou formatação
  verificarHardReset();

  carregarConfiguracoes();

  // Verifica se existe rede configurada
  if (ssid_str == "" || modo_uso_str == "") {
    setupPortalCativo();
  } else {
    // Modo Operação Padrão
    emModoConfig = false;
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid_str.c_str(), pass_str.c_str());

    Serial.print("[WIFI] A tentar ligação");
    int tentativas = 0;
    while (WiFi.status() != WL_CONNECTED && tentativas < 30) {
      delay(500); Serial.print("."); tentativas++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n[WIFI] Ligado com Sucesso!");
      
      // Valida qual modo de negócio a placa deve rodar
      if (modo_uso_str == "casa") {
        iniciarModoCasa();
      } else if (modo_uso_str == "condo") {
        iniciarModoCondominio();
      }
      
    } else {
      Serial.println("\n[ERRO] Falha na rede Wi-Fi. A abrir Portal Cativo de Resgate...");
      setupPortalCativo();
    }
  }
}

// ==========================================
// 8. LOOP INFINITO
// ==========================================
void loop() {
  if (emModoConfig) {
    dnsServer.processNextRequest();
    server.handleClient();
  } else {
    if (modo_uso_str == "casa") {
      SinricPro.handle();
    } else if (modo_uso_str == "condo") {
      gerenciarMQTT();
    }
  }
}