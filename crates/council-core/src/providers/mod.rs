pub mod anthropic;
pub mod openai;
pub mod google;
pub mod xai;
pub mod deepseek;
pub mod mistral;
pub mod together;
pub mod cohere;

use anyhow::{anyhow, Result};
use bytes::Bytes;
use futures::stream::{self, StreamExt};
use futures::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::pin::Pin;

use crate::models::config::ChatMessage;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageData {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, Clone)]
pub enum StreamEvent {
    Token(String),
    Usage(UsageData),
}

pub type TokenStream = Pin<Box<dyn Stream<Item = Result<StreamEvent>> + Send>>;

#[allow(dead_code)]
pub trait AIProvider: Send + Sync {
    fn stream_chat(
        &self,
        api_key: &str,
        model: &str,
        messages: &[ChatMessage],
        system_prompt: Option<&str>,
        web_search_enabled: bool,
    ) -> impl std::future::Future<Output = Result<TokenStream>> + Send;
}

/// Parses a raw byte stream from an HTTP response into a stream of `StreamEvent`s.
///
/// This handles SSE (Server-Sent Events) line buffering properly: byte chunks from
/// TCP may split SSE `data:` lines across chunk boundaries. This function buffers
/// incomplete lines and only processes them once a full line (terminated by `\n`) is available.
///
/// The `parse_event` closure receives each parsed JSON object from a `data:` line
/// and should return a `Vec<StreamEvent>` with any tokens/usage extracted from it.
pub fn parse_sse_stream<S, F>(byte_stream: S, parse_event: F) -> TokenStream
where
    S: Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static,
    F: Fn(&Value) -> Vec<StreamEvent> + Send + 'static,
{
    // Chain a trailing newline sentinel to flush any remaining buffered data
    // when the byte stream ends (in case the last SSE line lacks a trailing \n).
    let byte_stream = byte_stream.chain(stream::once(futures::future::ready(
        Ok::<Bytes, reqwest::Error>(Bytes::from("\n")),
    )));

    let token_stream = byte_stream
        .scan(String::new(), move |buffer, chunk_result| {
            let result: Result<Vec<StreamEvent>> = (|| {
                let chunk: Bytes =
                    chunk_result.map_err(|e| anyhow!("Stream error: {}", e))?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));
                let mut events = Vec::new();

                // Process all complete lines (terminated by \n) from the buffer
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
                    *buffer = buffer[newline_pos + 1..].to_string();

                    // Skip empty lines, SSE event-type lines, and SSE comments
                    if line.is_empty() || line.starts_with("event:") || line.starts_with(':') {
                        continue;
                    }

                    // Extract the data payload (handle both "data: " and "data:" formats)
                    let data = if let Some(d) = line.strip_prefix("data: ") {
                        d
                    } else if let Some(d) = line.strip_prefix("data:") {
                        d
                    } else {
                        continue;
                    };

                    if data == "[DONE]" {
                        continue;
                    }

                    if let Ok(json_event) = serde_json::from_str::<Value>(data) {
                        events.extend(parse_event(&json_event));
                    }
                }

                Ok(events)
            })();

            futures::future::ready(Some(result))
        })
        .flat_map(|result| match result {
            Ok(events) => stream::iter(events.into_iter().map(Ok).collect::<Vec<_>>()),
            Err(e) => stream::iter(vec![Err(e)]),
        });

    Box::pin(token_stream)
}
