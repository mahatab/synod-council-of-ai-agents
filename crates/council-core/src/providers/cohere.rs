use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::models::config::ChatMessage;
use super::{parse_sse_stream, StreamEvent, TokenStream, UsageData};

#[derive(Default)]
pub struct CohereProvider {
    client: Client,
}

impl CohereProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
        }
    }

    pub async fn stream_chat(
        &self,
        api_key: &str,
        model: &str,
        messages: &[ChatMessage],
        system_prompt: Option<&str>,
        _web_search_enabled: bool,
    ) -> Result<TokenStream> {
        let mut api_messages: Vec<Value> = Vec::new();

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
            .post("https://api.cohere.com/v2/chat")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Cohere API error ({}): {}",
                status,
                error_body
            ));
        }

        let byte_stream = response.bytes_stream();

        // Cohere v2 uses SSE with custom event types.
        // content-delta events contain text at: delta.message.content.text
        Ok(parse_sse_stream(byte_stream, |event| {
            let mut events = Vec::new();

            if event["type"].as_str() == Some("content-delta") {
                if let Some(content) = event["delta"]["message"]["content"]["text"].as_str() {
                    events.push(StreamEvent::Token(content.to_string()));
                }
            }

            if event["type"].as_str() == Some("message-end") {
                if let Some(usage) = event["delta"].get("usage") {
                    if let (Some(input), Some(output)) = (
                        usage["tokens"]["input_tokens"].as_u64(),
                        usage["tokens"]["output_tokens"].as_u64(),
                    ) {
                        events.push(StreamEvent::Usage(UsageData {
                            input_tokens: input as u32,
                            output_tokens: output as u32,
                        }));
                    }
                }
            }

            events
        }))
    }
}
