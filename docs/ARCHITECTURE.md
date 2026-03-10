# Architecture

## Overview

Council of AI Agents (Synode) is a Tauri v2 desktop application with a Rust backend and React frontend. It operates in two modes: **Council Mode**, where multiple AI models discuss a user's question before a master model delivers a final verdict, and **Direct Chat**, for 1-on-1 conversations with any individual model. Both modes share the same streaming infrastructure across 8 AI providers.

```
┌──────────────────────────────────────────────────────────────┐
│                       React Frontend                         │
│  ┌───────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐  │
│  │ ChatView  │  │ DirectChat │  │ Settings │  │ Sidebar  │  │
│  │ (Council) │  │  View      │  │          │  │          │  │
│  └─────┬─────┘  └─────┬──────┘  └────┬─────┘  │ Setup    │  │
│        │              │              │        │ Wizard   │  │
│  ┌─────┴──────────────┴──────────────┴────────┴──────────┐  │
│  │                  Zustand Stores                       │  │
│  │  councilStore │ directChatStore │ settingsStore │      │  │
│  │  sessionStore                                        │  │
│  └──────────────────────┬────────────────────────────────┘  │
│                         │ invoke() / listen()                │
├─────────────────────────┼────────────────────────────────────┤
│                         │ Tauri IPC Bridge                   │
├─────────────────────────┼────────────────────────────────────┤
│                       Rust Backend                           │
│  ┌──────────────────────┴────────────────────────────────┐  │
│  │                   Commands                            │  │
│  │  api_calls │ keychain │ sessions │ settings            │  │
│  └──────────────────────┬────────────────────────────────┘  │
│  ┌──────────────────────┴────────────────────────────────┐  │
│  │                   Providers                           │  │
│  │  anthropic │ openai │ google  │ xai                    │  │
│  │  deepseek  │ mistral│ together│ cohere                 │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   Credential Store (platform) │ File I/O              │  │
│  │   macOS: Keychain │ Windows: Credential Manager       │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Council Discussion State Machine

```
IDLE ──► USER_INPUT ──► GENERATING_SYSTEM_PROMPTS ──► MODEL_TURN
                                                         │
                                                    ┌────┴────┐
                                                    │         │
                                               CLARIFYING  (next model)
                                                  Q&A         │
                                                    │    MODEL_TURN
                                                    │         │
                                                    └────┬────┘
                                                         │
                                                   MASTER_VERDICT
                                                         │
                                                      COMPLETE
                                                         │
                                                    FOLLOW_UP ──► COMPLETE
                                                         │
                                                       ERROR
```

**States**: `idle`, `user_input`, `generating_system_prompts`, `model_turn`, `clarifying_qa`, `master_verdict`, `complete`, `follow_up`, `error`

## Direct Chat State Machine

```
IDLE ──► STREAMING ──► IDLE
              │
            ERROR
```

**States**: `idle`, `streaming`, `error`

### Direct Chat Flow

1. **Agent Selection** — User picks a model from the agent picker grid (searchable, sorted by API key availability)
2. **Message Send** — User types a message; a session is auto-created on the first message
3. **Streaming** — Response streams in real-time via the same SSE infrastructure used by Council mode
4. **Multi-turn** — Full conversation history is sent with each request for contextual responses
5. **Auto-save** — Session is saved after each response with an AI-generated title

### Discussion Flow

1. **User Input** — User asks a question
2. **System Prompt Generation** — Master model generates tailored system prompts for each council member (upfront mode) or per-turn (dynamic mode)
3. **Model Turns** — In **Sequential** mode, each council model responds one by one, seeing all previous responses. In **Independent** mode, the first model runs sequentially (may ask clarifying questions), then remaining models stream their responses **in parallel** via `Promise.all` with per-model completion tracking. A Council Progress overlay shows real-time status for each model
4. **Master Verdict** — Master model synthesizes all responses into a final verdict (thorough or concise based on discussion depth setting)
5. **Follow-Up** — User can `@mention` any council member or the master model for follow-up questions with full discussion context

## Streaming Architecture

1. Frontend calls `invoke("stream_chat", { provider, model, messages, systemPrompt, apiKey, streamId })`
2. Rust backend routes to the appropriate provider and creates an HTTP request with SSE streaming
3. The shared `parse_sse_stream()` utility handles SSE line buffering across TCP chunk boundaries
4. Each provider supplies a closure to extract tokens/usage from its JSON format
5. As `StreamEvent::Token` events arrive, Rust emits Tauri events on the `stream-token-{streamId}` channel
6. Frontend listens for these events and appends tokens in real-time
7. `StreamEvent::Usage` events are accumulated using a MAX strategy (handles Anthropic's split events, Google's cumulative totals, and single-event providers uniformly)
8. When streaming completes, the invoke returns a `StreamChatResult` with the full response and final usage data

## IPC Commands

| Module     | Commands                                                        |
|------------|-----------------------------------------------------------------|
| `keychain` | `save_api_key`, `get_api_key`, `delete_api_key`, `has_api_key`  |
| `api_calls`| `stream_chat`                                                   |
| `sessions` | `save_session`, `load_session`, `list_sessions`, `delete_session`, `get_default_sessions_path` |
| `settings` | `load_settings`, `save_settings`                                |

## Data Storage

- **API Keys**: Platform credential store — single unified JSON blob at `com.council-of-ai-agents.keys` with in-memory `ApiKeyCache`. Uses conditional compilation (`#[cfg(target_os)]`) to select the backend:
  - **macOS**: Keychain via `security-framework` (`keychain_macos.rs`). Auto-migrates legacy per-provider entries.
  - **Windows**: Credential Manager via `keyring` crate (`keychain_windows.rs`)
- **Settings**: JSON file via `dirs::config_dir()`:
  - **macOS**: `~/Library/Application Support/council-of-ai-agents/settings.json`
  - **Windows**: `%APPDATA%\council-of-ai-agents\settings.json`
- **Sessions**: JSON files via `dirs::data_dir()` (configurable via `sessionSavePath` setting):
  - **macOS**: `~/Library/Application Support/council-of-ai-agents/sessions/`
  - **Windows**: `%APPDATA%\council-of-ai-agents\sessions\`

## Frontend Architecture

### Stores (Zustand)

- **councilStore** — Orchestrates the entire discussion state machine: model turns, sequential/parallel streaming, clarifying Q&A, master verdict, and follow-up questions. Tracks per-model parallel streams via `parallelStreams: Map<number, { content: string; done: boolean }>`
- **directChatStore** — Manages 1-on-1 conversations: streaming state, message send/receive, error handling
- **settingsStore** — Loads/saves `AppSettings` (council models, master model, theme, system prompt mode, discussion depth, cursor style, session path, app mode)
- **sessionStore** — Session CRUD: create, load, list, save, delete. Groups sessions by date in the sidebar. Filters by active app mode (council vs direct chat)

### Key Components

- **SetupWizard** — First-run flow: welcome → model selection → API keys → master model → complete
- **ChatView** — Council discussion interface with sequential and parallel streaming, `@mention` dropdown for follow-ups
- **DirectChatView** — 1-on-1 chat interface with multi-turn conversation history
- **AgentPicker** — Searchable model selection grid with provider color coding and API key availability
- **ModelResponse** / **MasterVerdict** — Display model outputs with provider colors, copy buttons
- **ClarifyingQuestion** — Emerald-themed UI for answering the first model's clarifying questions, with markdown rendering and highlighted list items
- **ParallelStatusOverlay** — Transparent floating status bar showing real-time completion status for each parallel model (thinking/streaming/done/error) with animated provider-colored indicators
- **SettingsModal** — Tabbed settings: Models (drag-drop reorder), API Keys, Appearance, Advanced, Sessions
- **Sidebar** — Session history grouped by date (Today, Yesterday, Previous 7 Days, etc.), filtered by active mode
- **ModeToggle** — Switches between Council and Direct Chat modes

### Settings

```typescript
interface AppSettings {
  councilModels: ModelConfig[];         // Ordered list of council models
  masterModel: MasterModelConfig;       // Model that generates prompts and verdicts
  systemPromptMode: 'upfront' | 'dynamic';
  discussionStyle: 'sequential' | 'independent'; // Independent enables parallel execution
  discussionDepth: 'thorough' | 'concise';
  theme: 'light' | 'dark' | 'system';
  cursorStyle: 'ripple' | 'breathing' | 'orbit' | 'multi';
  sessionSavePath: string | null;       // Custom session storage path
  setupCompleted: boolean;
}

// App-level mode (stored in settingsStore, not persisted)
type AppMode = 'council' | 'direct_chat';
```
