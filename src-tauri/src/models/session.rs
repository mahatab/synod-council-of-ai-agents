use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::config::{MasterModelConfig, ModelConfig, SystemPromptMode};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClarifyingExchange {
    pub question: String,
    pub answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all_fields = "camelCase")]
#[serde(tag = "role")]
pub enum DiscussionEntry {
    #[serde(rename = "user")]
    User { content: String },
    #[serde(rename = "model")]
    Model {
        provider: String,
        model: String,
        display_name: String,
        #[serde(default)]
        system_prompt: Option<String>,
        content: String,
        #[serde(default)]
        #[serde(skip_serializing_if = "Option::is_none")]
        clarifying_exchange: Option<Vec<ClarifyingExchange>>,
    },
    #[serde(rename = "master_verdict")]
    MasterVerdict {
        provider: String,
        model: String,
        content: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CouncilConfig {
    pub models: Vec<ModelConfig>,
    pub master_model: MasterModelConfig,
    pub system_prompt_mode: SystemPromptMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub user_question: String,
    pub council_config: CouncilConfig,
    pub discussion: Vec<DiscussionEntry>,
}

#[allow(dead_code)]
impl Session {
    pub fn new(
        user_question: String,
        council_config: CouncilConfig,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            title: truncate_title(&user_question),
            created_at: now,
            updated_at: now,
            user_question,
            council_config,
            discussion: vec![],
        }
    }
}

#[allow(dead_code)]
fn truncate_title(question: &str) -> String {
    let trimmed = question.trim();
    if trimmed.len() <= 60 {
        trimmed.to_string()
    } else {
        format!("{}...", &trimmed[..57])
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
