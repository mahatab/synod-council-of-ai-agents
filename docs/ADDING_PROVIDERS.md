# Adding a New AI Provider

This guide walks through adding a new AI provider to the council.

## Step 1: Add the Rust Provider

Create `crates/council-core/src/providers/your_provider.rs`:

```rust
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::models::config::ChatMessage;
use super::{parse_sse_stream, StreamEvent, TokenStream, UsageData};

pub struct YourProvider {
    client: Client,
}

impl YourProvider {
    pub fn new() -> Self {
        Self { client: Client::new() }
    }

    pub async fn stream_chat(
        &self,
        api_key: &str,
        model: &str,
        messages: &[ChatMessage],
        system_prompt: Option<&str>,
        web_search_enabled: bool,  // pass true when internet access is on
    ) -> Result<TokenStream> {
        // If your provider supports web search, add tools to the request body
        // when web_search_enabled is true. Otherwise, ignore the parameter:
        let _ = web_search_enabled;
        let mut api_messages: Vec<Value> = Vec::new();

        // Add system prompt (most providers use a system role message)
        if let Some(system) = system_prompt {
            api_messages.push(json!({
                "role": "system",
                "content": system
            }));
        }

        for m in messages {
            api_messages.push(json!({
                "role": m.role,
                "content": m.content
            }));
        }

        let body = json!({
            "model": model,
            "messages": api_messages,
            "stream": true
        });

        let response = self
            .client
            .post("https://api.your-provider.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!("YourProvider API error ({}): {}", status, error_body));
        }

        let byte_stream = response.bytes_stream();

        // Use parse_sse_stream with a closure that extracts tokens and usage
        // from your provider's JSON format
        Ok(parse_sse_stream(byte_stream, |event| {
            let mut events = Vec::new();

            // Extract streaming text token
            if let Some(content) = event["choices"][0]["delta"]["content"].as_str() {
                events.push(StreamEvent::Token(content.to_string()));
            }

            // Extract usage from the final chunk
            if let Some(usage) = event.get("usage") {
                if let (Some(input), Some(output)) = (
                    usage["prompt_tokens"].as_u64(),
                    usage["completion_tokens"].as_u64(),
                ) {
                    events.push(StreamEvent::Usage(UsageData {
                        input_tokens: input as u32,
                        output_tokens: output as u32,
                    }));
                }
            }

            events
        }))
    }
}
```

The `parse_sse_stream()` utility in `crates/council-core/src/providers/mod.rs` handles all SSE line buffering, `[DONE]` sentinels, and JSON parsing. You only need to provide the closure that maps your provider's JSON to `StreamEvent` variants.

## Step 2: Register the Provider

1. Add to `crates/council-core/src/providers/mod.rs`:
   ```rust
   pub mod your_provider;
   ```

2. Add to the `Provider` enum in `crates/council-core/src/models/config.rs`:
   ```rust
   pub enum Provider {
       Anthropic,
       OpenAI,
       Google,
       XAI,
       DeepSeek,
       Mistral,
       Together,
       Cohere,
       YourProvider,
   }
   ```

   Also add match arms to `display_name()` and `keychain_service()` in the `impl Provider` block.

3. Add the match arm in `src-tauri/src/commands/api_calls.rs`:
   ```rust
   Provider::YourProvider => {
       let p = YourProvider::new();
       p.stream_chat(&api_key, &model, &messages, system_ref, web_search_enabled).await
   }
   ```

   Add the import at the top:
   ```rust
   use council_core::providers::your_provider::YourProvider;
   ```

4. Add the match arm in `crates/council-core/src/chat.rs` → `model_supports_web_search()`:
   ```rust
   Provider::YourProvider => false,  // or true if your provider supports web search
   ```

   And in `create_stream()`:
   ```rust
   Provider::YourProvider => {
       YourProvider::new()
           .stream_chat(api_key, model, messages, final_system_prompt, web_search_enabled)
           .await
   }
   ```

## Step 3: Update CSP

Add your provider's API domain to the `connect-src` directive in `src-tauri/tauri.conf.json`:

```json
"security": {
  "csp": "default-src 'self'; connect-src 'self' ... https://api.your-provider.com; ..."
}
```

## Step 4: Add Frontend Configuration

In `src/types/index.ts`, add your provider to the `Provider` type and `PROVIDERS` array:

```typescript
// Add to the Provider type union
export type Provider = 'anthropic' | ... | 'your_provider';

// Add to the PROVIDERS array
{
  id: 'your_provider',
  name: 'Your Provider',
  keychainService: 'com.council-of-ai-agents.your-provider',
  models: [
    { id: 'model-id', name: 'Model Name' },           // no web search
    { id: 'model-ws', name: 'Model WS', webSearch: true },  // with web search
  ],
  apiKeyUrl: 'https://your-provider.com/api-keys',
  apiKeySteps: [
    'Go to your-provider.com',
    'Sign in or create an account',
    'Navigate to API settings',
    'Create and copy your API key',
  ],
}
```

Also add a color mapping in `getProviderColor()`:
```typescript
case 'your_provider':
  return '#HEX_COLOR';
```

## Step 5: Add Keychain Migration Entry (macOS)

In `crates/council-core/src/keychain/keychain_macos.rs`, add your provider to the `LEGACY_SERVICES` array (used for migrating old per-provider macOS Keychain entries):

```rust
const LEGACY_SERVICES: &[(&str, &str)] = &[
    // ...existing entries...
    ("your_provider", "com.council-of-ai-agents.your-provider"),
];
```

No changes needed for Windows — the `keyring` crate in `keychain_windows.rs` uses the shared constants automatically.

## Step 6: Test

1. Run `cargo check` to verify Rust code compiles (workspace-level)
2. Run `npx tsc --noEmit` to verify TypeScript
3. Run `cargo tauri dev` and add your provider in settings
4. Verify streaming works, usage data is reported, and API keys are saved/loaded correctly
5. If your provider supports web search, enable Internet Access and verify search results appear
6. CI will verify compilation on both macOS and Windows
