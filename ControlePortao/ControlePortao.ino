/*
  ARQUIVO: ControlePortao.ino
  PROJETO: GateOS Home & Pro
  DESCRIÇÃO: Firmware Híbrido com credenciais protegidas via secrets.h
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

// IMPORTAÇÃO DAS CREDENCIAIS SEGURAS
#include "secrets.h"

// --- CONFIGURAÇÕES DE HARDWARE ---
#define PINO_RELE 0        
#define BAUD_RATE 115200

// --- VARIÁVEIS GLOBAIS DE MEMÓRIA ---
String ssid_str = "";
String pass_str = "";
String modo_uso_str = ""; 
String app_key_str = "";
String app_secret_str = "";
String sinric_id_str = "";
String device_code_str = ""; // NOVO: Senha de 4 dígitos para Condomínio
String URL_SITE = "htps://gateos.onrender.com";

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
// 1. SISTEMA DE HARD RESET CORRIGIDO
// ==========================================
void verificarHardReset() {
  EEPROM.begin(512);
  int resetCount = EEPROM.read(0);
  
  // Se a memória vier com lixo de fábrica (255), nós limpamos para zero
  if (resetCount == 255) resetCount = 0;
  
  // Exige exatamente 3 ligadas na energia (0 -> 1 -> 2)
  if (resetCount >= 2) {
    Serial.println("\n[RESET] Formatacao de Fabrica Solicitada!");
    EEPROM.write(0, 0); 
    EEPROM.commit();
    LittleFS.begin();
    LittleFS.format(); // Apaga o portal cativo
    WiFi.disconnect(true);
    delay(1000); 
    ESP.restart(); 
  }
  
  // Se ainda não deu 3 vezes, soma +1 e aguarda
  EEPROM.write(0, resetCount + 1);
  EEPROM.commit();
  
  Serial.println("[RESET] Janela de 3 segundos para puxar da tomada...");
  delay(3000); 
  
  // Se passou 3 segundos e a placa continuou ligada (uso normal da casa), zera a contagem!
  EEPROM.write(0, 0);
  EEPROM.commit();
  Serial.println("[RESET] Inicializacao normal. Sistema operante.");
}

// ==========================================
// 2. GESTÃO DO RELÉ
// ==========================================
void pulsarPortao() {
  Serial.println("[RELE] Atracando o portao...");
  digitalWrite(PINO_RELE, LOW);
  delay(1000); 
  digitalWrite(PINO_RELE, HIGH);
}

// ==========================================
// 3. MODO CASA (SINRIC PRO)
// ==========================================
bool onPowerState(const String &deviceId, bool &state) {
  if (state) {
    Serial.println("[SINRIC] Comando de Voz: ABRIR PORTAO");
    pulsarPortao();
    state = false;
    SinricProSwitch& mySwitch = SinricPro[sinric_id_str];
    mySwitch.sendPowerStateEvent(false);
  }
  return true;
}

void iniciarModoCasa() {
  Serial.println("[MODO] Sinric Pro (Casa)");
  SinricProSwitch& mySwitch = SinricPro[sinric_id_str];
  mySwitch.onPowerState(onPowerState);
  SinricPro.begin(app_key_str.c_str(), app_secret_str.c_str());
  SinricPro.restoreDeviceStates(true);
}

// ==========================================
// 4. MODO CONDOMÍNIO (MQTT)
// ==========================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (int i = 0; i < length; i++) msg += (char)payload[i];
  
  // A mágica da segurança: A placa verifica se a senha que veio do Node.js bate com a salva no portal cativo!
  String comandoEsperado = device_code_str + ":ABRIR_PORTAO_AGORA";
  
  if (msg == comandoEsperado) {
    Serial.println("[MQTT] Comando AUTORIZADO pelo painel! ABRINDO PORTÃO.");
    pulsarPortao();
  } else {
    Serial.println("[MQTT] ALERTA: Tentativa de acesso bloqueada. Payload: " + msg);
  }
}

void iniciarModoCondominio() {
  Serial.println("[MODO] HiveMQ (Condominio)");
  
  espClient.setInsecure(); 
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  
  // ATUALIZADO: Agora escuta exatamente o mesmo tópico que o deviceController.js envia
  mqtt_topic_abrir = "gate/" + macAddress + "/cmd";
}

void gerenciarMQTT() {
  if (!mqttClient.connected()) {
    Serial.print("[MQTT] Conectando ao HiveMQ... ");
    String clientId = "GateOS_Pro_" + macAddress;
    
    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
      Serial.println("Conectado!");
      
      // 1. O ESP passa a escutar os comandos do botão "Abrir"
      mqttClient.subscribe(mqtt_topic_abrir.c_str());
      
      // 2. NOVO: O ESP avisa o seu backend (mqtt.js) que está pronto!
      String topicoStatus = "gate/" + macAddress + "/status";
      mqttClient.publish(topicoStatus.c_str(), "ONLINE - Sistema Operacional");
      
    } else {
      Serial.print("Falha, rc=");
      Serial.print(mqttClient.state());
      Serial.println(". Tentando novamente em 3s.");
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
        device_code_str = f.readStringUntil('\n'); device_code_str.trim(); // Carrega a senha
        f.close();
      }
    }
  }
}

void guardarConfiguracoes(String q_ssid, String q_pass, String q_modo, String q_app_key, String q_app_secret, String q_id, String q_code) {
  File f = LittleFS.open("/config.txt", "w");
  if (f) {
    f.println(q_ssid); f.println(q_pass); f.println(q_modo);
    f.println(q_app_key); f.println(q_app_secret); f.println(q_id);
    f.println(q_code); // Salva a senha
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
        <h1>GateOS</h1>
        <p class="subtitle">Assistente de Configuracao</p>

        <form action="/save" method="POST">
            
            <div class="step-title">Qual a sua utilizacao?</div>
            <div class="radio-group">
                <label style="margin:0;"><input type="radio" name="modo_uso" value="casa" checked onchange="toggleModo()"> 🏠 Uso Pessoal</label>
                <label style="margin:0;"><input type="radio" name="modo_uso" value="condo" onchange="toggleModo()"> 🏢 Condominio</label>
            </div>

            <div class="step-title">Rede Wi-Fi Local</div>
            <label>Sua Rede (SSID)</label>
            <select name="ssid" required>%WIFI_OPTIONS%</select>
            <label>Senha do Wi-Fi</label>
            <input type="password" name="pass" required>

            <div id="bloco-casa">
                <div class="step-title">Integracao Smart Home</div>
                <p class="helper-text">Cole os dados do painel Sinric Pro para utilizar com Alexa/Google.</p>
                <label>App Key</label>
                <input type="text" name="app_key" id="input_app_key" placeholder="Ex: 8a7b6c5d...">
                <label>App Secret</label>
                <input type="text" name="app_secret" id="input_app_secret" placeholder="Ex: 12345678-...">
                <label>Device ID</label>
                <input type="text" name="sinric_id" id="input_sinric_id" placeholder="Ex: 5f9e8d7c...">
            </div>

            <div id="bloco-condo" style="display: none; background: rgba(59, 130, 246, 0.1); padding: 15px; border-radius: 8px; margin-top: 20px;">
                <h4 style="color: #3b82f6; margin-bottom: 5px;">Integracao GateOS Pro</h4>
                
                <label style="color: #3b82f6; margin-top: 0;">Senha de Seguranca</label>
                <p class="helper-text" style="margin-bottom: 8px;">Crie uma senha de 4 digitos para parear este portao no painel web do sindico.</p>
                <input type="password" name="device_code" id="input_device_code" maxlength="4" placeholder="Ex: 1234">

                <label style="color: #3b82f6; margin-top: 15px;">Serial do Equipamento</label>
                <p class="helper-text" style="margin-bottom: 5px;">Copie o MAC abaixo e cadastre-o no painel.</p>
                <div class="mac-box">%MAC_ADDRESS%</div>
            </div>

            <button type="submit" class="btn-submit">SALVAR CONFIGURACAO</button>
        </form>
    </div>

    <script>
        function toggleModo() {
            const isCasa = document.querySelector('input[name="modo_uso"]:checked').value === 'casa';
            const inputsCasa = [document.getElementById('input_app_key'), document.getElementById('input_app_secret'), document.getElementById('input_sinric_id')];
            const inputCondo = document.getElementById('input_device_code');

            if (isCasa) {
                document.getElementById('bloco-casa').style.display = 'block';
                document.getElementById('bloco-condo').style.display = 'none';
                
                inputsCasa.forEach(input => input.setAttribute('required', 'true'));
                inputCondo.removeAttribute('required');
                inputCondo.value = '';
            } else {
                document.getElementById('bloco-casa').style.display = 'none';
                document.getElementById('bloco-condo').style.display = 'block';
                
                inputsCasa.forEach(input => { input.removeAttribute('required'); input.value = ''; });
                inputCondo.setAttribute('required', 'true');
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
        server.arg("app_key"), server.arg("app_secret"), server.arg("sinric_id"),
        server.arg("device_code") // Captura a senha de 4 dígitos
      );
      
      // O uso do R"rawliteral(...)rawliteral" permite que você cole o HTML com quebras de linha e aspas sem quebrar o C++
      String htmlSucesso = R"rawliteral(
        <html>
        <head>
            <meta charset='UTF-8'>
            <meta name='viewport' content='width=device-width, initial-scale=1'>
            <style>
                body { background: #0f172a; color: white; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
                .card { background: #1e293b; padding: 30px 40px; border-radius: 16px; }
                .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
            </style>
        </head>
        <body>
            <div class='card'>
                <h1 style='color:#10b981; margin-top: 0;'>Salvo!</h1>
                <p style='color:#94a3b8;'>Placa reiniciando...</p>
                <a href="https://gateos.onrender.com/login.html" class="btn">Acessar Sistema</a>
            </div>
        </body>
        </html>
      )rawliteral";

      // Aqui a mágica acontece: O ESP8266 troca a tag pelo endereço real (https://gateos...)
      htmlSucesso.replace("%LINK_SISTEMA%", URL_SITE);

      server.send(200, "text/html; charset=utf-8", htmlSucesso);
      delay(2000); ESP.restart();
    } else {
      server.send(400, "text/plain", "Faltam dados essenciais.");
    }
  });
  
  server.begin();
  Serial.println("[WIFI] Portal Cativo Aberto!");
}

// ==========================================
// 7. ARRANQUE (SETUP) - BLINDAGEM MÁXIMA
// ==========================================
void setup() {
  // 1. ISOLAMENTO ELÉTRICO IMEDIATO: 
  // Antes de ligar o Serial ou qualquer coisa, colocamos o pino em INPUT.
  // Isso garante que o pino não mande absolutamente nada para o relé.
  pinMode(PINO_RELE, INPUT);

  // 2. Inicializa o terminal
  Serial.begin(BAUD_RATE);
  
  // 3. O "SEGUNDO DE OURO":
  // Damos 1 segundo completo de silêncio para a fonte e o relé se estabilizarem.
  // Isso resolve o problema de "atracar ao colocar na tomada".
  delay(1000); 

  // 4. Configuração do MAC (agora em ambiente estabilizado)
  macAddress = WiFi.macAddress();
  
  // 5. Segurança e Memória
  verificarHardReset();
  carregarConfiguracoes();

  // 6. ATIVAÇÃO DO CONTROLE REAL:
  // Agora que já passaram mais de 1s de boot, definimos o estado seguro:
  digitalWrite(PINO_RELE, HIGH); // Força nível alto (OFF no módulo relé)
  pinMode(PINO_RELE, OUTPUT);    // Transforma em saída controlada

  Serial.println("[SETUP] Sistema inicializado com sucesso.");

  // 7. Lógica de Conexão (Rede e Modos)
  if (ssid_str == "" || modo_uso_str == "") {
    setupPortalCativo();
  } else {
    emModoConfig = false;
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid_str.c_str(), pass_str.c_str());

    Serial.print("[WIFI] Conectando");
    int tentativas = 0;
    while (WiFi.status() != WL_CONNECTED && tentativas < 30) {
      delay(500); Serial.print("."); tentativas++;
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n[WIFI] Conectado!");
      if (modo_uso_str == "casa") iniciarModoCasa();
      else if (modo_uso_str == "condo") iniciarModoCondominio();
    } else {
      Serial.println("\n[ERRO] Falha no Wi-Fi. Abrindo Portal Cativo...");
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
    if (modo_uso_str == "casa") SinricPro.handle();
    else if (modo_uso_str == "condo") gerenciarMQTT();
  }
}