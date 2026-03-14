use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::models::config::ChatMessage;
use super::{parse_sse_stream, StreamEvent, TokenStream, UsageData};

#[derive(Default)]
pub struct MistralProvider {
    client: Client,
}

impl MistralProvider {
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
            .post("https://api.mistral.ai/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Mistral API error ({}): {}",
                status,
                error_body
            ));
        }

        let byte_stream = response.bytes_stream();

        Ok(parse_sse_stream(byte_stream, |event| {
            let mut events = Vec::new();

            if let Some(content) = event["choices"][0]["delta"]["content"].as_str() {
                events.push(StreamEvent::Token(content.to_string()));
            }

            // Mistral includes usage in the final streaming chunk by default
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
