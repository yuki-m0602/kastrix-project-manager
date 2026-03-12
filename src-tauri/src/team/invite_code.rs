//! 招待コードの生成・パース
//!
//! 形式: KASTRIX-XXXX-XXXX（仕様 4-1）
//! コードと TopicID の対応は DB (invite_codes) で管理

use rand::RngCore;

const PREFIX: &str = "KASTRIX";
const CHARSET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい I,O,0,1 を除外

/// 32バイトの TopicID を生成（ランダム）
pub fn generate_topic_id() -> [u8; 32] {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes
}

/// ランダムな招待コードを生成
/// 形式: KASTRIX-XXXX-XXXX
pub fn generate_invite_code() -> (String, [u8; 32]) {
    let topic_id = generate_topic_id();
    let mut rng = rand::rng();
    let part1: String = (0..4)
        .map(|_| CHARSET[(rng.next_u32() as usize) % CHARSET.len()] as char)
        .collect();
    let part2: String = (0..4)
        .map(|_| CHARSET[(rng.next_u32() as usize) % CHARSET.len()] as char)
        .collect();
    let code = format!("{}-{}-{}", PREFIX, part1, part2);
    (code, topic_id)
}

/// 招待コードの形式を検証
pub fn validate_code_format(code: &str) -> Result<(), String> {
    let code = code.trim().to_uppercase();
    if !code.starts_with(PREFIX) {
        return Err("招待コードは KASTRIX- で始まる必要があります".to_string());
    }
    let parts: Vec<&str> = code.split('-').collect();
    if parts.len() != 3 {
        return Err("招待コードの形式が正しくありません（KASTRIX-XXXX-XXXX）".to_string());
    }
    if parts[1].len() != 4 || parts[2].len() != 4 {
        return Err("招待コードの各部分は4文字である必要があります".to_string());
    }
    Ok(())
}

/// 招待コードを正規化（大文字、トリム）
pub fn normalize_code(code: &str) -> String {
    code.trim().to_uppercase()
}
