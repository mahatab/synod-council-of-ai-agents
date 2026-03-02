<p align="center">
  <img src="synod.jpg" alt="Synod" width="180" />
</p>

<h1 align="center">Synod</h1>

<p align="center">
  <strong>A council of AI models, one definitive verdict.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/tauri-v2-24C8D8?logo=tauri&logoColor=white" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/rust-stable-DEA584?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/platform-macOS-000000?logo=apple&logoColor=white" alt="macOS" />
</p>

---

Synod is a macOS desktop app that assembles a **council of AI models** to collaboratively tackle your questions. Multiple models from different providers discuss the topic sequentially — each building on what came before — then a **master model** synthesizes everything into a clear, actionable verdict.

## How It Works
<img src="pixel-art-flowchart.jpg" alt="Pixel art flowchart showing how Synod works: a user asks a question at the top, five AI council models discuss it sequentially in the middle, a crowned master model delivers the final verdict below, and a looping arrow with an @ symbol shows that users can follow up with any model afterward."/>

You ask a question, and your council of AI models responds one by one — each seeing the full discussion so far. Once everyone has weighed in, a master model synthesizes all perspectives into a clear, actionable verdict. After the verdict, @mention any model to ask follow-up questions with full context.

## Features

### Council Discussion
- **8 providers, 30+ models** — Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Together AI, and Cohere
- **Sequential deliberation** — each model sees the original question plus every previous response
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
- **Secure API key storage** in macOS Keychain
- Native macOS window with overlay title bar

## Screenshots

<p align="center">
  <img src="hero.png" alt="Synod app showing a council discussion with multiple AI models and a master verdict" width="700" />
</p>
<p align="center"><em>Many models, one verdict — watch your council think through the problem, then @mention anyone to keep talking</em></p>

<p align="center">
  <img src="settings.png" alt="Synod settings panel showing model configuration" width="700" />
</p>
<p align="center"><em>Configure your council — choose from 8 providers, 30+ models, with API keys secured in macOS Keychain</em></p>

<p align="center">
  <img src="advanced-settings.png" alt="Synod advanced settings showing prompt engineering modes" width="700" />
</p>
<p align="center"><em>Control your council with prompt engineering modes</em></p>

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

> Bring your own API keys. Each key is stored locally in the macOS Keychain — never sent anywhere except the provider's own API.

## Quick Start

### Prerequisites

- **macOS** 10.15 (Catalina) or later
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
# Production build — creates a .app bundle
cargo tauri build

# Output: src-tauri/target/release/bundle/macos/Synod.app
```

An Xcode project (`CouncilOfAIAgents.xcodeproj`) is also included with dev and build schemes.

## Architecture

```
src/                          React + TypeScript frontend
├── components/
│   ├── chat/                 ChatView, ModelResponse, MasterVerdict,
│   │                         MentionDropdown, FollowUpQuestion, StreamingText
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
| API key storage | macOS Keychain (security-framework) |
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
