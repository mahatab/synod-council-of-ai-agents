use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::models::config::ChatMessage;
use super::{parse_sse_stream, StreamEvent, TokenStream, UsageData};

#[derive(Default)]
pub struct XAIProvider {
    client: Client,
}

impl XAIProvider {
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
        if web_search_enabled {
            return self.stream_chat_responses_api(api_key, model, messages, system_prompt).await;
        }

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
            .post("https://api.x.ai/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "xAI API error ({}): {}",
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

            // Extract usage from the final chunk (if included by the API)
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

    /// Web search via the xAI Responses API (`/v1/responses`).
    /// Uses `input` instead of `messages` and `web_search` tool.
    async fn stream_chat_responses_api(
        &self,
        api_key: &str,
        model: &str,
        messages: &[ChatMessage],
        system_prompt: Option<&str>,
    ) -> Result<TokenStream> {
        let mut input: Vec<Value> = Vec::new();

        if let Some(system) = system_prompt {
            input.push(json!({
                "role": "system",
                "content": system
            }));
        }

        for m in messages {
            input.push(json!({
                "role": m.role,
                "content": m.content
            }));
        }

        let body = json!({
            "model": model,
            "input": input,
            "tools": [{"type": "web_search"}],
            "stream": true
        });

        let response = self
            .client
            .post("https://api.x.ai/v1/responses")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "xAI Responses API error ({}): {}",
                status,
                error_body
            ));
        }

        let byte_stream = response.bytes_stream();

        Ok(parse_sse_stream(byte_stream, |event| {
            let mut events = Vec::new();

            // Text delta tokens from Responses API
            if event["type"] == "response.output_text.delta" {
                if let Some(delta) = event["delta"].as_str() {
                    events.push(StreamEvent::Token(delta.to_string()));
                }
            }

            // Usage from completed response
            if event["type"] == "response.completed" {
                if let Some(usage) = event["response"].get("usage") {
                    let input = usage["input_tokens"].as_u64().unwrap_or(0);
                    let output = usage["output_tokens"].as_u64().unwrap_or(0);
                    if input > 0 || output > 0 {
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
