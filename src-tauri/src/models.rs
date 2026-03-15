use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub language: Option<String>,
    pub local_modified: Option<String>,
    pub git_modified: Option<String>,
    pub last_commit: Option<String>,
    pub has_readme: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: Option<String>,
    pub title: String,
    pub status: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub assignee: Option<String>,
    pub description: Option<String>,
    #[serde(default = "default_true")]
    pub is_public: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityLog {
    pub id: String,
    pub task_id: Option<String>,
    pub project_id: Option<String>,
    pub action: String,
    pub task_title: Option<String>,
    pub project_name: Option<String>,
    pub modified_by: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub project_id: Option<String>,
    pub title: String,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub assignee: Option<String>,
    pub description: Option<String>,
    #[serde(default = "default_true")]
    pub is_public: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskInput {
    pub title: Option<String>,
    pub project_id: Option<String>,
    pub priority: Option<String>,
    pub due_date: Option<String>,
    pub assignee: Option<String>,
    pub description: Option<String>,
    pub is_public: Option<bool>,
}
