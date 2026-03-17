use reqwest::Client;
use serde::{Deserialize, Serialize};

const SERVICE_NAME: &str = "kastrix";

// ── API Key Management (keyring) ─────────────────────────

pub fn save_api_key(provider: &str, key: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(SERVICE_NAME, provider).map_err(|e| format!("Keyring error: {e}"))?;
    entry
        .set_password(key)
        .map_err(|e| format!("Failed to save key: {e}"))
}

pub fn get_api_key(provider: &str) -> Result<Option<String>, String> {
    let entry =
        keyring::Entry::new(SERVICE_NAME, provider).map_err(|e| format!("Keyring error: {e}"))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read key: {e}")),
    }
}

pub fn delete_api_key(provider: &str) -> Result<(), String> {
    let entry =
        keyring::Entry::new(SERVICE_NAME, provider).map_err(|e| format!("Keyring error: {e}"))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete key: {e}")),
    }
}

// ── AI Chat (OpenAI / Anthropic) ─────────────────────────

#[derive(Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<ChatMessage>,
    max_tokens: u32,
}

#[derive(Serialize, Deserialize, Clone)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: ChatMessage,
}

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<ChatMessage>,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Deserialize)]
struct AnthropicContent {
    text: String,
}

pub async fn chat(
    provider: &str,
    api_key: &str,
    prompt: &str,
    context: &str,
) -> Result<String, String> {
    let client = Client::new();
    let system_msg = format!(
        "You are Kastrix Log Analyzer, an AI assistant for a project management app. \
         Analyze the following activity logs and answer the user's question.\n\n\
         Activity Logs:\n{context}"
    );

    match provider {
        "openai" => {
            let body = OpenAiRequest {
                model: "gpt-4o-mini".to_string(),
                messages: vec![
                    ChatMessage {
                        role: "system".into(),
                        content: system_msg,
                    },
                    ChatMessage {
                        role: "user".into(),
                        content: prompt.to_string(),
                    },
                ],
                max_tokens: 1024,
            };
            let resp = client
                .post("https://api.openai.com/v1/chat/completions")
                .bearer_auth(api_key)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Request failed: {e}"))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("OpenAI API error {status}: {text}"));
            }
            let data: OpenAiResponse =
                resp.json().await.map_err(|e| format!("Parse error: {e}"))?;
            data.choices
                .first()
                .map(|c| c.message.content.clone())
                .ok_or_else(|| "Empty response".to_string())
        }
        "anthropic" => {
            let body = AnthropicRequest {
                model: "claude-sonnet-4-20250514".to_string(),
                max_tokens: 1024,
                system: system_msg,
                messages: vec![ChatMessage {
                    role: "user".into(),
                    content: prompt.to_string(),
                }],
            };
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Request failed: {e}"))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("Anthropic API error {status}: {text}"));
            }
            let data: AnthropicResponse =
                resp.json().await.map_err(|e| format!("Parse error: {e}"))?;
            data.content
                .first()
                .map(|c| c.text.clone())
                .ok_or_else(|| "Empty response".to_string())
        }
        _ => Err(format!("Unsupported provider: {provider}")),
    }
}
