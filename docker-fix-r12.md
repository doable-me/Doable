# Docker R12 Audit Fix Notes

Branch: `r12/docker-blockers-fix`
Commit: `69974061`

## BLOCKER 1 — API_HOST/WS_HOST 0.0.0.0 → 127.0.0.1

**deployment/docker/docker-compose.yml**
- api env: `API_HOST: 0.0.0.0` → `API_HOST: 127.0.0.1`
- api env: `WS_HOST: 0.0.0.0` → `WS_HOST: 127.0.0.1`
- ws env: `WS_HOST: 0.0.0.0` → `WS_HOST: 127.0.0.1`

**deployment/docker/docker-compose.prod.yml**
- api env: `API_HOST: 0.0.0.0` → `API_HOST: 127.0.0.1`
- api env: `WS_HOST: 0.0.0.0` → `WS_HOST: 127.0.0.1`
- ws env: `WS_HOST: 0.0.0.0` → `WS_HOST: 127.0.0.1`

## BLOCKER 2 — DOABLE_KEK missing from ws service

**deployment/docker/docker-compose.yml** — added to ws environment block:
  `DOABLE_KEK: ${DOABLE_KEK:?DOABLE_KEK is required — run ./deployment/docker/setup.sh to generate}`

**deployment/docker/docker-compose.prod.yml** — added to ws environment block:
  `DOABLE_KEK: ${DOABLE_KEK:?Set DOABLE_KEK in deployment/docker/.env — openssl rand -base64 32}`

## HIGH 1 — tmux-entrypoint.sh sleep loop defeats set -e

**deployment/docker/tmux-entrypoint.sh** lines 34-41:
- Replaced `while tmux has-session; sleep 1; done` with tmux hook + `wait-for` pattern
- `pane-died` hook writes `#{pane_dead_status}` to a temp file, signals `${SESSION}-done` channel
- `session-closed` hook fires the same signal as fallback
- `tmux wait-for "${SESSION}-done"` blocks without polling
- Reads exit code from temp file and calls `exit "${EXIT_CODE:-0}"`
- Container now exits non-zero when the inner workload crashes

## HIGH 2 — setup.sh banner hardcoded compose file path

**deployment/docker/setup.sh** lines 530-532:
- `deployment/docker/docker-compose.yml` → `${COMPOSE_FILE}` in all 3 banner commands (logs, down, restart)

## HIGH 3 — web depends_on without healthcheck condition

**deployment/docker/docker-compose.yml**
- Added `healthcheck` to ws service (curl http://127.0.0.1:4001/health, interval 10s, timeout 5s, retries 6, start_period 30s)
- api healthcheck was already present
- web `depends_on` changed to `condition: service_healthy` for both api and ws

**deployment/docker/docker-compose.prod.yml**
- Added `healthcheck` to api service (curl http://127.0.0.1:4000/health, same params)
- Added `healthcheck` to ws service (curl http://127.0.0.1:4001/health, same params)
- web `depends_on` changed to `condition: service_healthy` for both api and ws

## Validation

Both YAML files validated clean (python yaml.safe_load):
- `deployment/docker/docker-compose.yml` — OK
- `deployment/docker/docker-compose.prod.yml` — OK
