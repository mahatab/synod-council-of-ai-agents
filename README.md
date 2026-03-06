<p align="center">
  <img src="docs/images/synod.jpg" alt="Synode" width="180" />
</p>

<h1 align="center">Synode</h1>

<p align="center">
  <strong>A council of AI models, one definitive verdict.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/tauri-v2-24C8D8?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/rust-stable-DEA584?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-000000?logo=apple&logoColor=white" alt="macOS | Windows" />
</p>

---

Synode is a desktop app for **macOS and Windows** that assembles a **council of AI models** to collaboratively tackle your questions. Multiple models from different providers discuss the topic - either sequentially (building on each other) or independently (preventing groupthink) - then a **master model** synthesizes everything into a clear, actionable verdict.

## How It Works
<img src="docs/images/pixel-art-flowchart.jpg" alt="Pixel art flowchart showing how Synode works: a user asks a question at the top, five AI council models discuss it sequentially in the middle, a crowned master model delivers the final verdict below, and a looping arrow with an @ symbol shows that users can follow up with any model afterward."/>

You ask a question, and your council of AI models responds one by one. In **Sequential** mode (as shown above), each model sees the full discussion so far. In **Independent** mode, each model only sees your original question, giving you unbiased perspectives. Once everyone has weighed in, a master model synthesizes all perspectives into a clear, actionable verdict. After the verdict, @mention any model to ask follow-up questions with full context.

## Features

### Council Discussion
- **8 providers, 30 models** — Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Together AI, and Cohere
- **Discussion styles** — Sequential (each model builds on previous responses) or Independent (each model responds without seeing others, preventing groupthink)
- **Master verdict** — a designated model synthesizes all opinions into a final recommendation
- **Clarifying questions** — the first council member can ask up to 2 clarifying questions before proceeding

### Follow-Up @Mentions
- After the verdict, type **`@`** to mention any council member or the master model
- Ask follow-up questions with **full discussion context** — the model sees every response, not just its own
- Cross-reference freely: *"@Grok what do you think about GPT's suggestion?"*
- Chain unlimited follow-ups within the same session

### Smart Prompt Engineering
- **Upfront mode** — master generates tailored system prompts for all council members before the discussion starts
- **Dynamic mode** — master generates a custom prompt for each model right before its turn, incorporating context from previous responses

### Discussion Depth
- **Thorough** — detailed analysis with comprehensive reasoning
- **Concise** — 2-3 key points per model, optimized for speed and cost
- Active settings are always visible in the chat view with (i) tooltips explaining each option

### Session Management
- Auto-save after every response — never lose a discussion
- AI-generated session titles
- Searchable history grouped by date
- Custom storage location

### Token Usage Tracking
- Per-model input/output token counts
- Aggregated usage stats in Settings
- System prompt generation tokens tracked separately

### Polished UX
- **Real-time streaming** with 4 animated cursor styles (ripple, breathing, orbit, multi-caret)
- **Dark, light, and system themes** with smooth transitions
- **Drag-and-drop** model reordering
- **Secure API key storage** — macOS Keychain or Windows Credential Manager
- **Setup wizard** with built-in API key instructions for each provider
- Native window with overlay title bar

## Screenshots

<p align="center">
  <img src="docs/images/screenshots/hero.png" alt="Synode app showing a council discussion with multiple AI models and a master verdict" width="700" />
</p>
<p align="center"><em>Many models, one verdict — watch your council think through the problem, then @mention anyone to keep talking</em></p>

<p align="center">
  <img src="docs/images/screenshots/settings.png" alt="Synode settings panel showing model configuration" width="700" />
</p>
<p align="center"><em>Configure your council — choose from 8 providers, 30+ models, with API keys secured in your OS credential store</em></p>

<p align="center">
  <img src="docs/images/screenshots/advanced-settings-2.png" alt="Synode advanced settings showing prompt engineering modes" width="700" />
</p>
<p align="center"><em>Control your council with prompt engineering modes</em></p>

### Demo

▶️ [Watch the demo video](https://youtu.be/BvqSjLuyTaA?si=UF8waoQEv-GQ2JNj)

## Supported Providers

| Provider | Models |
|----------|--------|
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Sonnet 4.5, Haiku 4.5 |
| **OpenAI** | GPT-5.2, GPT-5.2 Pro, GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano, GPT-4o, GPT-4o Mini, o3, o3-mini, o4-mini |
| **Google** | Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.5 Flash Lite |
| **xAI** | Grok-4, Grok-3, Grok-3 Mini |
| **DeepSeek** | DeepSeek V3 (Chat), DeepSeek R1 (Reasoner) |
| **Mistral** | Mistral Large, Mistral Medium, Mistral Small, Codestral |
| **Together AI** | Llama 4 Maverick, Llama 4 Scout |
| **Cohere** | Command A, Command R+ |

> Bring your own API keys. Each key is stored locally in the OS credential store (macOS Keychain or Windows Credential Manager) — never sent anywhere except the provider's own API.

## Quick Start

### Prerequisites

- **macOS** 10.15+ or **Windows** 10+
- **Rust** 1.77+ &mdash; [install via rustup](https://rustup.rs/)
- **Node.js** 18+ &mdash; [download](https://nodejs.org/)
- **Tauri CLI** v2 &mdash; `cargo install tauri-cli --version "^2"`

### Run

```bash
git clone https://github.com/mahatab/Council-of-AI-Agents.git
cd Council-of-AI-Agents
npm install
cargo tauri dev
```

A setup wizard will guide you through configuring your council models and API keys on first launch.

## Building

```bash
cargo tauri build
```

**macOS** — produces `src-tauri/target/release/bundle/macos/Synode.app` and `.dmg`

**Windows** — produces `src-tauri/target/release/bundle/nsis/Synode_x.x.x_x64-setup.exe` and `.msi`

An Xcode project (`CouncilOfAIAgents.xcodeproj`) is also included with dev and build schemes for macOS.

## Architecture

```
src/                          React + TypeScript frontend
├── components/
│   ├── chat/                 ChatView, ModelResponse, MasterVerdict,
│   │                         MentionDropdown, FollowUpQuestion, StreamingText,
│   │                         DiscussionSettingsBar
│   ├── settings/             ModelManager, ApiKeyManager, Appearance, Advanced
│   ├── setup/                First-run wizard
│   └── common/               Button, Toggle, Modal
├── stores/                   Zustand stores (council, settings, session)
├── lib/                      Tauri IPC bindings, theme, markdown
└── types/                    TypeScript definitions

src-tauri/                    Rust backend
├── commands/                 stream_chat, keychain, sessions, settings
├── providers/                8 provider integrations with shared SSE parser
└── models/                   Config, session, discussion entry types
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 (Rust + native WebView) |
| Frontend | React 19, TypeScript 5.9 |
| Styling | Tailwind CSS v4 |
| State management | Zustand |
| Animations | Framer Motion |
| Drag-and-drop | dnd-kit |
| Markdown | react-markdown + react-syntax-highlighter |
| API key storage | macOS Keychain / Windows Credential Manager |
| HTTP streaming | reqwest + tokio-stream with SSE line buffering |

## Documentation

Detailed docs live in the [`docs/`](docs/) directory:

- [Architecture](docs/ARCHITECTURE.md) — system design, state machine, streaming pipeline
- [API Providers](docs/API_PROVIDERS.md) — endpoints, auth methods, streaming formats
- [Adding Providers](docs/ADDING_PROVIDERS.md) — step-by-step guide to add new AI providers
- [Setup Guide](docs/SETUP_GUIDE.md) — installation and configuration walkthrough

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

MIT &mdash; see [LICENSE](LICENSE) for details.
