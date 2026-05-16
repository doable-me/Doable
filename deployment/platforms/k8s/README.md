# Doable — Kubernetes (Kustomize) Quickstart


## Prerequisites

- `kubectl` configured against your cluster
- `cert-manager` installed (prod overlay only)
- `ingress-nginx` controller installed

## Deploy

```bash
# 1. Create namespace
kubectl create namespace doable

# 2. Fill in secrets
cp deployment/platforms/k8s/base/secret.example.yaml deployment/platforms/k8s/base/secret.yaml
# Edit secret.yaml — replace every CHANGEME with real values:
#   JWT_SECRET / ENCRYPTION_KEY / INTERNAL_SECRET:  openssl rand -hex 32
#   DOABLE_KEK:                                      openssl rand -base64 32
#   POSTGRES_PASSWORD:                               openssl rand -hex 16
#   DATABASE_URL: postgres://doable:<POSTGRES_PASSWORD>@postgres:5432/doable
#   INSTALL_BOOTSTRAP_TOKEN:                         openssl rand -hex 32
#   INSTALL_BOOTSTRAP_TOKEN_EXPIRES_AT:              e.g. 2099-01-01T00:00:00Z
#   Set at least one AI provider key (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)

# 3. Add secret.yaml to kustomization resources
# Edit deployment/platforms/k8s/base/kustomization.yaml and uncomment the "- secret.yaml" line

# 4. Edit deployment/platforms/k8s/base/configmap.yaml — replace app.example.com with your domain

# 5. Apply
kubectl apply -k deployment/platforms/k8s/base/
# or for prod (2 replicas + TLS):
kubectl apply -k deployment/platforms/k8s/overlays/prod/

# 6. Wait for rollout
kubectl wait --for=condition=available --timeout=300s deployment/api -n doable
kubectl wait --for=condition=available --timeout=300s deployment/ws -n doable
kubectl wait --for=condition=available --timeout=300s deployment/web -n doable

# 7. Get ingress IP / hostname
kubectl get ingress -n doable
```

## Overlays

| Overlay | Purpose |
|---|---|
| `overlays/dev/` | 1 replica, reduced resource limits, plain HTTP |
| `overlays/prod/` | 2 replicas (api + web), cert-manager TLS via letsencrypt-prod |

## Secret management

The default `deployment/platforms/k8s/base/secret.yaml` approach stores secrets as a plain k8s Secret
(base64-encoded, not encrypted unless your cluster has KMS). For production:

- **External Secrets Operator** (recommended): point a `ClusterSecretStore` at
  AWS Secrets Manager / GCP Secret Manager / HashiCorp Vault.
- **sealed-secrets**: `kubeseal < secret.yaml > sealed-secret.yaml` — safe to commit.

## Migration

Migrations run automatically as an `initContainer` in each api and ws pod before
the main container starts. The migrate image is idempotent (all SQL uses
`IF NOT EXISTS`).

A standalone `migrate-job.yaml` is also included for operators who prefer an
explicit migration step (e.g. with ArgoCD sync waves).

## Scaling

- **web**: stateless — scale freely: `kubectl scale deployment/web --replicas=3 -n doable`
- **api**: stateful (local filesystem PVCs). Scale > 1 requires switching
  `api-projects` and `api-thumbnails` PVCs to `ReadWriteMany` (NFS/EFS/CephFS).
- **ws**: requires sticky sessions for Yjs state. See comment in `ws-deployment.yaml`.
- **postgres**: single StatefulSet — use managed Postgres (RDS, Cloud SQL, Supabase)
  for HA.
