use chrono::Utc;
use teloxide::prelude::*;
use teloxide::types::ChatId;

use council_core::chat::call_model;
use council_core::models::config::{ChatMessage, Provider};
use council_core::models::session::{
    CouncilConfig, DirectChatAgent, DirectChatMessage, Session, SessionType,
};

use crate::formatting;
use crate::state::{find_model_by_name, provider_to_string, AppState, ChatMode};

/// Start a new direct chat session with a specific model.
pub async fn start_direct_chat(
    bot: &Bot,
    chat_id: ChatId,
    model_name: &str,
    initial_message: &str,
    app_state: &AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let settings = app_state.settings.read().await.clone();
    let all_models = &settings.council_models;

    let model = match find_model_by_name(all_models, model_name) {
        Some(m) => m.clone(),
        None => {
            let available: Vec<String> = all_models
                .iter()
                .map(|m| format!("  {} ({})", m.display_name, m.model))
                .collect();
            let msg = format!(
                "Model \"{}\" not found. Available models:\n{}",
                model_name,
                available.join("\n")
            );
            bot.send_message(chat_id, msg).await?;
            return Ok(());
        }
    };

    let api_key = app_state.get_api_key_for_provider(&model.provider);
    let Some(key) = api_key else {
        bot.send_message(
            chat_id,
            format!(
                "No API key configured for {} ({}). Set it up in the desktop app first.",
                model.display_name,
                model.provider.display_name()
            ),
        )
        .await?;
        return Ok(());
    };

    let agent = DirectChatAgent {
        provider: provider_to_string(&model.provider),
        model: model.model.clone(),
        display_name: model.display_name.clone(),
    };

    // Create session for persistence
    let dummy_config = CouncilConfig {
        models: vec![model.clone()],
        master_model: settings.master_model.clone(),
        system_prompt_mode: settings.system_prompt_mode.clone(),
    };
    let mut session = Session::new(initial_message.to_string(), dummy_config);
    session.session_type = SessionType::DirectChat;
    session.direct_chat_agent = Some(agent.clone());

    // Build messages
    let user_msg = DirectChatMessage {
        role: "user".to_string(),
        content: initial_message.to_string(),
        timestamp: Utc::now(),
        usage: None,
    };

    let chat_messages = vec![ChatMessage {
        role: "user".to_string(),
        content: initial_message.to_string(),
    }];

    let thinking_msg = formatting::send_thinking(bot, chat_id, &model.display_name).await?;

    match formatting::with_typing(bot, chat_id, call_model(&model.provider, &model.model, &chat_messages, None, &key, false)).await {
        Ok(result) => {
            let html = formatting::format_model_response(&model.display_name, &result.content);
            formatting::edit_html(bot, chat_id, thinking_msg.id, &html).await?;

            let assistant_msg = DirectChatMessage {
                role: "assistant".to_string(),
                content: result.content,
                timestamp: Utc::now(),
                usage: result.usage.map(|u| council_core::models::config::UsageData {
                    input_tokens: u.input_tokens,
                    output_tokens: u.output_tokens,
                }),
            };

            let messages = vec![user_msg, assistant_msg];

            // Save session
            session.direct_chat_messages = Some(messages.clone());
            let _ = council_core::sessions::save_session(&session, None);

            // Set chat mode to DirectChat for continuations
            app_state
                .set_chat_mode(
                    chat_id.0,
                    ChatMode::DirectChat {
                        session,
                        agent,
                        messages,
                    },
                )
                .await;

            formatting::send_html(
                bot,
                chat_id,
                "💬 <i>Direct chat active. Send a message to continue, or /stop to end.</i>",
            )
            .await?;
        }
        Err(e) => {
            formatting::edit_html(
                bot,
                chat_id,
                thinking_msg.id,
                &format!("❌ <b>{}</b>: {}", model.display_name, e),
            )
            .await?;
        }
    }

    Ok(())
}

/// Continue an existing direct chat session with a new message.
pub async fn continue_direct_chat(
    bot: &Bot,
    chat_id: ChatId,
    message: &str,
    mut session: Session,
    agent: DirectChatAgent,
    mut messages: Vec<DirectChatMessage>,
    app_state: &AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Resolve provider from agent string
    let provider = string_to_provider(&agent.provider);
    let Some(provider) = provider else {
        bot.send_message(chat_id, format!("Unknown provider: {}", agent.provider))
            .await?;
        return Ok(());
    };

    let api_key = app_state.get_api_key_for_provider(&provider);
    let Some(key) = api_key else {
        bot.send_message(chat_id, "API key no longer available.")
            .await?;
        return Ok(());
    };

    // Build full message history for context
    let mut chat_messages: Vec<ChatMessage> = messages
        .iter()
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();
    chat_messages.push(ChatMessage {
        role: "user".to_string(),
        content: message.to_string(),
    });

    let user_msg = DirectChatMessage {
        role: "user".to_string(),
        content: message.to_string(),
        timestamp: Utc::now(),
        usage: None,
    };
    messages.push(user_msg);

    let thinking_msg = formatting::send_thinking(bot, chat_id, &agent.display_name).await?;

    match formatting::with_typing(bot, chat_id, call_model(&provider, &agent.model, &chat_messages, None, &key, false)).await {
        Ok(result) => {
            let html = formatting::format_model_response(&agent.display_name, &result.content);
            formatting::edit_html(bot, chat_id, thinking_msg.id, &html).await?;

            let assistant_msg = DirectChatMessage {
                role: "assistant".to_string(),
                content: result.content,
                timestamp: Utc::now(),
                usage: result.usage.map(|u| council_core::models::config::UsageData {
                    input_tokens: u.input_tokens,
                    output_tokens: u.output_tokens,
                }),
            };
            messages.push(assistant_msg);

            // Update session
            session.direct_chat_messages = Some(messages.clone());
            session.updated_at = Utc::now();
            let _ = council_core::sessions::save_session(&session, None);

            // Update chat mode
            app_state
                .set_chat_mode(
                    chat_id.0,
                    ChatMode::DirectChat {
                        session,
                        agent,
                        messages,
                    },
                )
                .await;
        }
        Err(e) => {
            formatting::edit_html(
                bot,
                chat_id,
                thinking_msg.id,
                &format!("❌ <i>Error: {}</i>", e),
            )
            .await?;
            // Keep the chat mode so the user can retry
            app_state
                .set_chat_mode(
                    chat_id.0,
                    ChatMode::DirectChat {
                        session,
                        agent,
                        messages,
                    },
                )
                .await;
        }
    }

    Ok(())
}

/// Convert a provider string back to a Provider enum.
fn string_to_provider(s: &str) -> Option<Provider> {
    match s.to_lowercase().as_str() {
        "anthropic" => Some(Provider::Anthropic),
        "openai" => Some(Provider::OpenAI),
        "google" => Some(Provider::Google),
        "xai" => Some(Provider::XAI),
        "deepseek" => Some(Provider::DeepSeek),
        "mistral" => Some(Provider::Mistral),
        "together" => Some(Provider::Together),
        "cohere" => Some(Provider::Cohere),
        _ => None,
    }
}
