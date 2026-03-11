# Telegram Bot Integration

Synode includes a built-in Telegram bot that lets you interact with the Council of AI Agents from any device with Telegram installed. The bot supports both council discussions and direct chat with individual models.

## Setup

### 1. Create a Bot with BotFather

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts to name your bot
3. Choose a username for your bot (must end in `bot`, e.g., `my_synode_bot`)
4. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Enable in Synode

1. Open the Synode desktop app
2. Go to **Settings > Telegram**
3. Paste your bot token and click **Save Token**
4. Click **Start Bot** to activate

The bot will auto-start with Synode on future launches when enabled.

### 3. Start Chatting

Open your bot in Telegram and send `/start`.

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and list of available commands |
| `/council <question>` | Start a council discussion with all configured models |
| `/chat <model> <message>` | Direct chat with a specific model |
| `/models` | List all configured council models and master model |
| `/sessions` | List recent sessions |
| `/settings` | Show current settings (discussion style, depth, prompt mode) |
| `/stop` | Cancel an ongoing council discussion |
| `/help` | Show help with command usage |

### Command Examples

```
/council What programming language should I use for a new web API?
/council Is it better to buy or rent a house in 2026?

/chat claude-sonnet Explain async/await in Rust
/chat gpt-4o Write a Python function to merge two sorted lists
/chat gemini-flash What are the pros and cons of microservices?

/models
/settings
/sessions
```

### Model Name Resolution

The `/chat` command uses fuzzy matching for model names. You don't need to type the exact model ID — partial names work:

| You type | Resolves to |
|----------|-------------|
| `claude` | Claude Sonnet 4.6 (or first matching Claude model) |
| `gpt` | GPT-4o (or first matching GPT model) |
| `gemini` | Gemini 2.5 Flash (or first matching Gemini model) |
| `grok` | Grok-3 |
| `deepseek` | DeepSeek V3 |
| `llama` | Llama 4 Maverick |

## How It Works

### Shared Configuration

The Telegram bot shares the same configuration as the desktop app:

- **API keys** — read from the system keychain (macOS Keychain / Windows Credential Manager)
- **Settings** — council models, master model, discussion style, depth, and prompt mode
- **Sessions** — saved to the same location and visible in both interfaces

### Council Mode Flow

When you send `/council <question>`:

1. ✨ System prompts are generated (if using Upfront mode)
2. 🧠 Each council model responds in sequence, with a typing indicator
3. If the first model asks a clarifying question, you can reply directly
4. ⚖️ The master model synthesizes all responses into a verdict
5. The session is saved automatically

### Direct Chat Flow

When you send `/chat <model> <message>`:

1. The model name is resolved via fuzzy matching
2. 🧠 The model responds with a typing indicator
3. You can continue the conversation by sending more messages
4. Use `/stop` to end the conversation and start a new one

### Formatting

AI responses are automatically converted from Markdown to Telegram-compatible HTML:

- **Bold**, *italic*, `inline code`, and code blocks are preserved
- Headings are converted to bold text
- Lists, blockquotes, and links are formatted for Telegram
- Long messages are automatically split at paragraph boundaries
- If HTML parsing fails, messages fall back to plain text

### Typing Indicator

The bot shows a typing indicator ("recording" animation) while waiting for AI model responses. This updates every 4 seconds to stay active.

## Architecture

The bot is embedded in the Tauri desktop app as a background task:

```
┌─────────────────────────────────┐
│         Synode Desktop          │
│  ┌───────────┐  ┌────────────┐ │
│  │  Tauri UI  │  │  Telegram  │ │
│  │  (React)   │  │    Bot     │ │
│  └─────┬─────┘  └─────┬──────┘ │
│        │               │        │
│        └───────┬───────┘        │
│          council-core            │
│    (providers, keychain, etc)    │
└─────────────────────────────────┘
```

- The bot runs as a tokio task inside the same process as the desktop app
- It uses `tauri::async_runtime::spawn` to avoid conflicts with Tauri's event loop
- A oneshot channel provides graceful shutdown when the user stops the bot or closes the app
- The bot token is stored securely in the OS keychain

## Standalone Deployment (Advanced)

For always-on availability without the desktop app running, you can deploy the bot as a standalone binary.

### Build and Run

```bash
# Build the standalone binary
cargo build --release -p council-telegram-bot

# Run with your bot token
TELOXIDE_TOKEN="your-bot-token" RUST_LOG=info ./target/release/council-telegram-bot
```

The standalone binary reads API keys from the system keychain and settings from the same config directory as the desktop app.

### Docker

```dockerfile
FROM rust:1.77 as builder
WORKDIR /app
COPY . .
RUN cargo build --release -p council-telegram-bot

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/council-telegram-bot /usr/local/bin/
ENV RUST_LOG=info
CMD ["council-telegram-bot"]
```

```bash
docker build -t synode-telegram .
docker run -e TELOXIDE_TOKEN="your-bot-token" synode-telegram
```

> **Note:** Standalone and Docker deployment requires API keys to be available in the environment or keychain of the host machine. On servers without a keychain, you may need to configure API keys via environment variables or a config file.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot doesn't respond | Check that the bot is running (green indicator in Settings > Telegram) |
| "No API key" errors | Ensure you've added API keys in Settings > API Keys for the providers your models use |
| Bad formatting | The bot uses HTML mode; if a message looks broken, it falls back to plain text automatically |
| Bot stops when app closes | This is expected — the bot runs inside the desktop app. For always-on availability, use the standalone deployment |
| Token invalid | Double-check the token from @BotFather. Regenerate if needed with `/token` in BotFather |
| Multiple users | The bot tracks state per chat, so multiple Telegram users can use it simultaneously |
