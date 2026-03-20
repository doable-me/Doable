use chrono::{DateTime, Utc};
use tokio_postgres::{Client, NoTls};

// ─── Data Models ──────────────────────────────────────────

pub struct UserData {
    pub id: String,
    pub email: String,
    pub display_name: String,
    pub is_admin: bool,
    pub created_at: String,
}

pub struct FlagData {
    pub key: String,
    pub label: String,
    pub enabled: bool,
    pub min_plan: Option<String>,
    pub min_role: Option<String>,
}

pub struct MemberData {
    pub user_id: String,
    pub email: String,
    pub role: String,
    pub workspace_id: String,
    pub workspace: String,
    pub joined: String,
}

pub struct WorkspaceData {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub plan: String,
    pub members: i64,
}

pub struct AiData {
    pub enforce_ai: bool,
    pub enforced_model: Option<String>,
    pub show_model_selector: bool,
    pub default_model: Option<String>,
}

// ─── Connection ───────────────────────────────────────────

pub async fn connect(db_url: &str) -> Result<Client, Box<dyn std::error::Error>> {
    let (client, connection) = tokio_postgres::connect(db_url, NoTls).await?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("DB connection error: {e}");
        }
    });
    ensure_schema(&client).await?;
    Ok(client)
}

/// Ensure the columns/tables the admin CLI depends on exist.
/// Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it's safe to re-run.
async fn ensure_schema(client: &Client) -> Result<(), Box<dyn std::error::Error>> {
    client
        .batch_execute(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

             CREATE TABLE IF NOT EXISTS feature_flags (
                 feature_key   text        PRIMARY KEY,
                 label         text        NOT NULL,
                 description   text,
                 enabled       boolean     NOT NULL DEFAULT true,
                 min_plan      text,
                 min_role      text,
                 created_at    timestamptz NOT NULL DEFAULT now(),
                 updated_at    timestamptz NOT NULL DEFAULT now()
             );

             CREATE TABLE IF NOT EXISTS user_feature_overrides (
                 user_id       uuid    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                 feature_key   text    NOT NULL REFERENCES feature_flags(feature_key) ON DELETE CASCADE,
                 enabled       boolean NOT NULL,
                 PRIMARY KEY (user_id, feature_key)
             );

             INSERT INTO feature_flags (feature_key, label, description, enabled, min_plan, min_role) VALUES
               ('ai_chat',           'AI Chat',              'AI chat and code generation',                        true,  null,   null),
               ('ai_settings',       'AI Settings',          'Configure AI models, providers, and enforcement',    true,  null,   'admin'),
               ('visual_editor',     'Visual Editor',        'Click-to-edit visual editing in preview',            true,  null,   null),
               ('code_editor',       'Code Editor',          'Monaco code editor (Dev Mode)',                      true,  'pro',  null),
               ('github_sync',       'GitHub Sync',          'Connect and sync projects with GitHub',              true,  null,   null),
               ('publish',           'Publish / Deploy',     'Publish projects to doable.app or custom domains',   true,  null,   null),
               ('custom_domains',    'Custom Domains',       'Use your own domain for published apps',             true,  'pro',  null),
               ('templates',         'Templates',            'Create projects from templates',                     true,  null,   null),
               ('analytics',         'Analytics',            'Built-in analytics for published apps',              true,  null,   null),
               ('billing',           'Billing & Credits',    'Manage subscriptions and credits',                   true,  null,   'owner'),
               ('version_history',   'Version History',      'View and restore previous versions',                 true,  null,   null),
               ('workspaces',        'Workspaces',           'Create and manage workspaces',                       true,  null,   null),
               ('workspace_members', 'Workspace Members',    'Invite and manage workspace members',                true,  null,   'admin'),
               ('connectors',        'Connectors',           'Configure integrations and MCP servers',             true,  'pro',  null),
               ('security_center',   'Security Center',      'Security scanning and vulnerability management',     true,  'business', 'admin')
             ON CONFLICT (feature_key) DO NOTHING;",
        )
        .await?;
    Ok(())
}

// ─── Queries ──────────────────────────────────────────────

pub async fn fetch_users(client: &Client) -> Result<Vec<UserData>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT id::text, email, display_name, is_platform_admin, created_at
             FROM users ORDER BY is_platform_admin DESC, email",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| {
            let created: DateTime<Utc> = r.get("created_at");
            UserData {
                id: r.get("id"),
                email: r.get("email"),
                display_name: r.get::<_, Option<String>>("display_name")
                    .unwrap_or_default(),
                is_admin: r.get("is_platform_admin"),
                created_at: created.format("%Y-%m-%d").to_string(),
            }
        })
        .collect())
}

pub async fn toggle_admin(
    client: &Client,
    user_id: &str,
    val: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE users SET is_platform_admin = $1 WHERE id::text = $2",
            &[&val, &user_id],
        )
        .await?;
    Ok(())
}

pub async fn fetch_flags(client: &Client) -> Result<Vec<FlagData>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT feature_key, label, enabled, min_plan, min_role
             FROM feature_flags ORDER BY label",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| FlagData {
            key: r.get("feature_key"),
            label: r.get("label"),
            enabled: r.get("enabled"),
            min_plan: r.get("min_plan"),
            min_role: r.get("min_role"),
        })
        .collect())
}

pub async fn toggle_flag(
    client: &Client,
    key: &str,
    val: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE feature_flags SET enabled = $1, updated_at = now()
             WHERE feature_key = $2",
            &[&val, &key],
        )
        .await?;
    Ok(())
}

pub async fn fetch_members(
    client: &Client,
) -> Result<Vec<MemberData>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT u.id::text as user_id, u.email, wm.role,
                    w.id::text as workspace_id, w.name as workspace, wm.joined_at
             FROM workspace_members wm
             JOIN users u ON u.id = wm.user_id
             JOIN workspaces w ON w.id = wm.workspace_id
             ORDER BY w.name, wm.role, u.email",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| {
            let joined: DateTime<Utc> = r.get("joined_at");
            MemberData {
                user_id: r.get("user_id"),
                email: r.get("email"),
                role: r.get("role"),
                workspace_id: r.get("workspace_id"),
                workspace: r.get("workspace"),
                joined: joined.format("%Y-%m-%d").to_string(),
            }
        })
        .collect())
}

pub async fn fetch_workspaces(
    client: &Client,
) -> Result<Vec<WorkspaceData>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT w.id::text, w.name, w.slug, w.plan,
                    (SELECT count(*) FROM workspace_members wm
                     WHERE wm.workspace_id = w.id) as members
             FROM workspaces w ORDER BY w.name",
            &[],
        )
        .await?;
    Ok(rows
        .iter()
        .map(|r| WorkspaceData {
            id: r.get("id"),
            name: r.get("name"),
            slug: r.get("slug"),
            plan: r.get("plan"),
            members: r.get("members"),
        })
        .collect())
}

pub async fn change_role(
    client: &Client,
    workspace_id: &str,
    user_id: &str,
    role: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE workspace_members SET role = $1
             WHERE workspace_id::text = $2 AND user_id::text = $3",
            &[&role, &workspace_id, &user_id],
        )
        .await?;
    Ok(())
}

pub async fn find_user_by_email(
    client: &Client,
    email: &str,
) -> Result<Option<String>, Box<dyn std::error::Error>> {
    let rows = client
        .query("SELECT id::text FROM users WHERE email = $1", &[&email])
        .await?;
    Ok(rows.first().map(|r| r.get("id")))
}

pub async fn is_already_member(
    client: &Client,
    workspace_id: &str,
    user_id: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT 1 FROM workspace_members
             WHERE workspace_id::text = $1 AND user_id::text = $2",
            &[&workspace_id, &user_id],
        )
        .await?;
    Ok(!rows.is_empty())
}

pub async fn add_member(
    client: &Client,
    workspace_id: &str,
    user_id: &str,
    role: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "INSERT INTO workspace_members (workspace_id, user_id, role)
             VALUES (($1::text)::uuid, ($2::text)::uuid, $3)",
            &[&workspace_id, &user_id, &role],
        )
        .await?;
    Ok(())
}

pub async fn remove_member(
    client: &Client,
    workspace_id: &str,
    user_id: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "DELETE FROM workspace_members
             WHERE workspace_id::text = $1 AND user_id::text = $2",
            &[&workspace_id, &user_id],
        )
        .await?;
    Ok(())
}

pub async fn fetch_ai_settings(
    client: &Client,
    workspace_id: &str,
) -> Result<Option<AiData>, Box<dyn std::error::Error>> {
    let rows = client
        .query(
            "SELECT enforce_ai, enforced_model, show_model_selector, default_model
             FROM workspace_ai_settings WHERE workspace_id::text = $1",
            &[&workspace_id],
        )
        .await?;
    Ok(rows.first().map(|r| AiData {
        enforce_ai: r.get("enforce_ai"),
        enforced_model: r.get("enforced_model"),
        show_model_selector: r.get("show_model_selector"),
        default_model: r.get("default_model"),
    }))
}

pub async fn set_ai_enforcement(
    client: &Client,
    workspace_id: &str,
    val: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE workspace_ai_settings SET enforce_ai = $1
             WHERE workspace_id::text = $2",
            &[&val, &workspace_id],
        )
        .await?;
    Ok(())
}

pub async fn set_model_selector(
    client: &Client,
    workspace_id: &str,
    val: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    client
        .execute(
            "UPDATE workspace_ai_settings SET show_model_selector = $1
             WHERE workspace_id::text = $2",
            &[&val, &workspace_id],
        )
        .await?;
    Ok(())
}
