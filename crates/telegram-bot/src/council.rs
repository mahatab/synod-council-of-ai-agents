use std::collections::HashMap;

use teloxide::prelude::*;
use teloxide::types::ChatId;

use council_core::chat::call_model;
use council_core::models::config::{
    AppSettings, ChatMessage, DiscussionDepth, DiscussionStyle, MasterModelConfig, ModelConfig,
    SystemPromptMode,
};
use council_core::models::session::{
    CouncilConfig, DiscussionEntry, Session,
};
use council_core::providers::UsageData;

use crate::formatting;
use crate::state::{provider_to_string, AppState, ChatMode};

/// Run a full council discussion and send progressive messages via Telegram.
pub async fn run_council(
    bot: &Bot,
    chat_id: ChatId,
    question: &str,
    app_state: &AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let settings = app_state.settings.read().await.clone();
    let models = &settings.council_models;
    let master = &settings.master_model;

    if models.is_empty() {
        bot.send_message(chat_id, "No council models configured. Set up models in the desktop app first.")
            .await?;
        return Ok(());
    }

    app_state.set_chat_mode(chat_id.0, ChatMode::CouncilActive).await;

    formatting::send_html(
        bot,
        chat_id,
        &format!("🏛 <b>Starting council discussion with {} models...</b>", models.len()),
    )
    .await?;

    // Create session
    let council_config = CouncilConfig {
        models: models.clone(),
        master_model: master.clone(),
        system_prompt_mode: settings.system_prompt_mode.clone(),
    };
    let mut session = Session::new(question.to_string(), council_config);
    session.discussion.push(DiscussionEntry::User {
        content: question.to_string(),
    });

    let mut discussion_so_far: Vec<DiscussionEntry> = vec![DiscussionEntry::User {
        content: question.to_string(),
    }];

    let mut master_prompt_gen_usage: Option<UsageData> = None;

    // 1. Generate system prompts (if upfront mode)
    let mut system_prompts: HashMap<String, String> = HashMap::new();
    if matches!(settings.system_prompt_mode, SystemPromptMode::Upfront) {
        if let Some(master_key) = app_state.get_api_key_for_provider(&master.provider) {
            formatting::send_html(bot, chat_id, "✨ <i>Generating system prompts...</i>").await?;

            let prompt = build_upfront_prompt_request(question, models, &settings);
            match formatting::with_typing(bot, chat_id, call_model(
                &master.provider,
                &master.model,
                &prompt,
                Some("You are an AI orchestrator. Generate system prompts for council models. Return valid JSON only."),
                &master_key,
                false,
            ))
            .await
            {
                Ok(result) => {
                    master_prompt_gen_usage = result.usage;
                    if let Some(json_str) = extract_json(&result.content) {
                        if let Ok(map) = serde_json::from_str::<HashMap<String, String>>(&json_str) {
                            system_prompts = map;
                        }
                    }
                }
                Err(e) => {
                    formatting::send_html(
                        bot,
                        chat_id,
                        &format!("⚠️ Failed to generate system prompts: {}. Using defaults.", formatting::escape_html(&e.to_string())),
                    )
                    .await?;
                }
            }
        }
    }

    // 2. Call each model sequentially with progressive messages
    for (i, model) in models.iter().enumerate() {
        let thinking_msg = formatting::send_thinking(bot, chat_id, &model.display_name).await?;

        let api_key = app_state.get_api_key_for_provider(&model.provider);

        if let Some(key) = api_key {
            let messages = build_context_messages(
                question,
                &discussion_so_far,
                i == 0,
                &settings.discussion_style,
            );

            let prompt_key = format!("{}:{}", provider_to_string(&model.provider), model.model);
            let default_prompt = get_default_system_prompt(model, i == 0, &settings.discussion_depth, &settings.discussion_style);
            let system_prompt = system_prompts
                .get(&prompt_key)
                .map(|s| s.as_str())
                .unwrap_or(&default_prompt);

            match formatting::with_typing(bot, chat_id, call_model(&model.provider, &model.model, &messages, Some(system_prompt), &key, false)).await {
                Ok(result) => {
                    // Check for clarifying question (first model only)
                    if i == 0 && looks_like_clarifying_question(&result.content) {
                        let clarify_html = format!(
                            "<b>❓ {} has a clarifying question:</b>\n\n{}\n\n<i>Please reply to answer.</i>",
                            formatting::markdown_to_telegram_html(&model.display_name),
                            formatting::markdown_to_telegram_html(&result.content),
                        );
                        formatting::edit_html(bot, chat_id, thinking_msg.id, &clarify_html).await?;

                        // Save state for resumption
                        app_state
                            .set_chat_mode(
                                chat_id.0,
                                ChatMode::CouncilWaitingClarification {
                                    session: session.clone(),
                                    discussion_json: serde_json::to_string(&discussion_so_far).unwrap_or_default(),
                                    clarifying_content: result.content.clone(),
                                    model: model.clone(),
                                    system_prompt: system_prompt.to_string(),
                                    messages_json: serde_json::to_string(&messages).unwrap_or_default(),
                                },
                            )
                            .await;
                        return Ok(());
                    }

                    // Edit "thinking" message with actual response
                    let html = formatting::format_model_response(&model.display_name, &result.content);
                    formatting::edit_html(bot, chat_id, thinking_msg.id, &html).await?;

                    let entry = DiscussionEntry::Model {
                        provider: provider_to_string(&model.provider),
                        model: model.model.clone(),
                        display_name: model.display_name.clone(),
                        system_prompt: Some(system_prompt.to_string()),
                        content: result.content,
                        clarifying_exchange: None,
                        usage: result.usage.map(|u| council_core::models::config::UsageData {
                            input_tokens: u.input_tokens,
                            output_tokens: u.output_tokens,
                        }),
                    };
                    discussion_so_far.push(entry.clone());
                    session.discussion.push(entry);
                }
                Err(e) => {
                    formatting::edit_html(
                        bot,
                        chat_id,
                        thinking_msg.id,
                        &format!(
                            "<b>💬 {}</b>\n\n❌ <i>Error: {}</i>",
                            formatting::escape_html(&model.display_name),
                            formatting::escape_html(&e.to_string()),
                        ),
                    )
                    .await?;

                    let entry = DiscussionEntry::Model {
                        provider: provider_to_string(&model.provider),
                        model: model.model.clone(),
                        display_name: model.display_name.clone(),
                        system_prompt: None,
                        content: format!("[Error: {}]", e),
                        clarifying_exchange: None,
                        usage: None,
                    };
                    discussion_so_far.push(entry.clone());
                    session.discussion.push(entry);
                }
            }
        } else {
            formatting::edit_html(
                bot,
                chat_id,
                thinking_msg.id,
                &format!(
                    "<b>💬 {}</b>\n\n⚠️ <i>No API key configured for {}</i>",
                    model.display_name,
                    model.provider.display_name()
                ),
            )
            .await?;
        }
    }

    // 3. Master verdict
    generate_master_verdict(bot, chat_id, question, &discussion_so_far, master, master_prompt_gen_usage, &settings, app_state, &mut session).await?;

    // 4. Save session
    let _ = council_core::sessions::save_session(&session, None);

    app_state.clear_chat_mode(chat_id.0).await;
    Ok(())
}

/// Resume council after a clarifying question was answered.
pub async fn resume_after_clarification(
    bot: &Bot,
    chat_id: ChatId,
    answer: &str,
    saved_session: Session,
    discussion_json: &str,
    clarifying_content: &str,
    model: &ModelConfig,
    system_prompt: &str,
    messages_json: &str,
    app_state: &AppState,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let settings = app_state.settings.read().await.clone();
    let models = &settings.council_models;
    let master = &settings.master_model;

    app_state.set_chat_mode(chat_id.0, ChatMode::CouncilActive).await;

    let mut session = saved_session;
    let mut discussion_so_far: Vec<DiscussionEntry> =
        serde_json::from_str(discussion_json).unwrap_or_default();
    let original_messages: Vec<ChatMessage> =
        serde_json::from_str(messages_json).unwrap_or_default();

    // Get follow-up from first model with the clarification answer
    let api_key = app_state.get_api_key_for_provider(&model.provider);
    if let Some(key) = api_key {
        let mut follow_up_messages = original_messages;
        follow_up_messages.push(ChatMessage {
            role: "assistant".to_string(),
            content: clarifying_content.to_string(),
        });
        follow_up_messages.push(ChatMessage {
            role: "user".to_string(),
            content: answer.to_string(),
        });

        let thinking_msg = formatting::send_thinking(bot, chat_id, &model.display_name).await?;

        match formatting::with_typing(bot, chat_id, call_model(
            &model.provider,
            &model.model,
            &follow_up_messages,
            Some(system_prompt),
            &key,
            false,
        ))
        .await
        {
            Ok(result) => {
                let html = formatting::format_model_response(&model.display_name, &result.content);
                formatting::edit_html(bot, chat_id, thinking_msg.id, &html).await?;

                let entry = DiscussionEntry::Model {
                    provider: provider_to_string(&model.provider),
                    model: model.model.clone(),
                    display_name: model.display_name.clone(),
                    system_prompt: Some(system_prompt.to_string()),
                    content: result.content,
                    clarifying_exchange: Some(vec![
                        council_core::models::session::ClarifyingExchange {
                            question: clarifying_content.to_string(),
                            answer: answer.to_string(),
                        },
                    ]),
                    usage: result.usage.map(|u| council_core::models::config::UsageData {
                        input_tokens: u.input_tokens,
                        output_tokens: u.output_tokens,
                    }),
                };
                discussion_so_far.push(entry.clone());
                session.discussion.push(entry);
            }
            Err(e) => {
                formatting::edit_html(
                    bot,
                    chat_id,
                    thinking_msg.id,
                    &format!("❌ <i>Error: {}</i>", formatting::escape_html(&e.to_string())),
                )
                .await?;
            }
        }
    }

    // Continue with remaining models (skip first)
    let user_question = session.user_question.clone();
    for (i, m) in models.iter().enumerate() {
        if i == 0 {
            continue; // Already handled
        }

        let thinking_msg = formatting::send_thinking(bot, chat_id, &m.display_name).await?;

        let api_key = app_state.get_api_key_for_provider(&m.provider);
        if let Some(key) = api_key {
            let messages = build_context_messages(
                &user_question,
                &discussion_so_far,
                false,
                &settings.discussion_style,
            );
            let default_prompt = get_default_system_prompt(m, false, &settings.discussion_depth, &settings.discussion_style);

            match formatting::with_typing(bot, chat_id, call_model(&m.provider, &m.model, &messages, Some(&default_prompt), &key, false)).await {
                Ok(result) => {
                    let html = formatting::format_model_response(&m.display_name, &result.content);
                    formatting::edit_html(bot, chat_id, thinking_msg.id, &html).await?;

                    let entry = DiscussionEntry::Model {
                        provider: provider_to_string(&m.provider),
                        model: m.model.clone(),
                        display_name: m.display_name.clone(),
                        system_prompt: Some(default_prompt),
                        content: result.content,
                        clarifying_exchange: None,
                        usage: result.usage.map(|u| council_core::models::config::UsageData {
                            input_tokens: u.input_tokens,
                            output_tokens: u.output_tokens,
                        }),
                    };
                    discussion_so_far.push(entry.clone());
                    session.discussion.push(entry);
                }
                Err(e) => {
                    formatting::edit_html(
                        bot,
                        chat_id,
                        thinking_msg.id,
                        &format!(
                            "<b>💬 {}</b>\n\n❌ <i>Error: {}</i>",
                            formatting::escape_html(&m.display_name),
                            formatting::escape_html(&e.to_string()),
                        ),
                    )
                    .await?;
                }
            }
        }
    }

    // Master verdict
    generate_master_verdict(bot, chat_id, &user_question, &discussion_so_far, master, None, &settings, app_state, &mut session).await?;

    let _ = council_core::sessions::save_session(&session, None);
    app_state.clear_chat_mode(chat_id.0).await;
    Ok(())
}

async fn generate_master_verdict(
    bot: &Bot,
    chat_id: ChatId,
    question: &str,
    discussion: &[DiscussionEntry],
    master: &MasterModelConfig,
    prompt_gen_usage: Option<UsageData>,
    settings: &AppSettings,
    app_state: &AppState,
    session: &mut Session,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let verdict_msg = formatting::send_html(
        bot,
        chat_id,
        "🧠 <b>Generating master verdict...</b>",
    )
    .await?;

    if let Some(key) = app_state.get_api_key_for_provider(&master.provider) {
        let verdict_prompt = build_master_verdict_prompt(question, discussion);
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: verdict_prompt,
        }];

        let sys_prompt = if matches!(settings.discussion_depth, DiscussionDepth::Concise) {
            "You are the master AI judge in a council of AI models. You have reviewed all council members' opinions on the user's question. Deliver a brief, focused verdict in 3-5 sentences. Highlight only the key takeaway and recommended action. No lengthy sections."
        } else {
            "You are the master AI judge in a council of AI models. You have reviewed all council members' opinions on the user's question. Your job is to synthesize the best advice, resolve any disagreements, and deliver a clear, actionable final verdict. Be thorough but concise. Structure your response with clear sections."
        };

        match formatting::with_typing(bot, chat_id, call_model(&master.provider, &master.model, &messages, Some(sys_prompt), &key, false)).await {
            Ok(result) => {
                let html = formatting::format_master_verdict(&result.content);
                formatting::edit_html(bot, chat_id, verdict_msg.id, &html).await?;

                let combined_usage = combine_usage(
                    prompt_gen_usage,
                    result.usage.map(|u| council_core::models::config::UsageData {
                        input_tokens: u.input_tokens,
                        output_tokens: u.output_tokens,
                    }),
                );

                session.discussion.push(DiscussionEntry::MasterVerdict {
                    provider: provider_to_string(&master.provider),
                    model: master.model.clone(),
                    content: result.content,
                    usage: combined_usage,
                });
            }
            Err(e) => {
                formatting::edit_html(
                    bot,
                    chat_id,
                    verdict_msg.id,
                    &format!("❌ <b>Master verdict failed:</b> {}", e),
                )
                .await?;
            }
        }
    } else {
        formatting::edit_html(
            bot,
            chat_id,
            verdict_msg.id,
            "⚠️ <i>No API key for master model.</i>",
        )
        .await?;
    }

    Ok(())
}

// --- Helper functions ported from councilStore.ts ---

fn build_context_messages(
    user_question: &str,
    discussion_so_far: &[DiscussionEntry],
    is_first_model: bool,
    discussion_style: &DiscussionStyle,
) -> Vec<ChatMessage> {
    let mut messages = vec![ChatMessage {
        role: "user".to_string(),
        content: user_question.to_string(),
    }];

    if !is_first_model && matches!(discussion_style, DiscussionStyle::Sequential) {
        let previous_opinions: Vec<String> = discussion_so_far
            .iter()
            .filter_map(|e| {
                if let DiscussionEntry::Model {
                    display_name,
                    provider,
                    content,
                    ..
                } = e
                {
                    Some(format!("--- {} ({}) ---\n{}", display_name, provider, content))
                } else {
                    None
                }
            })
            .collect();

        if !previous_opinions.is_empty() {
            messages.push(ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "Here are the previous council members' opinions:\n\n{}\n\nPlease provide your own analysis and verdict. You may agree or disagree with previous opinions, but provide your own reasoning.",
                    previous_opinions.join("\n\n")
                ),
            });
        }
    }

    messages
}

fn get_default_system_prompt(
    model: &ModelConfig,
    is_first: bool,
    depth: &DiscussionDepth,
    style: &DiscussionStyle,
) -> String {
    let depth_instruction = if matches!(depth, DiscussionDepth::Concise) {
        "Be concise and direct. Provide 2-3 key points maximum. Skip lengthy explanations and focus on actionable insights."
    } else {
        "Be thorough, factual, and specific."
    };

    if is_first {
        return format!(
            "You are {}, a member of an AI council helping a user make an informed decision. You are the FIRST model to respond. You may ask up to 2 brief clarifying questions if the user's question is ambiguous or missing important details. If the question is clear enough, proceed directly with your analysis and recommendation. {}",
            model.display_name, depth_instruction
        );
    }

    if matches!(style, DiscussionStyle::Independent) {
        return format!(
            "You are {}, a member of an AI council helping a user make an informed decision. You are responding independently — other council members are also analyzing this question separately. Provide your honest, unbiased analysis and recommendation. Do NOT ask any questions to the user. {}",
            model.display_name, depth_instruction
        );
    }

    format!(
        "You are {}, a member of an AI council helping a user make an informed decision. You will see the user's question and previous council members' responses. Provide your own unique perspective and analysis. Do NOT ask any questions to the user. {} If you agree with previous members, explain why. If you disagree, explain your reasoning.",
        model.display_name, depth_instruction
    )
}

fn looks_like_clarifying_question(response: &str) -> bool {
    let indicators = [
        "before I provide my recommendation",
        "could you clarify",
        "I have a few questions",
        "let me ask",
        "to help narrow down",
        "could you tell me",
        "what is your preference",
        "do you have a preference",
    ];
    let lower = response.to_lowercase();
    indicators.iter().any(|ind| lower.contains(ind)) && response.contains('?')
}

fn build_master_verdict_prompt(question: &str, discussion: &[DiscussionEntry]) -> String {
    let opinions: Vec<String> = discussion
        .iter()
        .filter_map(|e| {
            if let DiscussionEntry::Model {
                display_name,
                content,
                ..
            } = e
            {
                Some(format!("--- {} ---\n{}", display_name, content))
            } else {
                None
            }
        })
        .collect();

    format!(
        "The user asked: \"{}\"\n\nThe following AI council members have provided their analysis:\n\n{}\n\nAs the master judge, please synthesize all opinions and deliver your FINAL VERDICT. Consider:\n1. Points of agreement across models\n2. Points of disagreement and which position is stronger\n3. Any factual errors in the responses\n4. A clear, actionable recommendation\n\nProvide your final verdict with clear reasoning.",
        question,
        opinions.join("\n\n")
    )
}

fn build_upfront_prompt_request(
    question: &str,
    models: &[ModelConfig],
    settings: &AppSettings,
) -> Vec<ChatMessage> {
    let model_list = models
        .iter()
        .enumerate()
        .map(|(i, m)| format!("{}. {} ({})", i + 1, m.display_name, m.provider.display_name()))
        .collect::<Vec<_>>()
        .join("\n");

    let style_instruction = if matches!(settings.discussion_style, DiscussionStyle::Independent) {
        "\nIMPORTANT: Each model is responding INDEPENDENTLY and will NOT see any other model's response. Do NOT instruct them to reference, build on, or respond to other models. Each should provide their own standalone analysis as if they are the only one answering.\n"
    } else {
        "\nEach model should be encouraged to provide unique perspectives and not just repeat previous opinions.\n"
    };

    let depth_instruction = if matches!(settings.discussion_depth, DiscussionDepth::Concise) {
        "\nIMPORTANT: Instruct each model to keep responses brief and focused — 2-3 key points maximum. No lengthy explanations.\n"
    } else {
        ""
    };

    let json_keys: HashMap<String, String> = models
        .iter()
        .map(|m| {
            (
                format!("{}:{}", provider_to_string(&m.provider), m.model),
                "system prompt here".to_string(),
            )
        })
        .collect();

    let json_example = serde_json::to_string_pretty(&json_keys).unwrap_or_default();

    vec![ChatMessage {
        role: "user".to_string(),
        content: format!(
            "You are the orchestrator of a council of AI models helping a user make an informed decision. The user's question is:\n\n\"{}\"\n\nThe following AI models will {} this question{}:\n{}\n\nGenerate a specific, tailored system prompt for EACH council model that helps them provide their best analysis. The first model ({}) should be instructed that it MAY ask up to 2 clarifying questions if needed. All other models should be told they CANNOT ask questions.\n{}{}\nReturn your response in this exact JSON format:\n{}",
            question,
            if matches!(settings.discussion_style, DiscussionStyle::Independent) { "independently analyze" } else { "discuss" },
            if matches!(settings.discussion_style, DiscussionStyle::Sequential) { " in order" } else { "" },
            model_list,
            models.first().map(|m| m.display_name.as_str()).unwrap_or("First model"),
            style_instruction,
            depth_instruction,
            json_example,
        ),
    }]
}

fn extract_json(text: &str) -> Option<String> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end > start {
        Some(text[start..=end].to_string())
    } else {
        None
    }
}

fn combine_usage(
    a: Option<UsageData>,
    b: Option<council_core::models::config::UsageData>,
) -> Option<council_core::models::config::UsageData> {
    match (a, b) {
        (None, None) => None,
        (Some(a), None) => Some(council_core::models::config::UsageData {
            input_tokens: a.input_tokens,
            output_tokens: a.output_tokens,
        }),
        (None, Some(b)) => Some(b),
        (Some(a), Some(b)) => Some(council_core::models::config::UsageData {
            input_tokens: a.input_tokens + b.input_tokens,
            output_tokens: a.output_tokens + b.output_tokens,
        }),
    }
}
