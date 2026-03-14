use futures::StreamExt;
use tauri::{command, AppHandle, Emitter};

use council_core::models::config::{ChatMessage, Provider, StreamChatResult, StreamToken, UsageData};
use council_core::providers::{
    anthropic::AnthropicProvider, cohere::CohereProvider, deepseek::DeepSeekProvider,
    google::GoogleProvider, mistral::MistralProvider, openai::OpenAIProvider,
    together::TogetherProvider, xai::XAIProvider, StreamEvent,
};

#[command]
pub async fn stream_chat(
    app: AppHandle,
    provider: Provider,
    model: String,
    messages: Vec<ChatMessage>,
    system_prompt: Option<String>,
    api_key: String,
    stream_id: String,
    web_search_enabled: Option<bool>,
) -> Result<StreamChatResult, String> {
    let web_search_enabled = web_search_enabled.unwrap_or(false);
    let event_name = format!("stream-token-{}", stream_id);

    // When web search is enabled, append a note to the system prompt instructing
    // the model to actively use its search tool rather than relying on training data.
    let enhanced_prompt = if web_search_enabled {
        let note = "\n\nYou have access to a web search tool. The user has enabled internet access because they want current, up-to-date information. You MUST use your web search tool to look up relevant information before answering, especially for questions about recent events, current data, live standings, or anything that may have changed after your training cutoff. Do NOT rely solely on your training data when web search is available. Always ground your response in search results.";
        Some(match &system_prompt {
            Some(sp) => format!("{}{}", sp, note),
            None => note.trim_start().to_string(),
        })
    } else {
        system_prompt
    };
    let system_ref = enhanced_prompt.as_deref();

    let result = match provider {
        Provider::Anthropic => {
            let p = AnthropicProvider::new();
            p.stream_chat(&api_key, &model, &messages, system_ref, web_search_enabled).await
        }
        Provider::OpenAI => {
            let p = OpenAIProvider::new();
            p.stream_chat(&api_key, &model, &messages, system_ref, web_search_enabled).await
        }
        Provider::Google => {
            let p = GoogleProvider::new();
            p.stream_chat(&api_key, &model, &messages, system_ref, web_search_enabled).await
        }
        Provider::XAI => {
            let p = XAIProvider::new();
            p.stream_chat(&api_key, &model, &messages, system_ref, web_search_enabled).await
        }
        Provider::DeepSeek => {
            let p = DeepSeekProvider::new();
            p.stream_chat(&api_key, &model, &messages, system_ref, web_search_enabled).await
        }
        Provider::Mistral => {
            let p = MistralProvider::new();
            p.stream_chat(&api_key, &model, &messages, system_ref, web_search_enabled).await
        }
        Provider::Together => {
            let p = TogetherProvider::new();
            p.stream_chat(&api_key, &model, &messages, system_ref, web_search_enabled).await
        }
        Provider::Cohere => {
            let p = CohereProvider::new();
            p.stream_chat(&api_key, &model, &messages, system_ref, web_search_enabled).await
        }
    };

    match result {
        Ok(mut stream) => {
            let mut full_response = String::new();
            let mut accumulated_usage = UsageData {
                input_tokens: 0,
                output_tokens: 0,
            };

            while let Some(event_result) = stream.next().await {
                match event_result {
                    Ok(StreamEvent::Token(token)) => {
                        full_response.push_str(&token);
                        let _ = app.emit(
                            &event_name,
                            StreamToken {
                                stream_id: stream_id.clone(),
                                token,
                                done: false,
                                error: None,
                                usage: None,
                            },
                        );
                    }
                    Ok(StreamEvent::Usage(usage)) => {
                        // Use MAX rather than SUM: Anthropic sends input/output in separate events
                        // Google sends cumulative totals in every chunk
                        // OpenAI/others send a single event -> max works the same as sum
                        eprintln!("[USAGE] {:?} received: input={}, output={}", provider, usage.input_tokens, usage.output_tokens);
                        accumulated_usage.input_tokens = accumulated_usage.input_tokens.max(usage.input_tokens);
                        accumulated_usage.output_tokens = accumulated_usage.output_tokens.max(usage.output_tokens);
                    }
                    Err(e) => {
                        let _ = app.emit(
                            &event_name,
                            StreamToken {
                                stream_id: stream_id.clone(),
                                token: String::new(),
                                done: true,
                                error: Some(e.to_string()),
                                usage: None,
                            },
                        );
                        return Err(e.to_string());
                    }
                }
            }

            // Emit final done event
            let _ = app.emit(
                &event_name,
                StreamToken {
                    stream_id: stream_id.clone(),
                    token: String::new(),
                    done: true,
                    error: None,
                    usage: None,
                },
            );

            let final_usage = if accumulated_usage.input_tokens > 0 || accumulated_usage.output_tokens > 0 {
                Some(accumulated_usage)
            } else {
                None
            };

            Ok(StreamChatResult {
                content: full_response,
                usage: final_usage,
            })
        }
        Err(e) => {
            let _ = app.emit(
                &event_name,
                StreamToken {
                    stream_id: stream_id.clone(),
                    token: String::new(),
                    done: true,
                    error: Some(e.to_string()),
                    usage: None,
                },
            );
            Err(e.to_string())
        }
    }
}
