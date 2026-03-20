# 06 — Authentication & User Management

## Overview

Authentication operates at two levels:
1. **Platform Auth**: How users log into Doable itself (the builder platform)
2. **Built-App Auth**: Authentication systems generated inside user-built applications

---

## 1. Platform Authentication (Doable Builder)

### 1.1 Sign-up / Login Methods
| Method | Description |
|--------|-------------|
| **Email + Password** | Standard signup with email verification |
| **Google OAuth** | One-click Google sign-in |
| **GitHub OAuth** | One-click GitHub sign-in |
| **SSO (Business+)** | OIDC/SAML 2.0 with enterprise IdPs |

### 1.2 SSO Support (Business Plan+)
| Feature | Description |
|---------|-------------|
| **Protocols** | OIDC and SAML 2.0 |
| **Providers** | Okta, Auth0, Azure AD, OneLogin, Google Workspace, etc. |
| **Redirect URI** | `https://auth.doable.dev/__/auth/handler` |
| **Configuration** | Admin configures in Workspace Settings |
| **Enforcement** | Can require SSO for all workspace members |
| **SSO-only enforcement** | Enterprise plans can prevent sign-in through non-SSO auth methods (email/password, OAuth disabled) |
| **Simplified SAML setup** | Import IdP metadata via URL — auto-extracts entity ID, endpoints, and certificates (Business/Enterprise) |

### 1.3 SCIM Provisioning (Enterprise)
| Feature | Description |
|---------|-------------|
| **Auto-provisioning** | Automatically create Doable accounts when users are added in IdP (Okta, Azure AD, etc.) |
| **Auto-deprovisioning** | Automatically remove/disable accounts when users are removed from IdP |
| **Group mapping** | Map IdP groups to workspace roles |
| **Just-in-time** | Users provisioned on first SSO login if not pre-provisioned |
| **Protocol** | SCIM 2.0 standard |
| **Sync** | Real-time sync of user attributes (name, email, role) from IdP |

### 1.4 Two-Factor Authentication
- Banner encouraging email+password users to enable 2FA
- TOTP (authenticator app) support
- Recovery codes

### 1.5 Account Security
| Feature | Description |
|---------|-------------|
| **2FA** | Optional TOTP-based second factor |
| **Session management** | View/revoke active sessions |
| **Password reset** | Email-based reset flow |
| **Email change** | Verification for email updates |
| **Account deletion** | User-initiated with confirmation |

---

## 2. Built-App Authentication (Generated in User Apps)

### 2.1 Auth Methods for Built Apps
Generated via prompts (e.g., "Add login page with Google sign-in"):

| Method | Description |
|--------|-------------|
| **Email + Password** | Generated signup/login pages, state management, sign-out |
| **Phone Sign-in** | OTP-based phone authentication |
| **Google OAuth 2.0** | Managed mode (Doable handles credentials) or BYOK (user's Google Cloud) |
| **GitHub OAuth** | OAuth flow integration |
| **Magic Links** | Passwordless email authentication |

### 2.2 Managed Auth Mode
- **Managed Mode**: Doable handles OAuth credentials, redirects, and security
  - No setup required for basic auth
  - Consent screens and scopes pre-configured (openid, email, profile)
  - Redirects handled by Doable Cloud
- **BYOK Mode**: User provides their own OAuth credentials
  - Full control over consent screen
  - Custom scopes and permissions
  - Configured in Cloud → Users → Auth

### 2.3 Generated Auth Components
When auth is requested, agent generates:
| Component | Description |
|-----------|-------------|
| **Login Page** | Form with email/password + OAuth buttons |
| **Signup Page** | Registration form with validation |
| **Auth Context** | React context for auth state |
| **Protected Routes** | Route guards for authenticated pages |
| **User Profile** | Basic profile display/edit |
| **Sign Out** | Logout button/flow |
| **Password Reset** | Forgot password flow |

### 2.4 Auth State Integration
- Auth state tied to database user `id`
- Subscriptions linked to authenticated user
- Row-Level Security policies auto-configured
- Session persistence via tokens

---

## 3. User Management in Built Apps

### 3.1 Doable Cloud User Management
| Feature | Description |
|---------|-------------|
| **User list** | View all registered accounts |
| **Activity tracking** | Track user login history |
| **Access controls** | Manage user permissions |
| **User roles** | Admin, User, custom roles |
| **Ban/Disable** | Admin can disable accounts |

### 3.2 Role-Based Access Control (RBAC)
- Generated via prompts: "Add admin and user roles"
- Database `roles` table with user-role mapping
- Row-Level Security policies per role
- UI shows/hides features based on role
- Admin dashboards for user management

### 3.3 Row-Level Security (RLS)
| Policy Type | Description |
|-------------|-------------|
| **User isolation** | Users see only their own data |
| **Role-based** | Admins see all, users see own |
| **Organization** | Users in same org see shared data |
| **Public** | Some data visible to all |
| **Custom** | SQL-based custom policies |

---

## 4. Native Mobile Auth

### 4.1 OAuth for Mobile
- Deep link handling for OAuth callbacks
- Platform-specific auth flows (iOS/Android)
- Token storage best practices
- Biometric authentication support (optional)

---

## 5. Security Features

### 5.1 API Key Protection
- Agent auto-detects API keys in chat
- Prevents hardcoding secrets in source code
- Stores as encrypted secrets in Doable Cloud
- Injected at runtime into edge functions

### 5.2 Security Scanning
| Feature | Description |
|---------|-------------|
| **Dependency scanning** | Automated vulnerability detection in npm packages |
| **Security findings** | Reported for dependency issues |
| **Security center** | Workspace admin dashboard for security issues |
| **Auto-remediation** | Agent can fix known vulnerabilities |

### 5.3 Data Protection
- Encrypted secrets at rest and in transit
- No user data used for training (Business+ opt-out)
- Data protection agreements (Enterprise)
- GDPR compliance support
