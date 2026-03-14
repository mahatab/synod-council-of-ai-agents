use anyhow::{anyhow, Result};
use reqwest::Client;
use serde_json::{json, Value};

use crate::models::config::ChatMessage;
use super::{parse_sse_stream, StreamEvent, TokenStream, UsageData};

#[derive(Default)]
pub struct GoogleProvider {
    client: Client,
}

impl GoogleProvider {
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
        let contents: Vec<Value> = messages
            .iter()
            .map(|m| {
                let role = match m.role.as_str() {
                    "assistant" => "model",
                    other => other,
                };
                json!({
                    "role": role,
                    "parts": [{ "text": m.content }]
                })
            })
            .collect();

        let mut body = json!({
            "contents": contents
        });

        if let Some(system) = system_prompt {
            body["systemInstruction"] = json!({
                "parts": [{ "text": system }]
            });
        }

        if web_search_enabled {
            body["tools"] = json!([{
                "google_search": {}
            }]);
        }

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
            model, api_key
        );

        let response = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(anyhow!(
                "Google Gemini API error ({}): {}",
                status,
                error_body
            ));
        }

        let byte_stream = response.bytes_stream();

        Ok(parse_sse_stream(byte_stream, |event| {
            let mut events = Vec::new();

            if let Some(parts) = event["candidates"][0]["content"]["parts"].as_array() {
                for part in parts {
                    if let Some(text) = part["text"].as_str() {
                        events.push(StreamEvent::Token(text.to_string()));
                    }
                }
            }

            // Google sends usageMetadata (possibly in every chunk with cumulative values).
            // Handle missing fields gracefully — either field may be absent in intermediate chunks.
            if let Some(usage) = event.get("usageMetadata") {
                let input = usage
                    .get("promptTokenCount")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let output = usage
                    .get("candidatesTokenCount")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                if input > 0 || output > 0 {
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
