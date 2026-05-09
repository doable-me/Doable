# 25-runtime — Test Case Index

Per-project Vite engine lifecycle, systemd unit hardening, dovault sandboxing, capacity / eviction / concurrency.

| File | Focus | Cases |
|---|---|---|
| TC-RUNTIME-VITE.md | Vite spawn/HMR/eviction, port allocation | 40 |
| TC-RUNTIME-SYSTEMD.md | unit lifecycle, sandbox flags, dovault backends | 40 |
| TC-RUNTIME-CAPACITY.md | MAX_CONCURRENT_ENGINES, LRU, queueing | 25 |

Cross-cutting:
- All servers bind 127.0.0.1 only.
- DOABLE_HARDENING controls sandbox depth (full | relaxed | off; off forbidden in prod).
- DOVAULT_BACKEND=systemd|bubblewrap|psroot|sandbox-exec — Docker NOT supported.
- All spawn paths go through `dovault.spawn` (no direct child_process for project code).
- DEV_SERVER_IDLE_MS default 300000; configurable via platform_config.
