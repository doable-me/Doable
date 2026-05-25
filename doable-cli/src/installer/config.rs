//! `InstallConfig` — the validated shape that the form produces and the
//! runner consumes. Owns the env-var translation layer for `setup-server-v3.sh`.

use std::collections::BTreeMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TargetMode {
    Local,
    Remote,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SshAuth {
    Key,
    Password,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TunnelMode {
    Interactive,
    PreSupplied,
}

#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct InstallConfig {
    pub target_mode: TargetMode,
    pub host: String,
    pub ssh_user: String,
    pub ssh_port: u16,
    pub ssh_auth: SshAuth,
    pub ssh_key_path: PathBuf,
    pub ssh_password: String,

    pub env_name: String,
    pub doable_domain: String,

    pub create_admin: bool,
    pub admin_email: String,
    pub admin_display_name: String,
    pub admin_password: String,

    pub tunnel_mode: TunnelMode,
    pub tunnel_uuid: String,
    pub tunnel_cert_pem: String,
    pub tunnel_credentials_json: String,

    pub github_client_id: String,
    pub github_client_secret: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub supabase_client_id: String,
    pub supabase_client_secret: String,
    pub with_tmux: bool,
    pub create_douser: bool,
}

impl Default for InstallConfig {
    fn default() -> Self {
        Self {
            target_mode: TargetMode::Local,
            host: String::new(),
            ssh_user: "ubuntu".to_string(),
            ssh_port: 22,
            ssh_auth: SshAuth::Key,
            ssh_key_path: PathBuf::new(),
            ssh_password: String::new(),
            env_name: String::new(),
            // No hardcoded domain — each self-hoster supplies their own. Empty
            // is dropped by to_env_vars() so setup-server-v3.sh's own default
            // (localhost / interactive prompt) takes over for OOB installs.
            doable_domain: String::new(),
            create_admin: true,
            admin_email: String::new(),
            admin_display_name: String::new(),
            admin_password: String::new(),
            tunnel_mode: TunnelMode::Interactive,
            tunnel_uuid: String::new(),
            tunnel_cert_pem: String::new(),
            tunnel_credentials_json: String::new(),
            github_client_id: String::new(),
            github_client_secret: String::new(),
            google_client_id: String::new(),
            google_client_secret: String::new(),
            supabase_client_id: String::new(),
            supabase_client_secret: String::new(),
            with_tmux: false,
            create_douser: true,
        }
    }
}

impl InstallConfig {
    /// Translate the form into the env-var block consumed by
    /// `setup-server-v3.sh`. Empty strings are dropped so the script's own
    /// defaults take over.
    pub fn to_env_vars(&self) -> BTreeMap<String, String> {
        let mut m = BTreeMap::new();
        fn put(m: &mut BTreeMap<String, String>, k: &str, v: &str) {
            if !v.is_empty() {
                m.insert(k.to_string(), v.to_string());
            }
        }

        put(&mut m, "DOABLE_ENV_NAME", &self.env_name);
        put(&mut m, "DOABLE_DOMAIN", &self.doable_domain);

        // System-level douser account (the script's "create sudo user" path).
        if !self.create_douser {
            m.insert("DOABLE_SKIP_ADMIN_USER".into(), "1".into());
        }

        m.insert(
            "DOABLE_WITH_TMUX".into(),
            if self.with_tmux { "1".into() } else { "0".into() },
        );

        if self.tunnel_mode == TunnelMode::PreSupplied {
            put(&mut m, "DOABLE_CF_TUNNEL_UUID", &self.tunnel_uuid);
            put(&mut m, "DOABLE_CF_CERT_PEM", &self.tunnel_cert_pem);
            put(
                &mut m,
                "DOABLE_CF_CREDENTIALS_JSON",
                &self.tunnel_credentials_json,
            );
        }

        put(&mut m, "DOABLE_GITHUB_CLIENT_ID", &self.github_client_id);
        put(&mut m, "DOABLE_GITHUB_CLIENT_SECRET", &self.github_client_secret);
        put(&mut m, "DOABLE_GOOGLE_CLIENT_ID", &self.google_client_id);
        put(&mut m, "DOABLE_GOOGLE_CLIENT_SECRET", &self.google_client_secret);
        put(&mut m, "DOABLE_SUPABASE_CLIENT_ID", &self.supabase_client_id);
        put(
            &mut m,
            "DOABLE_SUPABASE_CLIENT_SECRET",
            &self.supabase_client_secret,
        );
        m
    }

    /// Render the env-var map as a single-line `KEY=VAL KEY=VAL ...` prefix
    /// suitable for prepending to a `sudo -E bash` invocation. Values are
    /// shell-quoted with single quotes; embedded single quotes are escaped
    /// with the standard `'\''` trick.
    #[allow(dead_code)]
    pub fn to_env_prefix(&self) -> String {
        let m = self.to_env_vars();
        let mut parts = Vec::with_capacity(m.len());
        for (k, v) in m.iter() {
            let escaped = v.replace('\'', "'\\''");
            parts.push(format!("{}='{}'", k, escaped));
        }
        parts.join(" ")
    }
}
