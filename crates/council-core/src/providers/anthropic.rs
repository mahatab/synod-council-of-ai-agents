use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::models::config::ChatMessage;
use super::{parse_sse_stream, StreamEvent, TokenStream, UsageData};

#[derive(Default)]
pub struct AnthropicProvider {
    client: Client,
}

impl AnthropicProvider {
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
        web_search_enabled: bool,
    ) -> Result<TokenStream> {
        let api_messages: Vec<Value> = messages
            .iter()
            .map(|m| {
                json!({
                    "role": m.role,
                    "content": m.content
                })
            })
            .collect();

        let mut body = json!({
            "model": model,
            "max_tokens": 4096,
            "messages": api_messages,
            "stream": true
        });

        if let Some(system) = system_prompt {
            body["system"] = json!(system);
        }

        if web_search_enabled {
            body["tools"] = json!([{
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 5
            }]);
        }

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Anthropic API error ({}): {}",
                status,
                error_body
            ));
        }

        let byte_stream = response.bytes_stream();

        Ok(parse_sse_stream(byte_stream, |event| {
            let mut events = Vec::new();

            // Content tokens
            if event["type"] == "content_block_delta" {
                if let Some(text) = event["delta"]["text"].as_str() {
                    events.push(StreamEvent::Token(text.to_string()));
                }
            }

            // Input tokens from message_start
            if event["type"] == "message_start" {
                if let Some(usage) = event["message"].get("usage") {
                    if let Some(input) = usage["input_tokens"].as_u64() {
                        events.push(StreamEvent::Usage(UsageData {
                            input_tokens: input as u32,
                            output_tokens: 0,
                        }));
                    }
                }
            }

            // Output tokens from message_delta
            if event["type"] == "message_delta" {
                if let Some(usage) = event.get("usage") {
                    if let Some(output) = usage["output_tokens"].as_u64() {
                        events.push(StreamEvent::Usage(UsageData {
                            input_tokens: 0,
                            output_tokens: output as u32,
                        }));
                    }
                }
            }

            events
        }))
    }
}
