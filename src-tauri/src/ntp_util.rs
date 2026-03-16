//! NTP タイムスタンプ取得（pool.ntp.org）
//! オフライン時はローカル時刻でフォールバック

use chrono::Utc;

/// NTP から時刻を取得。失敗時はローカル時刻を返す
/// 戻り値: (ISO8601 タイムスタンプ, "ntp" | "local")
pub async fn get_timestamp_with_source() -> (String, String) {
    let result = tokio::task::spawn_blocking(|| {
        let client = rsntp::SntpClient::new();
        client.synchronize("pool.ntp.org")
    })
    .await;

    match result {
        Ok(Ok(ntp_result)) => {
            let dt = ntp_result
                .datetime()
                .into_chrono_datetime()
                .unwrap_or_else(|_| Utc::now());
            let timestamp = dt.to_rfc3339();
            (timestamp, "ntp".to_string())
        }
        _ => {
            let now = Utc::now();
            (now.to_rfc3339(), "local".to_string())
        }
    }
}
