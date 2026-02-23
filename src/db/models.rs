use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Task status in the kanban board
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    Backlog,
    Planning,
    Running,
    Review,
    Done,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Backlog => "backlog",
            TaskStatus::Planning => "planning",
            TaskStatus::Running => "running",
            TaskStatus::Review => "review",
            TaskStatus::Done => "done",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "backlog" => Some(TaskStatus::Backlog),
            "planning" => Some(TaskStatus::Planning),
            "running" => Some(TaskStatus::Running),
            "review" => Some(TaskStatus::Review),
            "done" => Some(TaskStatus::Done),
            _ => None,
        }
    }

    pub fn columns() -> &'static [TaskStatus] {
        &[
            TaskStatus::Backlog,
            TaskStatus::Planning,
            TaskStatus::Running,
            TaskStatus::Review,
            TaskStatus::Done,
        ]
    }
}

/// A task on the kanban board
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub agent: String,
    pub project_id: String,
    pub session_name: Option<String>,
    pub worktree_path: Option<String>,
    pub branch_name: Option<String>,
    pub pr_number: Option<i32>,
    pub pr_url: Option<String>,
    pub canvas_x: f64,
    pub canvas_y: f64,
    pub html_content: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Task {
    pub fn new(title: impl Into<String>, agent: impl Into<String>, project_id: impl Into<String>) -> Self {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();
        Self {
            id,
            title: title.into(),
            description: None,
            status: TaskStatus::Backlog,
            agent: agent.into(),
            project_id: project_id.into(),
            session_name: None,
            worktree_path: None,
            branch_name: None,
            pr_number: None,
            pr_url: None,
            canvas_x: 0.0,
            canvas_y: 0.0,
            html_content: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Generate tmux session name: task-{id}--{project}--{slug}
    pub fn generate_session_name(&self, project_name: &str) -> String {
        let slug = self
            .title
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>();
        let slug = slug.trim_matches('-');
        // Truncate slug to keep session name reasonable
        let slug: String = slug.chars().take(20).collect();
        format!("task-{}--{}--{}", &self.id[..8], project_name, slug)
    }
}

/// A project tracked by agtx
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub github_url: Option<String>,
    pub default_agent: Option<String>,
    pub last_opened: DateTime<Utc>,
}

impl Project {
    pub fn new(name: impl Into<String>, path: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: name.into(),
            path: path.into(),
            github_url: None,
            default_agent: None,
            last_opened: Utc::now(),
        }
    }
}

/// Represents a running agent session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningAgent {
    pub session_name: String,
    pub project_id: String,
    pub task_id: String,
    pub agent_name: String,
    pub started_at: DateTime<Utc>,
    pub status: AgentStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AgentStatus {
    Running,
    Waiting,
    Completed,
}

impl AgentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentStatus::Running => "running",
            AgentStatus::Waiting => "waiting",
            AgentStatus::Completed => "completed",
        }
    }
}

/// A connection/arrow between two tasks on the canvas
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskConnection {
    pub id: String,
    pub from_task_id: String,
    pub to_task_id: String,
    pub label: String,
}

impl TaskConnection {
    pub fn new(from_task_id: impl Into<String>, to_task_id: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            from_task_id: from_task_id.into(),
            to_task_id: to_task_id.into(),
            label: label.into(),
        }
    }
}
