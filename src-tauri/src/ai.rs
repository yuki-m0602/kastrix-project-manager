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

/// プロバイダから利用可能なモデル一覧を取得
pub async fn list_models(provider: &str, api_key: &str) -> Result<Vec<String>, String> {
    let client = Client::new();
    match provider {
        "openai" => {
            #[derive(Deserialize)]
            struct OpenAiModelsResponse {
                data: Vec<OpenAiModel>,
            }
            #[derive(Deserialize)]
            struct OpenAiModel {
                id: String,
            }
            let resp = client
                .get("https://api.openai.com/v1/models")
                .bearer_auth(api_key)
                .send()
                .await
                .map_err(|e| format!("Request failed: {e}"))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("OpenAI API error {status}: {text}"));
            }
            let data: OpenAiModelsResponse =
                resp.json().await.map_err(|e| format!("Parse error: {e}"))?;
            let mut ids: Vec<String> = data.data.into_iter().map(|m| m.id).collect();
            ids.sort();
            Ok(ids)
        }
        "openrouter" => {
            #[derive(Deserialize)]
            struct OpenRouterModelsResponse {
                data: Vec<OpenRouterModel>,
            }
            #[derive(Deserialize)]
            struct OpenRouterModel {
                id: String,
            }
            let resp = client
                .get("https://openrouter.ai/api/v1/models")
                .bearer_auth(api_key)
                .send()
                .await
                .map_err(|e| format!("Request failed: {e}"))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("OpenRouter API error {status}: {text}"));
            }
            let data: OpenRouterModelsResponse =
                resp.json().await.map_err(|e| format!("Parse error: {e}"))?;
            let mut ids: Vec<String> = data.data.into_iter().map(|m| m.id).collect();
            ids.sort();
            Ok(ids)
        }
        "anthropic" => {
            Ok(vec![
                "claude-sonnet-4-20250514".to_string(),
                "claude-3-5-sonnet-20241022".to_string(),
                "claude-3-opus-20240229".to_string(),
                "claude-3-haiku-20240307".to_string(),
            ])
        }
        _ => Err(format!("Unsupported provider: {provider}")),
    }
}

/// モデル一覧を取得（OpenRouter の場合は is_free を含む）
#[derive(Serialize, Deserialize)]
pub struct AiModelInfo {
    pub id: String,
    pub is_free: bool,
}

pub async fn list_models_extended(provider: &str, api_key: &str) -> Result<Vec<AiModelInfo>, String> {
    match provider {
        "openrouter" => {
            #[derive(Deserialize)]
            struct OpenRouterModelsResponse {
                data: Vec<OpenRouterModelWithPricing>,
            }
            #[derive(Deserialize)]
            struct OpenRouterModelWithPricing {
                id: String,
                #[serde(default)]
                pricing: Option<serde_json::Value>,
            }
            let client = Client::new();
            let resp = client
                .get("https://openrouter.ai/api/v1/models")
                .bearer_auth(api_key)
                .send()
                .await
                .map_err(|e| format!("Request failed: {e}"))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("OpenRouter API error {status}: {text}"));
            }
            let data: OpenRouterModelsResponse =
                resp.json().await.map_err(|e| format!("Parse error: {e}"))?;
            let mut infos: Vec<AiModelInfo> = data
                .data
                .into_iter()
                .map(|m| {
                    let is_free = is_openrouter_model_free(&m.pricing);
                    AiModelInfo { id: m.id, is_free }
                })
                .collect();
            infos.sort_by(|a, b| a.id.cmp(&b.id));
            Ok(infos)
        }
        _ => {
            let ids = list_models(provider, api_key).await?;
            Ok(ids
                .into_iter()
                .map(|id| AiModelInfo { id, is_free: false })
                .collect())
        }
    }
}

fn is_openrouter_model_free(pricing: &Option<serde_json::Value>) -> bool {
    let Some(p) = pricing else { return false };
    // pricing は object { prompt, completion } または array of objects
    // prompt/completion は文字列 (例: "0", "0.000008") または数値
    let get_price = |obj: &serde_json::Map<String, serde_json::Value>, key: &str| -> f64 {
        obj.get(key)
            .and_then(|v| {
                v.as_str()
                    .and_then(|s| s.parse::<f64>().ok())
                    .or_else(|| v.as_f64())
            })
            .unwrap_or(1.0)
    };
    let (prompt_price, completion_price) = if let Some(arr) = p.as_array() {
        let first = arr.first().and_then(|v| v.as_object());
        match first {
            Some(obj) => (get_price(obj, "prompt"), get_price(obj, "completion")),
            None => (1.0, 1.0),
        }
    } else if let Some(obj) = p.as_object() {
        (get_price(obj, "prompt"), get_price(obj, "completion"))
    } else {
        return false;
    };
    const EPS: f64 = 1e-9;
    prompt_price < EPS && completion_price < EPS
}

fn default_model(provider: &str) -> &'static str {
    match provider {
        "openai" => "gpt-4o-mini",
        "anthropic" => "claude-sonnet-4-20250514",
        "openrouter" => "openai/gpt-4o-mini",
        _ => "gpt-4o-mini",
    }
}

pub async fn chat(
    provider: &str,
    api_key: &str,
    model: Option<&str>,
    prompt: &str,
    context: &str,
) -> Result<String, String> {
    let client = Client::new();
    let system_msg = format!(
        "You are Kastrix Log Analyzer, an AI assistant for a project management app. \
         Analyze the following activity logs and answer the user's question.\n\n\
         Activity Logs:\n{context}"
    );

    let model = model.unwrap_or_else(|| default_model(provider));

    match provider {
        "openai" => {
            let body = OpenAiRequest {
                model: model.to_string(),
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
                model: model.to_string(),
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
        "openrouter" => {
            let body = OpenAiRequest {
                model: model.to_string(),
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
                .post("https://openrouter.ai/api/v1/chat/completions")
                .bearer_auth(api_key)
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Request failed: {e}"))?;
            if !resp.status().is_success() {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                return Err(format!("OpenRouter API error {status}: {text}"));
            }
            let data: OpenAiResponse =
                resp.json().await.map_err(|e| format!("Parse error: {e}"))?;
            data.choices
                .first()
                .map(|c| c.message.content.clone())
                .ok_or_else(|| "Empty response".to_string())
        }
        _ => Err(format!("Unsupported provider: {provider}")),
    }
}
