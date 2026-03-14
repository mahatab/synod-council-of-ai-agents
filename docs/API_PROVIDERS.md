# API Provider Integrations

## Overview

All API calls are made from the Rust backend. API keys are stored in the OS credential store (macOS Keychain or Windows Credential Manager) and never exposed to the frontend JavaScript context. Responses are streamed via Tauri's event system.

All 8 providers share a common `parse_sse_stream()` utility (`crates/council-core/src/providers/mod.rs`) that handles SSE line buffering across TCP chunk boundaries. Each provider supplies a closure to extract `StreamEvent::Token` and `StreamEvent::Usage` events from its JSON format.

Usage data is accumulated using a MAX strategy in `stream_chat` — this uniformly handles Anthropic's split usage events, Google's cumulative totals, and single-event providers like OpenAI.

When **internet access** is enabled, each provider's `stream_chat` receives `web_search_enabled: true`. Supported providers (Anthropic, Google, OpenAI, xAI) inject web search tools into their API requests. OpenAI and xAI switch to the Responses API for web search. A system prompt nudge is appended to instruct models to actively use their search tools. Unsupported providers (DeepSeek, Mistral, Together AI, Cohere) ignore the flag.

## Anthropic (Claude)

- **Endpoint**: `POST https://api.anthropic.com/v1/messages`
- **Auth**: `x-api-key` header + `anthropic-version` header
- **Streaming**: Server-Sent Events (SSE)
- **Token extraction**: `content_block_delta` events → `delta.text`
- **Usage extraction**: Split across `message_start` (input) and `message_delta` (output) events
- **System prompt**: Top-level `system` field in request body
- **Web search**: `tools: [{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}]` added to request body. All models supported. Text tokens stream through existing `content_block_delta` events unchanged.
- **Implementation**: `crates/council-core/src/providers/anthropic.rs`

## OpenAI (GPT)

- **Endpoint**: `POST https://api.openai.com/v1/chat/completions`
- **Auth**: `Authorization: Bearer {key}` header
- **Streaming**: Server-Sent Events (SSE)
- **Token extraction**: `choices[0].delta.content`
- **Usage extraction**: Final chunk with `usage.prompt_tokens` / `usage.completion_tokens` (requires `stream_options.include_usage: true`)
- **System prompt**: `system` role message in messages array
- **Web search**: When enabled, switches to the **Responses API** at `POST https://api.openai.com/v1/responses` with `tools: [{"type": "web_search_preview"}]`. Uses `input` instead of `messages`. SSE events use `response.output_text.delta` → `delta` for tokens and `response.completed` → `response.usage` for usage. Supported by all models except `gpt-4.1-nano` and `o3-mini`.
- **Implementation**: `crates/council-core/src/providers/openai.rs`

## Google (Gemini)

- **Endpoint**: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`
- **Auth**: `key` query parameter
- **Streaming**: SSE with `alt=sse` query parameter
- **Token extraction**: `candidates[0].content.parts[].text`
- **Usage extraction**: Cumulative `usageMetadata` in every chunk (promptTokenCount / candidatesTokenCount)
- **System prompt**: `systemInstruction` field in request body
- **Web search**: `tools: [{"google_search": {}}]` added to request body. All models supported. The model decides autonomously when to search — text still arrives through existing `candidates[0].content.parts[].text` events.
- **Note**: Uses `model` role instead of `assistant`
- **Implementation**: `crates/council-core/src/providers/google.rs`

## xAI (Grok)

- **Endpoint**: `POST https://api.x.ai/v1/chat/completions`
- **Auth**: `Authorization: Bearer {key}` header
- **Streaming**: OpenAI-compatible SSE format
- **Token extraction**: `choices[0].delta.content`
- **Usage extraction**: Final chunk `usage.prompt_tokens` / `usage.completion_tokens`
- **System prompt**: `system` role message in messages array
- **Web search**: When enabled, switches to the **Responses API** at `POST https://api.x.ai/v1/responses` with `tools: [{"type": "web_search"}]`. Same SSE format as OpenAI Responses API. **Grok-4 family only** — Grok-3 and Grok-3 Mini do not support server-side tools.
- **Implementation**: `crates/council-core/src/providers/xai.rs`

## DeepSeek

- **Endpoint**: `POST https://api.deepseek.com/chat/completions`
- **Auth**: `Authorization: Bearer {key}` header
- **Streaming**: OpenAI-compatible SSE format
- **Token extraction**: `choices[0].delta.content`
- **Usage extraction**: Final chunk `usage.prompt_tokens` / `usage.completion_tokens`
- **System prompt**: `system` role message in messages array
- **Web search**: Not supported
- **Implementation**: `crates/council-core/src/providers/deepseek.rs`

## Mistral

- **Endpoint**: `POST https://api.mistral.ai/v1/chat/completions`
- **Auth**: `Authorization: Bearer {key}` header
- **Streaming**: OpenAI-compatible SSE format
- **Token extraction**: `choices[0].delta.content`
- **Usage extraction**: Final streaming chunk includes `usage.prompt_tokens` / `usage.completion_tokens` by default
- **System prompt**: `system` role message in messages array
- **Web search**: Not supported
- **Implementation**: `crates/council-core/src/providers/mistral.rs`

## Together AI (Llama)

- **Endpoint**: `POST https://api.together.xyz/v1/chat/completions`
- **Auth**: `Authorization: Bearer {key}` header
- **Streaming**: OpenAI-compatible SSE format
- **Token extraction**: `choices[0].delta.content`
- **Usage extraction**: Final chunk `usage.prompt_tokens` / `usage.completion_tokens`
- **System prompt**: `system` role message in messages array
- **Web search**: Not supported
- **Implementation**: `crates/council-core/src/providers/together.rs`

## Cohere (Command)

- **Endpoint**: `POST https://api.cohere.com/v2/chat`
- **Auth**: `Authorization: Bearer {key}` header
- **Streaming**: SSE with custom event types
- **Token extraction**: `content-delta` events → `delta.message.content.text`
- **Usage extraction**: `message-end` events → `delta.usage.tokens.input_tokens` / `delta.usage.tokens.output_tokens`
- **System prompt**: `system` role message in messages array
- **Web search**: Not supported
- **Implementation**: `crates/council-core/src/providers/cohere.rs`
