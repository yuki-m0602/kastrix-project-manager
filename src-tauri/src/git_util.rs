use git2::Repository;
use std::path::Path;

pub struct GitInfo {
    pub last_commit_message: Option<String>,
    pub last_commit_date: Option<String>,
    pub branch: Option<String>,
}

pub fn get_git_info(project_path: &Path) -> Option<GitInfo> {
    let repo = Repository::open(project_path).ok()?;

    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()));

    let (last_commit_message, last_commit_date) = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok())
        .map(|commit| {
            let message = commit.summary().unwrap_or("").to_string();
            let time = commit.time();
            let secs = time.seconds();
            let dt = chrono::DateTime::from_timestamp(secs, 0)
                .unwrap_or_default()
                .naive_utc();
            let date_str = dt.format("%Y-%m-%dT%H:%M:%S").to_string();
            (Some(message), Some(date_str))
        })
        .unwrap_or((None, None));

    Some(GitInfo {
        last_commit_message,
        last_commit_date,
        branch,
    })
}
