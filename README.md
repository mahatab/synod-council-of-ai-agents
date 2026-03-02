# Synod — Council of AI Agents

A macOS desktop application that assembles a council of AI models to collaboratively help you make informed, fact-based decisions. Ask a question, and multiple AI models from different providers discuss it sequentially, each building on previous insights, before a master model delivers the final verdict.

## How It Works

1. **You ask a question** - "Which 70-inch TV should I buy for $600?"
2. **First council model responds** - Can ask clarifying questions if needed
3. **Each subsequent model reviews** - Sees the question and all previous responses, adds its unique perspective
4. **Master model delivers verdict** - Synthesizes all opinions into a clear, actionable recommendation

## Features

- **Multi-Model Council** - Configure models from Anthropic (Claude), OpenAI (GPT), Google (Gemini), and xAI (Grok)
- **Sequential Discussion** - Each model sees and builds on previous responses
- **Configurable Order** - Drag-and-drop to reorder which model responds first
- **Real-time Streaming** - Watch responses appear token by token
- **Clarifying Questions** - First model can ask follow-up questions for better context
- **AI-Generated System Prompts** - Master model generates tailored prompts for each council member
- **Dark & Light Mode** - Follows system preference or manual toggle
- **Session History** - Conversations saved locally, searchable in sidebar
- **Secure API Key Storage** - Keys stored in macOS Keychain
- **Claude-Inspired Design** - Clean, minimal interface with smooth animations

## Supported Providers

| Provider | Models | API |
|----------|--------|-----|
| Anthropic | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | Messages API |
| OpenAI | GPT-4o, GPT-4o Mini, GPT-4.1 | Chat Completions |
| Google | Gemini 2.0 Flash, Flash Lite, 1.5 Pro | Gemini API |
| xAI | Grok-3, Grok-3 Mini | OpenAI-compatible |

## Prerequisites

- **macOS** 10.15 (Catalina) or later
- **Rust** 1.77+ - [Install via rustup](https://rustup.rs/)
- **Node.js** 18+ - [Download](https://nodejs.org/)
- **Tauri CLI** v2 - `cargo install tauri-cli --version "^2"`

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-username/council-of-ai-agents.git
cd council-of-ai-agents

# Install frontend dependencies
npm install

# Run in development mode
cargo tauri dev
```

The app will open with a setup wizard to configure your council models and API keys.

## Building

```bash
# Production build (creates .app bundle)
cargo tauri build

# The .app will be in src-tauri/target/release/bundle/macos/
```

### Building with Xcode

Open `CouncilOfAIAgents.xcodeproj` in Xcode:
- **Dev scheme** - Runs `cargo tauri dev` for development with hot-reload
- **Build scheme** - Runs `cargo tauri build` for production builds

## Project Structure

```
council-of-ai-agents/
├── src/                    # React frontend (TypeScript)
│   ├── components/         # UI components
│   ├── stores/             # Zustand state management
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utility functions
│   └── types/              # TypeScript definitions
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── commands/       # Tauri IPC commands
│   │   ├── providers/      # AI API integrations
│   │   └── models/         # Data structures
│   └── Cargo.toml
├── docs/                   # Documentation
└── CouncilOfAIAgents.xcodeproj/  # Xcode project
```

## Tech Stack

- **Tauri v2** - Desktop framework (Rust + WebView)
- **React 18** + TypeScript - Frontend UI
- **Tailwind CSS v4** - Styling
- **Zustand** - State management
- **macOS Keychain** - Secure API key storage
- **Framer Motion** - Animations

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
