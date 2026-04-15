/**
 * Email Provider Interface
 *
 * All email providers implement this interface.
 * The active provider is selected via EMAIL_PROVIDER env var.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string; // overrides default EMAIL_FROM
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;

  /**
   * Send a single email. Returns success/failure with optional error message.
   * The provider should NOT retry — the queue handles retries.
   */
  send(message: EmailMessage): Promise<EmailSendResult>;

  /**
   * Optional: verify the provider configuration is valid (e.g. test SMTP connection).
   * Called once at startup.
   */
  verify?(): Promise<boolean>;
}
