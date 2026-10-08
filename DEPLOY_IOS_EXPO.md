# 🚀 Guia de Build e Deploy do iOS (.ipa) com Expo & EAS CLI

Este projeto está totalmente configurado para gerar a build de produção no formato **`.ipa`** e enviar para a **Apple App Store** / **TestFlight** usando a ferramenta oficial da Expo (**EAS CLI**).

---

## 📋 Pré-requisitos

1. **Conta Apple Developer**:
   - Uma conta de desenvolvedor ativa na [Apple Developer Program](https://developer.apple.com) ($99/ano).
2. **Conta Expo**:
   - Conta gratuita em [expo.dev](https://expo.dev).
3. **EAS CLI instalado globalmente**:
   ```bash
   npm install -g eas-cli
   ```

---

## 🛠️ Passo a Passo para Gerar o Arquivo `.ipa`

### 1. Fazer Login no EAS
No terminal do seu projeto:
```bash
eas login
```
Insira o seu e-mail e senha da conta Expo.

---

### 2. Configurar o Projeto no EAS
Vincule o projeto ao seu workspace da Expo:
```bash
eas project:init
```

---

### 3. Gerar a Build de Produção (.ipa)
Execute o comando de build para iOS no perfil de produção:
```bash
eas build --platform ios --profile production
```

> **O que o EAS fará automaticamente:**
> - Solicitará suas credenciais da Apple Developer (apenas na 1ª vez).
> - Gerará os Certificados de Distribuição (*Distribution Certificate*) e Perfis de Provisionamento (*Provisioning Profile*).
> - Compilará o aplicativo nos servidores da Apple/Expo em modo `Release`.
> - Gerará o arquivo **`.ipa`** assinado e pronto para download direto ou envio para o App Store Connect.

---

### 4. Build de Teste Ad-Hoc / Prévia (Opcional)
Se desejar gerar um arquivo `.ipa` para instalar diretamente em iPhones registrados sem passar pela aprovação da App Store:
```bash
eas build --platform ios --profile preview
```

---

### 5. Enviar para a App Store Connect / TestFlight
Depois que a build de produção for concluída, você pode submeter o `.ipa` com um único comando:
```bash
eas submit --platform ios
```
Ou deixar configurado para build e submissão automática:
```bash
eas build --platform ios --profile production --auto-submit
```

---

## 🔒 Segurança de Credenciais & Backend
- Nenhuma chave secreta (OpenAI, Gemini, Paddle, RevenueCat, etc.) é empacotada no frontend ou no bundle do aplicativo iOS.
- Todas as requisições de IA (Gemini TTS, OpenAI Whisper, resumos e traduções) passam pela camada segura do servidor backend via tokens autenticados do Firebase Auth.
- Os identificadores de produto para RevenueCat / In-App Purchase configurados no App Store Connect:
  - `readerai_monthly_599` (R$ 5,99 / mês)
  - `readerai_annual_5990` (R$ 59,90 / ano)
  - `readerai_lifetime_19900` (R$ 199,00 vitalício)
