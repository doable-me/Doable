# 23-thumbnails — Test Case Index

Puppeteer-based thumbnail generation on publish; queue + concurrency.

| File | Focus | Cases |
|---|---|---|
| TC-THUMB-GEN.md | Puppeteer render, retry, fallback, dimensions | 45 |
| TC-THUMB-QUEUE.md | concurrency cap, priority, DLQ, metrics | 20 |

Cross-cutting:
- Render runs under DOABLE_HARDENING sandbox; no internal-host access.
- Renders public published URL via Cloudflare Tunnel domain.
- Atomic file replace on regenerate; URL versioned to bust caches.
- Failures fall back to placeholder; never blocks publish completion.
