use security_framework::passwords::{
    delete_generic_password, get_generic_password, set_generic_password,
};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{command, State};

/// Single keychain entry that stores all API keys as JSON
const KEYCHAIN_SERVICE: &str = "com.council-of-ai-agents.keys";
const KEYCHAIN_ACCOUNT: &str = "api-keys";

/// Legacy per-provider keychain account name
const LEGACY_ACCOUNT: &str = "api-key";

/// Legacy per-provider service names for migration
const LEGACY_SERVICES: &[(&str, &str)] = &[
    ("anthropic", "com.council-of-ai-agents.anthropic"),
    ("openai", "com.council-of-ai-agents.openai"),
    ("google", "com.council-of-ai-agents.google"),
    ("xai", "com.council-of-ai-agents.xai"),
];

/// In-memory cache for API keys. `None` means not loaded yet.
pub struct ApiKeyCache {
    keys: Mutex<Option<HashMap<String, String>>>,
}

impl Default for ApiKeyCache {
    fn default() -> Self {
        Self {
            keys: Mutex::new(None),
        }
    }
}

/// Extract the provider suffix from a service string.
/// e.g. "com.council-of-ai-agents.anthropic" → "anthropic"
fn extract_provider(service: &str) -> String {
    service
        .rsplit('.')
        .next()
        .unwrap_or(service)
        .to_string()
}

/// Read the single JSON blob from keychain and parse into a HashMap.
fn read_keychain_blob() -> HashMap<String, String> {
    match get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
        Ok(bytes) => {
            let json_str = String::from_utf8(bytes.to_vec()).unwrap_or_default();
            serde_json::from_str(&json_str).unwrap_or_default()
        }
        Err(_) => HashMap::new(),
    }
}

/// Write the full HashMap as a JSON blob to the single keychain entry.
fn write_keychain_blob(keys: &HashMap<String, String>) -> Result<(), String> {
    let json = serde_json::to_string(keys)
        .map_err(|e| format!("Failed to serialize API keys: {}", e))?;

    // Delete existing entry first to avoid duplicates
    let _ = delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);

    set_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, json.as_bytes())
        .map_err(|e| format!("Failed to save API keys to Keychain: {}", e))
}

/// Migrate old per-provider keychain entries into the new single entry.
/// Returns any keys found in the legacy entries.
fn migrate_legacy_keys() -> HashMap<String, String> {
    let mut migrated = HashMap::new();

    for (provider, service) in LEGACY_SERVICES {
        if let Ok(bytes) = get_generic_password(service, LEGACY_ACCOUNT) {
            if let Ok(key) = String::from_utf8(bytes.to_vec()) {
                if !key.is_empty() {
                    migrated.insert(provider.to_string(), key);
                }
            }
            // Clean up old entry
            let _ = delete_generic_password(service, LEGACY_ACCOUNT);
        }
    }

    migrated
}

/// Ensure cache is populated. Called once on first access.
fn ensure_loaded(cache: &ApiKeyCache) -> HashMap<String, String> {
    let mut guard = cache.keys.lock().unwrap();

    if let Some(ref keys) = *guard {
        return keys.clone();
    }

    // Try reading the new single entry
    let mut keys = read_keychain_blob();

    // If empty, try migrating legacy per-provider entries
    if keys.is_empty() {
        let legacy = migrate_legacy_keys();
        if !legacy.is_empty() {
            // Save migrated keys to the new single entry
            let _ = write_keychain_blob(&legacy);
            keys = legacy;
        }
    }

    *guard = Some(keys.clone());
    keys
}

#[command]
pub fn save_api_key(service: String, api_key: String, cache: State<ApiKeyCache>) -> Result<(), String> {
    let provider = extract_provider(&service);
    let mut keys = ensure_loaded(&cache);

    keys.insert(provider, api_key);
    write_keychain_blob(&keys)?;

    // Update cache
    let mut guard = cache.keys.lock().unwrap();
    *guard = Some(keys);

    Ok(())
}

#[command]
pub fn get_api_key(service: String, cache: State<ApiKeyCache>) -> Result<Option<String>, String> {
    let provider = extract_provider(&service);
    let keys = ensure_loaded(&cache);
    Ok(keys.get(&provider).cloned())
}

#[command]
pub fn delete_api_key(service: String, cache: State<ApiKeyCache>) -> Result<(), String> {
    let provider = extract_provider(&service);
    let mut keys = ensure_loaded(&cache);

    keys.remove(&provider);
    write_keychain_blob(&keys)?;

    // Update cache
    let mut guard = cache.keys.lock().unwrap();
    *guard = Some(keys);

    Ok(())
}

#[command]
pub fn has_api_key(service: String, cache: State<ApiKeyCache>) -> Result<bool, String> {
    let provider = extract_provider(&service);
    let keys = ensure_loaded(&cache);
    Ok(keys.contains_key(&provider))
}
