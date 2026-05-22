/**
 * Email Service — Backward Compatibility Re-export
 *
 * All email functionality has moved to ./email/ directory.
 * This file re-exports everything so existing imports continue to work.
 *
 * Provider: SMTP, Resend, or Google Mail API (configured via EMAIL_PROVIDER env var)
 * Queue: PostgreSQL-backed with retry and dead-letter support
 *
 * @see ./email/index.ts for the main implementation
 */

export {
  sendEmail,
  sendTemplatedEmail,
  initEmailService,
  stopEmailService,
  getEmailQueueStats,
  reloadEmailProvider,
  getActiveProvider,
} from "./email/index.js";

export type { SendEmailOptions } from "./email/index.js";
