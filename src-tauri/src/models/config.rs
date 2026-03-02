use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Anthropic,
    OpenAI,
    Google,
    XAI,
    DeepSeek,
    Mistral,
    Together,
    Cohere,
}

#[allow(dead_code)]
impl Provider {
    pub fn display_name(&self) -> &str {
        match self {
            Provider::Anthropic => "Anthropic",
            Provider::OpenAI => "OpenAI",
            Provider::Google => "Google",
            Provider::XAI => "xAI",
            Provider::DeepSeek => "DeepSeek",
            Provider::Mistral => "Mistral",
            Provider::Together => "Together AI",
            Provider::Cohere => "Cohere",
        }
    }

    pub fn keychain_service(&self) -> &str {
        match self {
            Provider::Anthropic => "com.council-of-ai-agents.anthropic",
            Provider::OpenAI => "com.council-of-ai-agents.openai",
            Provider::Google => "com.council-of-ai-agents.google",
            Provider::XAI => "com.council-of-ai-agents.xai",
            Provider::DeepSeek => "com.council-of-ai-agents.deepseek",
            Provider::Mistral => "com.council-of-ai-agents.mistral",
            Provider::Together => "com.council-of-ai-agents.together",
            Provider::Cohere => "com.council-of-ai-agents.cohere",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelConfig {
    pub provider: Provider,
    pub model: String,
    pub display_name: String,
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasterModelConfig {
    pub provider: Provider,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SystemPromptMode {
    Upfront,
    Dynamic,
}

impl Default for SystemPromptMode {
    fn default() -> Self {
        SystemPromptMode::Upfront
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemeMode {
    Light,
    Dark,
    System,
}

impl Default for ThemeMode {
    fn default() -> Self {
        ThemeMode::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CursorStyle {
    Ripple,
    Breathing,
    Orbit,
    Multi,
}

impl Default for CursorStyle {
    fn default() -> Self {
        CursorStyle::Orbit
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DiscussionDepth {
    Thorough,
    Concise,
}

impl Default for DiscussionDepth {
    fn default() -> Self {
        DiscussionDepth::Thorough
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub council_models: Vec<ModelConfig>,
    pub master_model: MasterModelConfig,
    pub system_prompt_mode: SystemPromptMode,
    #[serde(default)]
    pub discussion_depth: DiscussionDepth,
    pub theme: ThemeMode,
    #[serde(default)]
    pub cursor_style: CursorStyle,
    pub session_save_path: Option<String>,
    pub setup_completed: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            council_models: vec![],
            master_model: MasterModelConfig {
                provider: Provider::Anthropic,
                model: "claude-opus-4-6".to_string(),
            },
            system_prompt_mode: SystemPromptMode::default(),
            discussion_depth: DiscussionDepth::default(),
            theme: ThemeMode::default(),
            cursor_style: CursorStyle::default(),
            session_save_path: None,
            setup_completed: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct StreamRequest {
    pub provider: Provider,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub system_prompt: Option<String>,
    pub stream_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageData {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamToken {
    pub stream_id: String,
    pub token: String,
    pub done: bool,
    pub error: Option<String>,
    pub usage: Option<UsageData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChatResult {
    pub content: String,
    pub usage: Option<UsageData>,
}
