/**
 * Database-Backed Email Queue
 *
 * Persists emails to PostgreSQL for reliable delivery.
 * A polling worker picks up pending emails and sends them via the configured provider.
 *
 * Features:
 * - Survives server crashes (emails persisted to disk)
 * - Exponential backoff retries (5 attempts: 30s, 2m, 8m, 32m, 2h)
 * - Concurrency control (max 10 emails processed in parallel)
 * - Dead letter: after max_attempts, status → 'dead' for manual inspection
 * - Graceful shutdown: stops polling, waits for in-flight sends
 */

import type postgres from "postgres";
import type { EmailProvider } from "./provider.js";

const POLL_INTERVAL_MS = 5_000;    // Check for new emails every 5 seconds
const BATCH_SIZE = 10;             // Process up to 10 emails per poll cycle
const MAX_CONCURRENT = 10;         // Max parallel sends
const BASE_RETRY_DELAY_S = 30;     // 30s base for exponential backoff

interface QueuedEmail {
  id: string;
  to_address: string;
  subject: string;
  html: string;
  text_body: string | null;
  from_address: string | null;
  attempts: number;
  max_attempts: number;
}

export class EmailQueue {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private inFlight = 0;
  private shuttingDown = false;

  constructor(
    private sql: postgres.Sql,
    private provider: EmailProvider,
  ) {}

  /**
   * Hot-swap the provider without restarting the queue.
   */
  setProvider(provider: EmailProvider): void {
    this.provider = provider;
  }

  /**
   * Enqueue an email for delivery. Returns immediately after INSERT.
   */
  async enqueue(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    template?: string;
    templateData?: Record<string, unknown>;
  }): Promise<string> {
    const [row] = await this.sql`
      INSERT INTO email_queue (to_address, subject, html, text_body, from_address, template, template_data)
      VALUES (
        ${params.to},
        ${params.subject},
        ${params.html},
        ${params.text ?? null},
        ${params.from ?? null},
        ${params.template ?? null},
        ${params.templateData ? JSON.stringify(params.templateData) : null}
      )
      RETURNING id
    `;
    return row!.id;
  }

  /**
   * Start the polling worker. Call once at server startup.
   */
  start(): void {
    if (this.pollTimer) return;
    console.log(`[EmailQueue] Worker started (provider: ${this.provider.name}, poll: ${POLL_INTERVAL_MS}ms)`);
    this.poll(); // immediate first poll
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  /**
   * Stop the worker gracefully. Waits for in-flight sends to finish.
   */
  async stop(): Promise<void> {
    this.shuttingDown = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    // Wait for in-flight sends (max 30s)
    const deadline = Date.now() + 30_000;
    while (this.inFlight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (this.inFlight > 0) {
      console.warn(`[EmailQueue] Shut down with ${this.inFlight} sends still in flight`);
    }
    console.log("[EmailQueue] Worker stopped");
  }

  /**
   * Single poll cycle: claim a batch of pending emails and process them.
   */
  private async poll(): Promise<void> {
    if (this.shuttingDown || this.inFlight >= MAX_CONCURRENT) return;

    try {
      const available = MAX_CONCURRENT - this.inFlight;
      const batchLimit = Math.min(BATCH_SIZE, available);

      // Atomically claim emails: set status='processing' and return them
      const emails = await this.sql<QueuedEmail[]>`
        UPDATE email_queue
        SET status = 'processing', updated_at = now()
        WHERE id IN (
          SELECT id FROM email_queue
          WHERE status IN ('pending', 'failed')
            AND next_retry_at <= now()
            AND attempts < max_attempts
          ORDER BY next_retry_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${batchLimit}
        )
        RETURNING id, to_address, subject, html, text_body, from_address, attempts, max_attempts
      `;

      if (emails.length === 0) return;

      // Process in parallel (fire-and-forget per email, errors handled inside)
      for (const email of emails) {
        this.inFlight++;
        this.processEmail(email).finally(() => {
          this.inFlight--;
        });
      }
    } catch (err) {
      console.error("[EmailQueue] Poll error:", err);
    }
  }

  /**
   * Attempt to send a single email. Updates DB status on success/failure.
   */
  private async processEmail(email: QueuedEmail): Promise<void> {
    const attempt = email.attempts + 1;

    try {
      const result = await this.provider.send({
        to: email.to_address,
        subject: email.subject,
        html: email.html,
        text: email.text_body ?? undefined,
        from: email.from_address ?? undefined,
      });

      if (result.success) {
        await this.sql`
          UPDATE email_queue
          SET status = 'sent', attempts = ${attempt}, sent_at = now(), updated_at = now()
          WHERE id = ${email.id}
        `;
        console.log(`[EmailQueue] Sent "${email.subject}" to ${email.to_address} (attempt ${attempt})`);
      } else {
        await this.markFailed(email, attempt, result.error ?? "Unknown error");
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.markFailed(email, attempt, error);
    }
  }

  /**
   * Mark an email as failed. If max attempts reached, move to 'dead'.
   */
  private async markFailed(email: QueuedEmail, attempt: number, error: string): Promise<void> {
    const isDead = attempt >= email.max_attempts;
    const status = isDead ? "dead" : "failed";

    // Exponential backoff: 30s, 2m, 8m, 32m, 2h
    const retryDelaySec = BASE_RETRY_DELAY_S * Math.pow(4, attempt - 1);

    await this.sql`
      UPDATE email_queue
      SET status = ${status},
          attempts = ${attempt},
          last_error = ${error},
          next_retry_at = now() + ${retryDelaySec + " seconds"}::interval,
          updated_at = now()
      WHERE id = ${email.id}
    `;

    if (isDead) {
      console.error(`[EmailQueue] Dead letter: "${email.subject}" to ${email.to_address} after ${attempt} attempts — ${error}`);
    } else {
      console.warn(`[EmailQueue] Failed (attempt ${attempt}/${email.max_attempts}): "${email.subject}" to ${email.to_address} — ${error}. Retry in ${retryDelaySec}s`);
    }
  }

  /**
   * Get queue stats for monitoring.
   */
  async stats(): Promise<{
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    dead: number;
  }> {
    const rows = await this.sql<{ status: string; count: string }[]>`
      SELECT status, COUNT(*)::text as count FROM email_queue GROUP BY status
    `;
    const result = { pending: 0, processing: 0, sent: 0, failed: 0, dead: 0 };
    for (const row of rows) {
      if (row.status in result) {
        result[row.status as keyof typeof result] = parseInt(row.count, 10);
      }
    }
    return result;
  }

  /**
   * Cleanup: reset any 'processing' emails stuck from a previous crash.
   * Call once at startup.
   */
  async recoverStuck(): Promise<number> {
    const result = await this.sql`
      UPDATE email_queue
      SET status = 'pending', updated_at = now()
      WHERE status = 'processing'
        AND updated_at < now() - interval '5 minutes'
    `;
    const recovered = result.count;
    if (recovered > 0) {
      console.log(`[EmailQueue] Recovered ${recovered} stuck emails from previous crash`);
    }
    return recovered;
  }
}
