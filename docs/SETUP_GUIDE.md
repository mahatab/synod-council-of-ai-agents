# Development Setup Guide

## Prerequisites

### 1. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
```

Verify: `rustc --version` (should be 1.77+)

### 2. Install Node.js

Download from [nodejs.org](https://nodejs.org/) (v18 or later) or use nvm:

```bash
nvm install 18
nvm use 18
```

Verify: `node --version`

### 3. Install Tauri CLI

```bash
cargo install tauri-cli --version "^2"
```

Verify: `cargo tauri --version`

### 4. Platform-Specific Requirements

**macOS:**
```bash
xcode-select --install
```

**Windows:**
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) runtime (pre-installed on Windows 11)

## Running the App

### From Terminal

```bash
cd council-of-ai-agents
npm install
cargo tauri dev
```

This starts the Vite dev server and the Tauri app with hot-reload.

### From Xcode (macOS only)

1. Open `CouncilOfAIAgents.xcodeproj`
2. Select the **Dev** scheme
3. Press Cmd+B to build (runs `cargo tauri dev`)

## First Launch — Setup Wizard

On first launch, the app presents a setup wizard that walks you through:

1. **Welcome** — Overview of the app
2. **Model Selection** — Choose which AI models to include in your council
3. **API Keys** — Enter API keys for each selected provider (stored securely in your OS credential store)
4. **Master Model** — Select which model delivers the final verdict
5. **Complete** — Ready to start your first council discussion

You can change all of these settings later from the Settings panel.

## Getting API Keys

You need at least one API key to use the app. The more providers you configure, the more diverse your council discussions will be.

### Anthropic (Claude)
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Navigate to Settings > API Keys
4. Click "Create Key" and give it a name
5. Copy the key (it starts with "sk-ant-")

### OpenAI (GPT)
1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign in or create an account
3. Navigate to API Keys in the sidebar
4. Click "Create new secret key"
5. Copy the key (it starts with "sk-")

### Google (Gemini)
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click "Get API Key" in the top bar
4. Click "Create API Key"
5. Select or create a Google Cloud project
6. Copy the generated API key

### xAI (Grok)
1. Go to [console.x.ai](https://console.x.ai)
2. Sign in with your X (Twitter) account
3. Navigate to API Keys section
4. Click "Create API Key"
5. Copy the generated key

### DeepSeek
1. Go to [platform.deepseek.com](https://platform.deepseek.com)
2. Sign in or create an account
3. Navigate to API Keys section
4. Click "Create new API key"
5. Copy the generated key (it starts with "sk-")

### Mistral
1. Go to [console.mistral.ai](https://console.mistral.ai)
2. Sign in or create an account
3. Navigate to API Keys section
4. Click "Create new key"
5. Copy the generated API key

### Together AI (Llama)
1. Go to [api.together.xyz](https://api.together.xyz)
2. Sign in or create an account
3. Navigate to Settings > API Keys
4. Copy your API key

### Cohere (Command)
1. Go to [dashboard.cohere.com](https://dashboard.cohere.com)
2. Sign in or create an account
3. Navigate to API Keys section
4. Click "Create Trial Key" or "Create Production Key"
5. Copy the generated API key

## Setting Up Telegram Bot (Optional)

You can interact with Synode from any device via Telegram. The bot runs inside the desktop app and shares the same API keys, models, and settings.

### 1. Create a Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow the prompts to choose a name and username for your bot
4. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Configure in Synode

1. Open the Synode desktop app
2. Go to **Settings > Telegram**
3. Paste your bot token into the token field
4. Click **Save Token**
5. Click **Start Bot**

Once started, the status indicator will turn green. The bot will auto-start with the app on future launches when enabled.

### 3. Start Chatting

1. Open Telegram and find your bot by the username you chose
2. Send `/start` to see available commands
3. Try `/council What is the best programming language for beginners?`
4. Or chat directly with a model: `/chat gemini Tell me a fun fact`

See the full [Telegram Bot documentation](TELEGRAM_BOT.md) for all commands and advanced deployment options.

## Building for Production

```bash
cargo tauri build
```

**macOS** — The `.app` bundle will be at `src-tauri/target/release/bundle/macos/`

**Windows** — The `.exe` installer will be at `src-tauri/target/release/bundle/nsis/` and `.msi` at `src-tauri/target/release/bundle/msi/`
