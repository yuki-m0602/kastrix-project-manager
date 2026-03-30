//! 招待関連コマンド（作成・参加・一覧・無効化）

use crate::db::DbState;
use crate::team::{
    am_i_pending_guest, broadcast_join_request, broadcast_member_sync_need,
    generate_invite_code, get_my_endpoint_id, get_pending_invite_preview_json,
    normalize_code, normalize_endpoint_id, set_pending_invite_preview,
    spawn_topic_listener, topic_id_to_hex, IrohState, JoinRequestPayload,
    MemberSyncNeedPayload,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use super::PendingJoinsState;

fn is_expired(expires_at: &str) -> bool {
    chrono::NaiveDateTime::parse_from_str(expires_at, "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|exp_naive| exp_naive < chrono::Local::now().naive_local())
        .unwrap_or(true)
}

/// `expires_at` が過去の行を DB から削除（無効コードを残さない）
pub fn purge_expired_invite_codes(conn: &rusqlite::Connection) -> rusqlite::Result<usize> {
    conn.execute(
        "DELETE FROM invite_codes WHERE expires_at IS NOT NULL AND expires_at <= datetime('now', 'localtime')",
        [],
    )
}

#[derive(Serialize, Deserialize)]
struct InviteMetaWire {
    hn: String,
    tn: String,
}

/// ホスト側 DB から、招待リンクに埋め込む表示名・チーム名を取得
fn host_and_team_labels(conn: &rusqlite::Connection) -> (String, String) {
    let host: String = conn
        .query_row(
            "SELECT COALESCE(NULLIF(TRIM(display_name), ''), '') FROM members WHERE role = 'host' AND status = 'active' ORDER BY joined_at ASC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or_default();
    let team: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'team_name'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "My Team".to_string());
    (host, team)
}

fn encode_invite_meta_segment(hn: &str, tn: &str) -> String {
    let wire = InviteMetaWire {
        hn: hn.to_string(),
        tn: tn.to_string(),
    };
    let json = serde_json::to_string(&wire).unwrap_or_else(|_| "{\"hn\":\"\",\"tn\":\"\"}".to_string());
    URL_SAFE_NO_PAD.encode(json.as_bytes())
}

fn decode_invite_meta_segment(b64: &str) -> Option<(String, String)> {
    let bytes = URL_SAFE_NO_PAD.decode(b64.trim()).ok()?;
    let s = String::from_utf8(bytes).ok()?;
    let wire: InviteMetaWire = serde_json::from_str(&s).ok()?;
    Some((wire.hn, wire.tn))
}

/// `topic::ticket::expires` または末尾に `::` + base64(JSON) メタ
fn build_invite_payload(topic: &str, ticket: &str, expires: &str, hn: &str, tn: &str) -> String {
    let meta = encode_invite_meta_segment(hn, tn);
    format!("{topic}::{ticket}::{expires}::{meta}")
}

fn parse_kastrix_inner(s: &str) -> Result<(String, String, String, Option<(String, String)>), String> {
    let parts: Vec<&str> = s.split("::").collect();
    if parts.len() < 3 {
        return Err("招待データの形式が不正です".to_string());
    }
    let topic_id = parts[0].to_string();
    let host_ticket = parts[1].to_string();
    let expires_at = parts[2].to_string();
    let meta = parts
        .get(3)
        .and_then(|seg| decode_invite_meta_segment(seg));
    Ok((topic_id, host_ticket, expires_at, meta))
}

fn try_db_lookup(
    state: &State<'_, DbState>,
    code: &str,
) -> Result<(String, Option<String>, Option<(String, String)>), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let (topic_id, host_ticket) = db
        .query_row(
            "SELECT topic_id, host_ticket FROM invite_codes WHERE code = ?1 AND (expires_at IS NULL OR expires_at > datetime('now', 'localtime'))",
            [code],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
        )
        .map_err(|_| "招待コードが無効または期限切れです".to_string())?;
    let (hn, tn) = host_and_team_labels(&db);
    Ok((topic_id, host_ticket, Some((hn, tn))))
}

fn hex_to_topic_id(hex: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(hex).map_err(|e| format!("TopicID の解析に失敗: {}", e))?;
    if bytes.len() != 32 {
        return Err("TopicID は32バイトである必要があります".to_string());
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

/// チームを作成し、招待コードを発行
#[tauri::command]
pub async fn team_create(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    expires_minutes: Option<u32>,
) -> Result<super::TeamCreateResult, String> {
    let (code, topic_id) = generate_invite_code();
    let topic_id_hex = topic_id_to_hex(&topic_id);
    let id = Uuid::new_v4().to_string();

    let host_ticket = {
        let guard = iroh.read().await;
        let node = guard.as_ref().ok_or_else(|| {
            "iroh が初期化されていません。チーム機能を利用できません。".to_string()
        })?;
        let topic_id_iroh = iroh_gossip::proto::TopicId::from_bytes(topic_id);
        let receiver = node
            .subscribe(topic_id_iroh, &topic_id_hex, vec![])
            .await
            .map_err(|e| format!("トピック参加に失敗: {}", e))?;
        let ticket = node.node_ticket().await.map_err(|e| e.to_string())?;

        let pending_joins = pending_joins.inner().clone();
        let topic_id_for_listener = topic_id_hex.clone();
        tauri::async_runtime::spawn(async move {
            spawn_topic_listener(receiver, pending_joins, app, topic_id_for_listener, true).await;
        });

        ticket.to_string()
    };

    let mins = expires_minutes.unwrap_or(60);
    let host_endpoint_id = get_my_endpoint_id(&iroh).await;

    let db = state.0.lock().map_err(|e| e.to_string())?;
    if mins == 0 {
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, host_ticket, expires_at) VALUES (?1, ?2, ?3, ?4, NULL)",
            rusqlite::params![id, code, topic_id_hex, host_ticket],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let modifier = format!("+{} minutes", mins);
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, host_ticket, expires_at) VALUES (?1, ?2, ?3, ?4, datetime('now', 'localtime', ?5))",
            rusqlite::params![id, code, topic_id_hex, host_ticket, modifier],
        )
        .map_err(|e| e.to_string())?;
    }
    db.execute(
        "INSERT OR REPLACE INTO team_subscriptions (topic_id, host_ticket, is_host) VALUES (?1, NULL, 1)",
        rusqlite::params![topic_id_hex],
    )
    .map_err(|e| e.to_string())?;

    if !host_endpoint_id.is_empty() {
        let _ = db.execute(
            "INSERT OR REPLACE INTO members (id, endpoint_id, role, status) VALUES (?1, ?2, 'host', 'active')",
            rusqlite::params![Uuid::new_v4().to_string(), host_endpoint_id],
        );
    }

    let expires_at_str = if mins == 0 {
        "9999-12-31 23:59:59".to_string()
    } else {
        let expires_at = chrono::Local::now() + chrono::Duration::minutes(mins as i64);
        expires_at.format("%Y-%m-%d %H:%M:%S").to_string()
    };
    let (hn, tn) = host_and_team_labels(&db);
    let invite_payload = build_invite_payload(&topic_id_hex, &host_ticket, &expires_at_str, &hn, &tn);
    let invite_string = format!(
        "KASTRIX-{}",
        URL_SAFE_NO_PAD.encode(invite_payload.as_bytes())
    );

    Ok(super::TeamCreateResult {
        code: code.clone(),
        topic_id: topic_id_hex,
        expires_in_minutes: mins,
        invite_string: invite_string.clone(),
    })
}

/// 招待コードを発行（既存チームに追加。チームがなければ新規作成）
#[tauri::command]
pub async fn team_issue_invite(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    expires_minutes: Option<u32>,
) -> Result<super::TeamInviteResult, String> {
    let mins = expires_minutes.unwrap_or(60);

    let topic_id_hex: Option<String> = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT topic_id FROM team_subscriptions WHERE is_host = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok()
    };

    if topic_id_hex.is_none() {
        let create_result = team_create(app, state, iroh, pending_joins, Some(mins)).await?;
        return Ok(super::TeamInviteResult {
            code: create_result.code,
            expires_in_minutes: create_result.expires_in_minutes,
            invite_string: Some(create_result.invite_string),
        });
    }

    let topic_id_hex = topic_id_hex.unwrap();
    let (code, _) = generate_invite_code();
    let id = Uuid::new_v4().to_string();

    let host_ticket_str = {
        let guard = iroh.read().await;
        let node = guard
            .as_ref()
            .ok_or_else(|| "iroh が初期化されていません。少々お待ちください。".to_string())?;
        node.node_ticket()
            .await
            .map_err(|e| e.to_string())?
            .to_string()
    };

    let db = state.0.lock().map_err(|e| e.to_string())?;
    if mins == 0 {
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, host_ticket, expires_at) VALUES (?1, ?2, ?3, ?4, NULL)",
            rusqlite::params![id, code, topic_id_hex, host_ticket_str],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let expires_modifier = format!("+{} minutes", mins);
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, host_ticket, expires_at) VALUES (?1, ?2, ?3, ?4, datetime('now', 'localtime', ?5))",
            rusqlite::params![id, code, topic_id_hex, host_ticket_str, expires_modifier],
        )
        .map_err(|e| e.to_string())?;
    }

    let expires_at_str = if mins == 0 {
        "9999-12-31 23:59:59".to_string()
    } else {
        let expires_at = chrono::Local::now() + chrono::Duration::minutes(mins as i64);
        expires_at.format("%Y-%m-%d %H:%M:%S").to_string()
    };
    let (hn, tn) = host_and_team_labels(&db);
    let invite_payload =
        build_invite_payload(&topic_id_hex, &host_ticket_str, &expires_at_str, &hn, &tn);
    let invite_string = format!(
        "KASTRIX-{}",
        URL_SAFE_NO_PAD.encode(invite_payload.as_bytes())
    );

    Ok(super::TeamInviteResult {
        code: code.clone(),
        expires_in_minutes: mins,
        invite_string: Some(invite_string),
    })
}

/// 招待コードでチームに参加申請
#[tauri::command]
pub async fn team_join(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    code: String,
) -> Result<super::TeamJoinResult, String> {
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let _ = purge_expired_invite_codes(&conn);
    }
    let code = code.trim();
    if !code.to_uppercase().starts_with("KASTRIX-") {
        return Err("招待コードは KASTRIX- で始まる必要があります".to_string());
    }

    let (topic_id, host_ticket_str, invite_meta) = if let Some(payload) = code
        .strip_prefix("KASTRIX-")
        .or_else(|| code.strip_prefix("kastrix-"))
    {
        let payload = payload.trim();
        if payload.len() > 80 {
            match URL_SAFE_NO_PAD.decode(payload) {
                Ok(decoded) => {
                    let s = String::from_utf8(decoded)
                        .map_err(|_| "招待データの形式が不正です".to_string())?;
                    let (tid, ht, exp, meta) = parse_kastrix_inner(&s)?;
                    if !is_expired(&exp) {
                        (tid, Some(ht), meta)
                    } else {
                        return Err("招待コードの有効期限が切れています".to_string());
                    }
                }
                Err(_) => {
                    let (tid, ht, meta) = try_db_lookup(&state, &normalize_code(code))?;
                    (tid, ht, meta)
                }
            }
        } else {
            let (tid, ht, meta) = try_db_lookup(&state, &normalize_code(code))?;
            (tid, ht, meta)
        }
    } else {
        return Err("招待コードは KASTRIX- で始まる必要があります".to_string());
    };

    let host_ticket_str = host_ticket_str.ok_or_else(|| {
        "この招待コードでは参加できません。ホストから共有された招待リンクを貼り付けてください。"
            .to_string()
    })?;

    let topic_id = topic_id.to_ascii_lowercase();

    let receiver = {
        let guard = iroh.read().await;
        let node = guard
            .as_ref()
            .ok_or_else(|| "iroh が初期化されていません".to_string())?;
        let ticket: iroh_base::ticket::NodeTicket = host_ticket_str
            .parse()
            .map_err(|e| format!("ホスト情報の解析に失敗: {}", e))?;
        node.add_node_addr(&ticket)
            .map_err(|e| format!("ホストへの接続設定に失敗: {}", e))?;
        let topic_id_bytes = hex_to_topic_id(&topic_id)?;
        let topic_id_iroh = iroh_gossip::proto::TopicId::from_bytes(topic_id_bytes);
        let host_node_id = ticket.node_addr().node_id;
        node.subscribe(topic_id_iroh, &topic_id, vec![host_node_id])
            .await
            .map_err(|e| format!("トピック参加に失敗: {}", e))?
    };

    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR REPLACE INTO team_subscriptions (topic_id, host_ticket, is_host) VALUES (?1, ?2, 0)",
            rusqlite::params![topic_id, host_ticket_str],
        )
        .map_err(|e| e.to_string())?;
        if let Some((ref h, ref t)) = invite_meta {
            let _ = set_pending_invite_preview(&db, h, t);
        }
    }

    // 先に Received を受け取るループを起動してから join_request / member_join を流す（取りこぼし防止）
    let pending_joins = pending_joins.inner().clone();
    let topic_id_for_listener = topic_id.clone();
    let app_listener = app.clone();
    tauri::async_runtime::spawn(async move {
        spawn_topic_listener(
            receiver,
            pending_joins,
            app_listener,
            topic_id_for_listener,
            false,
        )
        .await;
    });
    tokio::time::sleep(std::time::Duration::from_millis(400)).await;

    // NeighborUp がホストに届かない場合でも、gossip の join_request で承認キューに載せる
    let my_ep = get_my_endpoint_id(&iroh).await;
    if my_ep.is_empty() {
        return Err(
            "エンドポイントIDを取得できませんでした。しばらく待ってから再度「参加」をお試しください。"
                .to_string(),
        );
    }
    let requested_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let payload = JoinRequestPayload {
        r#type: "join_request".to_string(),
        endpoint_id: my_ep,
        topic_id: topic_id.clone(),
        requested_at,
    };
    let message = match broadcast_join_request(&iroh, &topic_id, &payload).await {
        Ok(()) => "参加申請を送信しました。ホストの承認をお待ちください。".to_string(),
        Err(e) => {
            eprintln!("broadcast_join_request failed: {}", e);
            format!(
                "参加情報は保存しましたが、ホストへの参加申請の送信に失敗しました: {}。ネットワークを確認し、再度「参加」をお試しください。",
                e
            )
        }
    };

    let (host_display_name, team_name) = match &invite_meta {
        Some((h, t)) => (
            (!h.is_empty()).then(|| h.clone()),
            (!t.is_empty()).then(|| t.clone()),
        ),
        None => (None, None),
    };

    Ok(super::TeamJoinResult {
        topic_id: topic_id.clone(),
        status: "pending".to_string(),
        message,
        host_display_name,
        team_name,
    })
}

/// 起動時に DB から参加情報を復元し、subscribe を再開
pub async fn restore_team_subscriptions(app: &tauri::AppHandle) -> Result<(), String> {
    let db_state = app
        .try_state::<DbState>()
        .ok_or_else(|| "DbState not found".to_string())?;
    let iroh = app
        .try_state::<IrohState>()
        .ok_or_else(|| "IrohState not found".to_string())?;
    let pending_joins = app
        .try_state::<PendingJoinsState>()
        .ok_or_else(|| "PendingJoinsState not found".to_string())?;

    let subs: Vec<(String, Option<String>, i32)> = {
        let db = db_state.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT topic_id, host_ticket, is_host FROM team_subscriptions")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i32>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    if subs.is_empty() {
        return Ok(());
    }

    let mut guest_topics_to_resend_join: Vec<String> = Vec::new();

    {
        let guard = iroh.read().await;
        let node = guard
            .as_ref()
            .ok_or_else(|| "iroh が初期化されていません".to_string())?;

        for (topic_id_row, host_ticket, is_host) in subs {
            let topic_id = topic_id_row.to_ascii_lowercase();
            let topic_id_bytes = hex_to_topic_id(&topic_id)?;
            let topic_id_iroh = iroh_gossip::proto::TopicId::from_bytes(topic_id_bytes);
            let bootstrap: Vec<iroh::NodeId> = if is_host != 0 {
                vec![]
            } else {
                let ht = host_ticket.as_ref().ok_or_else(|| {
                    format!(
                        "メンバーとして topic {} の host_ticket がありません",
                        topic_id
                    )
                })?;
                let ticket: iroh_base::ticket::NodeTicket = ht
                    .parse()
                    .map_err(|e| format!("host_ticket 解析失敗: {}", e))?;
                node.add_node_addr(&ticket)
                    .map_err(|e| format!("ホスト接続設定失敗: {}", e))?;
                vec![ticket.node_addr().node_id]
            };

            let receiver = node
                .subscribe(topic_id_iroh, &topic_id, bootstrap)
                .await
                .map_err(|e| format!("topic {} の subscribe 復元失敗: {}", topic_id, e))?;

            let pending_joins = pending_joins.inner().clone();
            let app = app.clone();
            let topic_id_for_listener = topic_id.clone();
            let is_host_bool = is_host != 0;
            tauri::async_runtime::spawn(async move {
                spawn_topic_listener(
                    receiver,
                    pending_joins,
                    app,
                    topic_id_for_listener,
                    is_host_bool,
                )
                .await;
            });
            // ゲストは member_join 受信ループを先に回してから他処理が走るように少し間を空ける
            if is_host == 0 {
                guest_topics_to_resend_join.push(topic_id.clone());
                tokio::time::sleep(std::time::Duration::from_millis(350)).await;
            }
        }
    }

    // ロック解除後に join_request を再送（再起動直後は NeighborUp だけではホストに届かない場合がある）
    for tid in guest_topics_to_resend_join {
        let my_ep = get_my_endpoint_id(&iroh).await;
        if my_ep.is_empty() {
            continue;
        }
        let still_pending = {
            let db = db_state.0.lock().map_err(|e| e.to_string())?;
            am_i_pending_guest(&db, &my_ep)
        };
        if !still_pending {
            continue;
        }
        let requested_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let payload = JoinRequestPayload {
            r#type: "join_request".to_string(),
            endpoint_id: my_ep.clone(),
            topic_id: tid.clone(),
            requested_at,
        };
        if let Err(e) = broadcast_join_request(&iroh, &tid, &payload).await {
            eprintln!(
                "restore_team_subscriptions: broadcast_join_request failed: {}",
                e
            );
        }
        // ホストが既に承認済みだが gossip が届かなかったケースの救済: member_sync_need も自動送信
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        let sync_payload = MemberSyncNeedPayload {
            r#type: "member_sync_need".to_string(),
            endpoint_id: normalize_endpoint_id(&my_ep),
            topic_id: tid.clone(),
        };
        if let Err(e) = broadcast_member_sync_need(&iroh, &tid, &sync_payload).await {
            eprintln!(
                "restore_team_subscriptions: broadcast_member_sync_need failed: {}",
                e
            );
        }
    }

    let _ = app.emit("team-subscriptions-restored", ());
    Ok(())
}

/// 発行済み招待コード一覧を取得
#[tauri::command]
pub async fn team_list_invite_codes(
    state: State<'_, DbState>,
) -> Result<Vec<super::InviteCodeInfo>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    purge_expired_invite_codes(&db).map_err(|e| e.to_string())?;
    let (hn, tn) = host_and_team_labels(&db);
    let mut stmt = db
        .prepare(
            "SELECT id, code, topic_id, host_ticket, expires_at, created_at FROM invite_codes ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let code: String = row.get(1)?;
            let topic_id: String = row.get(2)?;
            let host_ticket: Option<String> = row.get(3)?;
            let expires_at: Option<String> = row.get(4)?;
            let created_at: Option<String> = row.get(5)?;
            let invite_string = host_ticket.as_ref().and_then(|ht| {
                let exp = expires_at.as_deref().unwrap_or("");
                let payload = build_invite_payload(&topic_id, ht, exp, &hn, &tn);
                Some(format!(
                    "KASTRIX-{}",
                    URL_SAFE_NO_PAD.encode(payload.as_bytes())
                ))
            });
            Ok(super::InviteCodeInfo {
                id,
                code,
                topic_id,
                expires_at,
                created_at,
                invite_string,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// 招待コードを無効化
#[tauri::command]
pub async fn team_revoke_invite_code(
    state: State<'_, DbState>,
    code: String,
) -> Result<(), String> {
    let code = normalize_code(&code);

    let db = state.0.lock().map_err(|e| e.to_string())?;
    let n = db
        .execute("DELETE FROM invite_codes WHERE code = ?1", [&code])
        .map_err(|e| e.to_string())?;

    if n == 0 {
        return Err("招待コードが見つかりません".to_string());
    }
    Ok(())
}

/// ゲスト: 参加申請中に表示する、招待リンクから取得したホスト名・チーム名
#[tauri::command]
pub fn team_get_pending_invite_preview(
    state: State<'_, DbState>,
) -> Result<Option<super::PendingInvitePreview>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let json = match get_pending_invite_preview_json(&db).map_err(|e| e.to_string())? {
        Some(j) => j,
        None => return Ok(None),
    };
    serde_json::from_str(&json).map(Some).map_err(|e| e.to_string())
}
