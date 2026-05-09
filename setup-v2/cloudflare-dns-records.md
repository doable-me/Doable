# Cloudflare DNS records — per-org environment

Zone: **doable.me**

`<env>` below is the value the operator picked for `DOABLE_ENV_NAME`
(e.g. `myorg`, `qa`, `prod`).

## TL;DR

Three new CNAMEs, all proxied (orange cloud), all pointing to the new
env's tunnel. SSL is covered by the existing free Universal SSL cert
because every name is single-label under the apex (`*.doable.me`).

## Prerequisite

Tunnel UUID for `<env>` — produced by `cloudflared tunnel create <env>`
on the new VPS. Call it `<ENV_TUNNEL_UUID>` below.

## Records to create

| # | Type  | Name           | Target                                       | Proxy | TTL  | Notes |
|---|-------|----------------|----------------------------------------------|-------|------|-------|
| 1 | CNAME | `<env>`        | `<ENV_TUNNEL_UUID>.cfargotunnel.com`         | On    | Auto | Web   |
| 2 | CNAME | `<env>-api`    | `<ENV_TUNNEL_UUID>.cfargotunnel.com`         | On    | Auto | API   |
| 3 | CNAME | `<env>-ws`     | `<ENV_TUNNEL_UUID>.cfargotunnel.com`         | On    | Auto | WS    |

**Easiest path:** don't create these in the dashboard — instead run on
the new VPS (after the tunnel exists):

```bash
cloudflared tunnel route dns <env> <env>.doable.me
cloudflared tunnel route dns <env> <env>-api.doable.me
cloudflared tunnel route dns <env> <env>-ws.doable.me
```

That command both creates the CNAME and turns on the proxy. It refuses if
a record already exists; in that case use `--overwrite-dns`.

## Records that already exist (do NOT touch)

Other environments share the zone. Confirm via the Cloudflare dashboard
before adding new records — typical existing names include `staging`,
`staging-api`, `staging-ws`, `dev`, `dev-api`, `dev-ws`, plus the apex
`doable.me` + `api` + `ws` for prod.

## Records auto-managed at runtime

`*.doable.me` per-publish subdomains (e.g. `<env>-myslug.doable.me`)
are created on-demand by the publish flow:
`cloudflared tunnel route dns <env> <env>-<slug>.doable.me`. No
manual provisioning needed. The `PUBLISH_SUBDOMAIN_PREFIX=<env>-` env
var enforces the prefix from the API side.

## SSL

Universal SSL on `doable.me` covers `doable.me` and `*.doable.me`
(single-level wildcard). All three new names are single-level — no ACM
needed. Per `feedback_cloudflare_naming.md` and CLAUDE.md, do NOT use
`api.<env>.doable.me` style — it would 525/SSL-mismatch.
