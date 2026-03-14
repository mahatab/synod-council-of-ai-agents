use anyhow::Result;
use futures::StreamExt;

use crate::models::config::{ChatMessage, Provider};
use crate::providers::UsageData;
use crate::providers::{
    anthropic::AnthropicProvider, cohere::CohereProvider, deepseek::DeepSeekProvider,
    google::GoogleProvider, mistral::MistralProvider, openai::OpenAIProvider,
    together::TogetherProvider, xai::XAIProvider, StreamEvent, TokenStream,
};

/// Check whether a specific model supports web search.
/// Models not in this list will NOT get web search tools injected,
/// even when the user has internet access enabled.
pub fn model_supports_web_search(provider: &Provider, model: &str) -> bool {
    match provider {
        // Anthropic: all current models support web search
        Provider::Anthropic => true,
        // Google: all current models support Google Search grounding
        Provider::Google => true,
        // xAI: only Grok-4 family supports web search via Responses API
        Provider::XAI => model.starts_with("grok-4"),
        // OpenAI: most models support web search, except nano and o3-mini
        Provider::OpenAI => !matches!(model, "gpt-4.1-nano" | "o3-mini"),
        // Other providers have no web search API
        Provider::DeepSeek | Provider::Mistral | Provider::Together | Provider::Cohere => false,
    }
}

/// Result of a completed chat call.
#[derive(Debug, Clone)]
pub struct ChatResult {
    pub content: String,
    pub usage: Option<UsageData>,
}

/// Call a model and collect the full response (non-streaming).
pub async fn call_model(
    provider: &Provider,
    model: &str,
    messages: &[ChatMessage],
    system_prompt: Option<&str>,
    api_key: &str,
    web_search_enabled: bool,
) -> Result<ChatResult> {
    let stream = create_stream(provider, model, messages, system_prompt, api_key, web_search_enabled).await?;
    collect_stream(stream).await
}

/// Call a model with a callback for each token (for progressive updates).
pub async fn call_model_streaming<F>(
    provider: &Provider,
    model: &str,
    messages: &[ChatMessage],
    system_prompt: Option<&str>,
    api_key: &str,
    web_search_enabled: bool,
    mut on_token: F,
) -> Result<ChatResult>
where
    F: FnMut(&str),
{
    let stream = create_stream(provider, model, messages, system_prompt, api_key, web_search_enabled).await?;
    let mut content = String::new();
    let mut usage = UsageData {
        input_tokens: 0,
        output_tokens: 0,
    };

    futures::pin_mut!(stream);
    while let Some(event_result) = stream.next().await {
        match event_result? {
            StreamEvent::Token(token) => {
                on_token(&token);
                content.push_str(&token);
            }
            StreamEvent::Usage(u) => {
                usage.input_tokens = usage.input_tokens.max(u.input_tokens);
                usage.output_tokens = usage.output_tokens.max(u.output_tokens);
            }
        }
    }

    let final_usage = if usage.input_tokens > 0 || usage.output_tokens > 0 {
        Some(usage)
    } else {
        None
    };

    Ok(ChatResult {
        content,
        usage: final_usage,
    })
}

/// Instruction appended to the system prompt when web search is enabled.
/// Nudges the model to actively use its search tool instead of relying on
/// potentially stale training data.
const WEB_SEARCH_SYSTEM_NOTE: &str = "\n\nYou have access to a web search tool. The user has enabled internet access because they want current, up-to-date information. You MUST use your web search tool to look up relevant information before answering, especially for questions about recent events, current data, live standings, or anything that may have changed after your training cutoff. Do NOT rely solely on your training data when web search is available. Always ground your response in search results.";

async fn create_stream(
    provider: &Provider,
    model: &str,
    messages: &[ChatMessage],
    system_prompt: Option<&str>,
    api_key: &str,
    web_search_enabled: bool,
) -> Result<TokenStream> {
    // When web search is enabled, append a note to the system prompt instructing
    // the model to actively use its search tool rather than relying on training data.
    let enhanced_prompt: Option<String>;
    let final_system_prompt = if web_search_enabled {
        enhanced_prompt = Some(match system_prompt {
            Some(sp) => format!("{}{}", sp, WEB_SEARCH_SYSTEM_NOTE),
            None => WEB_SEARCH_SYSTEM_NOTE.trim_start().to_string(),
        });
        enhanced_prompt.as_deref()
    } else {
        system_prompt
    };

    match provider {
        Provider::Anthropic => {
            AnthropicProvider::new()
                .stream_chat(api_key, model, messages, final_system_prompt, web_search_enabled)
                .await
        }
        Provider::OpenAI => {
            OpenAIProvider::new()
                .stream_chat(api_key, model, messages, final_system_prompt, web_search_enabled)
                .await
        }
        Provider::Google => {
            GoogleProvider::new()
                .stream_chat(api_key, model, messages, final_system_prompt, web_search_enabled)
                .await
        }
        Provider::XAI => {
            XAIProvider::new()
                .stream_chat(api_key, model, messages, final_system_prompt, web_search_enabled)
                .await
        }
        Provider::DeepSeek => {
            DeepSeekProvider::new()
                .stream_chat(api_key, model, messages, final_system_prompt, web_search_enabled)
                .await
        }
        Provider::Mistral => {
            MistralProvider::new()
                .stream_chat(api_key, model, messages, final_system_prompt, web_search_enabled)
                .await
        }
        Provider::Together => {
            TogetherProvider::new()
                .stream_chat(api_key, model, messages, final_system_prompt, web_search_enabled)
                .await
        }
        Provider::Cohere => {
            CohereProvider::new()
                .stream_chat(api_key, model, messages, final_system_prompt, web_search_enabled)
                .await
        }
    }
}

async fn collect_stream(stream: TokenStream) -> Result<ChatResult> {
    let mut content = String::new();
    let mut usage = UsageData {
        input_tokens: 0,
        output_tokens: 0,
    };

    futures::pin_mut!(stream);
    while let Some(event_result) = stream.next().await {
        match event_result? {
            StreamEvent::Token(token) => content.push_str(&token),
            StreamEvent::Usage(u) => {
                usage.input_tokens = usage.input_tokens.max(u.input_tokens);
                usage.output_tokens = usage.output_tokens.max(u.output_tokens);
            }
        }
    }

    let final_usage = if usage.input_tokens > 0 || usage.output_tokens > 0 {
        Some(usage)
    } else {
        None
    };

    Ok(ChatResult {
        content,
        usage: final_usage,
    })
}
