# 🛡️ GateOS - Smart Gate Pro

> **Sistema de Controle de Acesso IoT Multi-Condomínio (SaaS)**

O **GateOS Pro** é uma solução completa _end-to-end_ para automatização e controle de portões eletrônicos. Diferente de soluções caseiras, ele utiliza uma arquitetura **Centralizada em Nuvem** com suporte a múltiplos inquilinos (Multi-Tenant), permitindo gerenciar diversos condomínios e residências usando um único servidor e cluster MQTT.

![Status](https://img.shields.io/badge/Status-Production-green)
![Tech](https://img.shields.io/badge/Stack-NodeJS%20|%20React%20Native%20|%20ESP32-blue)

## 🏗️ Arquitetura do Sistema

O sistema é composto por três pilares principais:

1.  **Hardware (IoT):** ESP32 instalado no portão. Gera um ID único, conecta-se via MQTT seguro (TLS) e possui interface de configuração própria (Captive Portal).
2.  **Backend (Cloud):** API REST em Node.js + Express. Gerencia autenticação (JWT), usuários, permissões e comunica-se com o Broker.
3.  **Interfaces (Client):**
    * **Web PWA:** Painel administrativo e de uso para moradores.
    * **Mobile App:** Aplicativo React Native (Expo) para Android/iOS com feedback tátil.

---

## 🚀 Tecnologias Utilizadas

* **Firmware:** C++ (Arduino IDE), PubSubClient, WiFiManager (Custom).
* **Backend:** Node.js, Express, Sequelize (ORM), Helmet (Segurança).
* **Banco de Dados:** PostgreSQL (Produção) / SQLite (Desenvolvimento).
* **Mensageria:** MQTT (HiveMQ Cloud) com criptografia SSL/TLS.
* **Mobile:** React Native, Expo, Async Storage.
* **Web:** HTML5, CSS3, Javascript Vanilla (SPA leve).

---

## 🛠️ Configuração e Instalação

### Pré-requisitos
* Node.js v18+
* Conta no HiveMQ Cloud (Broker MQTT)
* Conta no Render/Railay (ou VPS)
* Banco de Dados PostgreSQL (Ex: Neon, Supabase)

### 1. Configuração do Backend (Servidor)

1.  Clone o repositório:
    ```bash
    git clone [https://github.com/seu-usuario/gateos-pro.git](https://github.com/seu-usuario/gateos-pro.git)
    cd gateos-pro
    ```
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Configure as variáveis de ambiente (veja `.env.example`).
4.  Inicie o servidor:
    ```bash
    # Modo Desenvolvimento (SQLite)
    npm start
    
    # Modo Produção (PostgreSQL)
    NODE_ENV=production npm start
    ```

### 2. Configuração do Hardware (ESP32)

1.  Abra o arquivo `ControlePortao.ino` na Arduino IDE.
2.  Instale as bibliotecas necessárias: `PubSubClient`.
3.  Renomeie `secrets-example.h` para `secrets.h` e insira o certificado CA do HiveMQ.
4.  Faça o upload para o ESP32.
5.  **No local de instalação:**
    * Ligue o ESP32. Ele criará uma rede Wi-Fi **"GateOS"**.
    * Conecte-se a ela (Senha: `12345678`).
    * Acesse `192.168.4.1` no navegador.
    * Configure o Wi-Fi do cliente e copie o **Serial Number**.

### 3. Configuração do App Mobile

1.  Navegue até a pasta do app (onde está `package.json` e `index.tsx`).
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Execute via Expo:
    ```bash
    npx expo start
    ```

---

## 📖 Guia de Uso (Administrador)

1.  Acesse o sistema Web ou App.
2.  Crie uma conta selecionando **"Criar Novo Local"**.
3.  No painel, clique em **Adicionar Dispositivo (+)**.
4.  Insira o **Serial Number** copiado do ESP32 e defina uma senha de segurança (padrão: 1234).
5.  Compartilhe o **Código de Convite** do condomínio com os moradores.

---

## 🛡️ Segurança

* **Comunicação Segura:** Todo tráfego MQTT é criptografado via TLS (MQTTS).
* **Proteção de API:** Implementado Rate Limiting, Helmet (Headers seguros) e Sanitização Anti-XSS.
* **Autenticação:** Tokens JWT com expiração para sessões de usuário.
* **Hardware:** Watchdog Timer (WDT) implementado para evitar travamentos físicos.

## 📄 Licença

Este projeto é proprietário e desenvolvido para fins comerciais/pessoais.