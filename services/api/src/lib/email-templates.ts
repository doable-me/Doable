/**
 * Email Templates
 *
 * Clean, inline-CSS HTML templates for transactional emails.
 * All styles are inline for maximum email client compatibility.
 */

const BRAND_COLOR = "#6366f1"; // Indigo-500
const BRAND_COLOR_DARK = "#4f46e5"; // Indigo-600
const TEXT_COLOR = "#1f2937"; // Gray-800
const TEXT_MUTED = "#6b7280"; // Gray-500
const BG_COLOR = "#f9fafb"; // Gray-50
const CARD_BG = "#ffffff";

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Doable</title>
</head>
<body style="margin:0;padding:0;background-color:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BG_COLOR};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <span style="font-size:28px;font-weight:700;color:${BRAND_COLOR};letter-spacing:-0.5px;">Doable</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:${CARD_BG};border-radius:12px;padding:40px 36px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:${TEXT_MUTED};line-height:1.5;">
                This email was sent by Doable. If you did not expect this email, you can safely ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px auto;">
  <tr>
    <td align="center" style="background-color:${BRAND_COLOR};border-radius:8px;">
      <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
        ${escapeHtml(text)}
      </a>
    </td>
  </tr>
</table>`;
}

// ─── Templates ──────────────────────────────────────────────

/**
 * Password reset email template.
 */
export function passwordResetEmail(resetUrl: string, userName: string): string {
  const displayName = userName || "there";
  return baseLayout(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${TEXT_COLOR};line-height:1.3;">
      Reset your password
    </h1>
    <p style="margin:0 0 12px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
      Hi ${escapeHtml(displayName)},
    </p>
    <p style="margin:0 0 4px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
      We received a request to reset the password for your Doable account. Click the button below to choose a new password.
    </p>
    ${button("Reset Password", resetUrl)}
    <p style="margin:0 0 8px;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
      This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;" />
    <p style="margin:0;font-size:12px;color:${TEXT_MUTED};line-height:1.5;">
      If the button doesn't work, copy and paste this URL into your browser:<br />
      <a href="${escapeHtml(resetUrl)}" style="color:${BRAND_COLOR};word-break:break-all;">${escapeHtml(resetUrl)}</a>
    </p>
  `);
}

/**
 * Welcome email template sent after signup.
 */
export function welcomeEmail(userName: string): string {
  const displayName = userName || "there";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return baseLayout(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${TEXT_COLOR};line-height:1.3;">
      Welcome to Doable!
    </h1>
    <p style="margin:0 0 12px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
      Hi ${escapeHtml(displayName)},
    </p>
    <p style="margin:0 0 12px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
      Your account is all set up and ready to go. Doable helps you build, preview, and ship web projects with AI-powered assistance.
    </p>
    <p style="margin:0 0 4px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
      Here are a few things you can do right away:
    </p>
    <ul style="margin:12px 0 0;padding-left:20px;font-size:15px;color:${TEXT_COLOR};line-height:1.8;">
      <li>Create your first project from a template</li>
      <li>Chat with AI to generate and edit code</li>
      <li>Preview your app live as you build</li>
      <li>Publish and share with one click</li>
    </ul>
    ${button("Go to Doable", appUrl)}
    <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
      If you have any questions, reply to this email or visit our docs.
    </p>
  `);
}

/**
 * Workspace invite email template.
 */
export function inviteEmail(
  workspaceName: string,
  inviterName: string,
  acceptUrl: string,
): string {
  return baseLayout(`
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${TEXT_COLOR};line-height:1.3;">
      You're invited!
    </h1>
    <p style="margin:0 0 12px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
      <strong>${escapeHtml(inviterName)}</strong> has invited you to join the
      <strong>${escapeHtml(workspaceName)}</strong> workspace on Doable.
    </p>
    <p style="margin:0 0 4px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
      Click the button below to accept the invitation and start collaborating.
    </p>
    ${button("Accept Invitation", acceptUrl)}
    <p style="margin:0;font-size:13px;color:${TEXT_MUTED};line-height:1.5;">
      If you don't have a Doable account yet, you'll be able to create one when you accept.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;" />
    <p style="margin:0;font-size:12px;color:${TEXT_MUTED};line-height:1.5;">
      If the button doesn't work, copy and paste this URL into your browser:<br />
      <a href="${escapeHtml(acceptUrl)}" style="color:${BRAND_COLOR};word-break:break-all;">${escapeHtml(acceptUrl)}</a>
    </p>
  `);
}

// ─── Helpers ────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
