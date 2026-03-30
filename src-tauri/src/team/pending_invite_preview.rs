//! ゲストが招待リンクから得たホスト名・チーム名を settings に保持（commands 層との循環回避）

const KEY: &str = "pending_invite_preview";

pub fn set_pending_invite_preview(
    conn: &rusqlite::Connection,
    host_display_name: &str,
    team_name: &str,
) -> rusqlite::Result<()> {
    #[derive(serde::Serialize)]
    struct Preview {
        #[serde(rename = "hostDisplayName")]
        host_display_name: String,
        #[serde(rename = "teamName")]
        team_name: String,
    }
    let preview = Preview {
        host_display_name: host_display_name.to_string(),
        team_name: team_name.to_string(),
    };
    let json = serde_json::to_string(&preview).map_err(|_| {
        rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "preview json",
        )))
    })?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![KEY, json],
    )?;
    Ok(())
}

pub fn clear_pending_invite_preview(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM settings WHERE key = ?1", [KEY])?;
    Ok(())
}

pub fn get_pending_invite_preview_json(
    conn: &rusqlite::Connection,
) -> Result<Option<String>, rusqlite::Error> {
    match conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [KEY],
        |r| r.get::<_, String>(0),
    ) {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}
