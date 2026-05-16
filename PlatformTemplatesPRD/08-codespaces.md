# 08 — GitHub Codespaces / VS Code Dev Containers

Zero-friction contributor onboarding: click "Open in Codespaces" on the
README → working Doable dev environment in ~2 minutes, no local setup.
Same `.devcontainer/devcontainer.json` works for "Reopen in Container" in
local VS Code.

## Deliverable

`.devcontainer/devcontainer.json` plus a `post-create.sh` script the
devcontainer runs after the container starts.

## Final `.devcontainer/devcontainer.json`

```jsonc
{
  "name": "Doable Dev",
  "image": "mcr.microsoft.com/devcontainers/typescript-node:22-bookworm",

  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {
      "version": "latest",
      "moby": true
    },
    "ghcr.io/devcontainers/features/github-cli:1": {},
    "ghcr.io/devcontainers/features/node:1": {
      "version": "22",
      "nodeGypDependencies": true
    },
    "ghcr.io/devcontainers-contrib/features/pnpm:2": {
      "version": "latest"
    }
  },

  "runArgs": ["--init"],

  "forwardPorts": [3000, 4000, 4001, 5432],
  "portsAttributes": {
    "3000": { "label": "Web (Next.js)", "onAutoForward": "openBrowser" },
    "4000": { "label": "API (Hono)", "onAutoForward": "silent" },
    "4001": { "label": "WebSocket (Yjs)", "onAutoForward": "silent" },
    "5432": { "label": "Postgres", "onAutoForward": "silent" }
  },

  "postCreateCommand": "bash .devcontainer/post-create.sh",

  "customizations": {
    "vscode": {
      "extensions": [
        "dbaeumer.vscode-eslint",
        "esbenp.prettier-vscode",
        "bradlc.vscode-tailwindcss",
        "ms-azuretools.vscode-docker",
        "eamodio.gitlens",
        "ms-vscode.vscode-typescript-next",
        "Prisma.prisma",
        "github.vscode-github-actions"
      ],
      "settings": {
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "[typescript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
        "[typescriptreact]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
        "typescript.preferences.importModuleSpecifier": "non-relative",
        "git.openRepositoryInParentFolders": "always"
      }
    }
  },

  "hostRequirements": {
    "cpus": 4,
    "memory": "16gb",
    "storage": "32gb"
  },

  "remoteUser": "node",
  "containerEnv": {
    "PNPM_HOME": "/home/node/.local/share/pnpm",
    "PATH": "${PNPM_HOME}:${PATH}"
  }
}
```

## `.devcontainer/post-create.sh`

```bash
#!/usr/bin/env bash
set -e

echo "==> Installing dependencies (pnpm install)..."
pnpm install --frozen-lockfile

echo "==> Bringing up Postgres (docker compose up postgres)..."
# Use the docker-in-docker feature; pgvector image runs on the same host.
docker compose -f docker/docker-compose.yml up -d postgres
sleep 5

echo "==> Generating local docker/.env if missing..."
if [ ! -f docker/.env ]; then
  ./docker/setup.sh 2>&1 | tail -5  # generates secrets only; doesn't run compose up
fi

echo "==> Running migrations..."
docker compose -f docker/docker-compose.yml run --rm migrate

echo "==> Setup complete!"
echo ""
echo "To start the full dev stack:"
echo "  pnpm dev                       # Runs api + ws + web in dev mode"
echo ""
echo "Or run inside docker:"
echo "  docker compose -f docker/docker-compose.yml up -d"
echo ""
echo "Ports:"
echo "  Web:  http://localhost:3000"
echo "  API:  http://localhost:4000"
echo "  WS:   ws://localhost:4001"
```

## Machine size: why 4 CPU / 16 GB minimum

- `pnpm install` on the workspace pulls ~1500 packages (~1.5 GB
  node_modules).
- The Next.js build of `apps/web` peaks at ~2.5 GB RAM (Tailwind +
  Monaco + all admin pages).
- TypeScript LSP across 4 workspaces eats another ~1.5 GB.
- Docker-in-Docker for postgres adds ~500 MB.

The default Codespaces 2-core/8GB plan OOMs during the first `pnpm build`.
Setting `hostRequirements: { cpus: 4, memory: "16gb" }` forces Codespaces
to allocate the larger plan; users get a clear "this is a 4-core machine"
prompt instead of a mysterious OOM.

## Forwarded-port behavior

Codespaces gives each forwarded port a `*.app.github.dev` HTTPS URL:

- Web (3000) → `https://<codespace-id>-3000.app.github.dev`
- API (4000) → `https://<codespace-id>-4000.app.github.dev`
- WS (4001) → `https://<codespace-id>-4001.app.github.dev`
- Postgres (5432) → not exposed publicly (Codespaces only forwards HTTP)

These URLs have **automatic Let's Encrypt certs**, so `NEXT_PUBLIC_*` env
vars must use `https://` and `wss://` even though the underlying server
binds plain HTTP.

The `post-create.sh` doesn't pre-populate `NEXT_PUBLIC_*` — those depend
on the codespace-id which isn't known at create time. The user must set
them via the VS Code task `Set Codespace URLs` (we ship a `.vscode/tasks.json`
that runs `gh codespace ports forward` and prints the right URLs to
copy-paste into `docker/.env`).

## What's different from local dev

| Item | Local dev | Codespaces |
|---|---|---|
| Postgres host | `127.0.0.1:5432` | same (docker-in-docker) |
| Public URLs | `http://localhost:N` | `https://<id>-N.app.github.dev` |
| SSL | none | auto Let's Encrypt |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | `https://<id>-4000.app.github.dev` (manual set) |
| Port forwarding | direct | through `gh codespace ports forward` |
| Persistence | local disk | codespace storage (survives restarts; deleted with codespace) |

## README badge

```markdown
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/doable-me/doable?quickstart=1)
```

Or with the prebuilt-config option:

```markdown
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=doable-me/doable&machine=standardLinux32gb&devcontainer_path=.devcontainer/devcontainer.json)
```

The second form pre-selects the 4-core machine and the devcontainer path,
saving the user one prompt.

## Codespaces prebuild (optional follow-up)

`.github/workflows/codespaces-prebuild.yml` can build a Codespaces prebuild
image on every push to main, caching `node_modules` and the postgres init.
This drops the "Open in Codespaces" startup from ~2 minutes to ~30s. Not
included in the initial deliverable; add when contribution volume
warrants it.

## Acceptance criteria

- [ ] `.devcontainer/devcontainer.json` validates with `devcontainer up` (devcontainer-cli)
- [ ] Click "Open in Codespaces" → codespace launches successfully on the
      4-core plan
- [ ] `post-create.sh` runs to completion (pnpm install + postgres up +
      migrations applied)
- [ ] `pnpm dev` brings up api/ws/web; forwarded ports work
- [ ] First user registration via the Codespaces-issued web URL succeeds
- [ ] "Reopen in Container" in local VS Code (with Dev Containers
      extension installed) also works against the same devcontainer.json
