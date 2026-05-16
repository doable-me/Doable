# 06 — Kubernetes (Kustomize first, Helm later)

Production users assume a Kubernetes deploy path exists. We ship Kustomize
manifests first because: (a) fewer files than a Helm chart, (b) no template
language to learn, (c) operators can convert to Helm themselves if needed.
Helm chart is a follow-up.

## Deliverable

`k8s/` directory tree:

```
k8s/
  base/
    kustomization.yaml
    namespace.yaml
    secret.example.yaml          # template; operator copies + fills
    configmap.yaml
    postgres-statefulset.yaml
    postgres-service.yaml
    postgres-pvc.yaml
    migrate-job.yaml
    api-deployment.yaml
    api-service.yaml
    api-pvc.yaml
    ws-deployment.yaml
    ws-service.yaml
    ws-pvc.yaml
    web-deployment.yaml
    web-service.yaml
    ingress.yaml                  # default nginx-ingress; cert-manager optional
  overlays/
    dev/
      kustomization.yaml          # tweaks: 1 replica, smaller resource asks, no TLS
    prod/
      kustomization.yaml          # tweaks: 2+ replicas, resource limits, TLS via cert-manager
```

## Required resources

| Resource | Purpose | Key fields |
|---|---|---|
| `Namespace` | Isolation | `name: doable` |
| `Secret/doable-secrets` | The 5 required secrets + optional AI keys | `JWT_SECRET`, `ENCRYPTION_KEY`, `INTERNAL_SECRET`, `DOABLE_KEK`, `POSTGRES_PASSWORD`, plus all 19 AI provider vars (set empty if not used) |
| `ConfigMap/doable-config` | Non-secret env | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL`, `CORS_ORIGINS`, `NODE_ENV`, port settings |
| `StatefulSet/postgres` | Postgres + pgvector | image `pgvector/pgvector:pg16`, PVC mounted at `/var/lib/postgresql/data` |
| `Service/postgres` | ClusterIP postgres:5432 | type: ClusterIP, only api/ws/migrate can reach |
| `PersistentVolumeClaim/postgres-data` | Postgres storage | 10Gi default, gp3 / managed-csi |
| `Job/migrate` | One-shot migration | image `ghcr.io/doable-me/doable-migrate:latest`; runs once per `kubectl apply`; api/ws have `initContainers` blocking on its completion |
| `Deployment/api` | Hono REST API | image `ghcr.io/doable-me/doable-api:latest`, 1+ replicas, resource asks 200m/512Mi |
| `Service/api` | ClusterIP api:4000 | type: ClusterIP |
| `PersistentVolumeClaim/api-projects` + `api-thumbnails` | Project files + screenshots | ReadWriteOnce or RWX if scaling api |
| `Deployment/ws` | Yjs WebSocket | image `ghcr.io/doable-me/doable-ws:latest`, 1+ replicas |
| `Service/ws` | ClusterIP ws:4001 | type: ClusterIP |
| `Deployment/web` | Next.js | image `ghcr.io/doable-me/doable-web:latest`, 1+ replicas |
| `Service/web` | ClusterIP web:3000 | type: ClusterIP |
| `Ingress/doable` | Route traffic | path `/` → web; `/api/*` → api; `/ws` → ws (with WebSocket headers); TLS via cert-manager-issued cert |

## Migrate-then-api ordering

Three options, in order of preference:

1. **InitContainer pattern (recommended)** — api and ws Deployments each
   have an initContainer that runs the migrate image. Kubelet runs init
   containers in sequence before the main containers; if they fail, the
   pod restarts. Idempotent.

   ```yaml
   spec:
     template:
       spec:
         initContainers:
           - name: migrate
             image: ghcr.io/doable-me/doable-migrate:latest
             env:
               - name: DATABASE_URL
                 valueFrom: { secretKeyRef: { name: doable-secrets, key: DATABASE_URL } }
         containers:
           - name: api
             image: ghcr.io/doable-me/doable-api:latest
             ...
   ```

2. **Separate `Job` resource** — cleaner separation, but adds the
   complication of "Job must complete before Deployment is applied".
   Solved with Helm post-install hook in Helm; in Kustomize you'd use a
   wave annotation if you have ArgoCD, otherwise `kubectl wait` between
   `kubectl apply -k` invocations.

3. **`kubectl apply -k base && kubectl wait --for=condition=complete
   job/migrate && kubectl rollout restart deployment/api deployment/ws`**
   — explicit ordering, but operator must run two commands.

Default `k8s/base/` uses option 1 (initContainer in api + ws). The
separate `migrate-job.yaml` is included for ops who prefer that path.

## Ingress

Default `k8s/base/ingress.yaml`:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: doable
  namespace: doable
  annotations:
    # nginx-ingress for WebSocket support
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    # cert-manager auto-issues Let's Encrypt cert
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
  tls:
    - hosts: [app.example.com]
      secretName: doable-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend: { service: { name: api, port: { number: 4000 } } }
          - path: /ws
            pathType: Prefix
            backend: { service: { name: ws, port: { number: 4001 } } }
          - path: /
            pathType: Prefix
            backend: { service: { name: web, port: { number: 3000 } } }
```

Operators on managed K8s (GKE / EKS / AKS) may swap in the platform's
preferred ingress (gke-ingress, aws-load-balancer-controller, AGIC). The
ingress definition is the most platform-specific piece — overlays/ exists
to let operators swap it out.

## Readiness/liveness probes

| Service | readinessProbe | livenessProbe |
|---|---|---|
| api | GET /health, port 4000, initialDelay 10s, period 10s | GET /health, period 30s |
| ws | TCP socket 4001, initialDelay 10s | TCP socket 4001, period 30s |
| web | GET /, port 3000, initialDelay 5s | GET /, period 30s |
| postgres | exec `pg_isready -U doable`, period 10s | same |
| migrate (Job) | n/a (one-shot) | n/a |

## Secret management

Three supported options, default = in-cluster Secret:

1. **In-cluster `Secret`** (default, simplest): operator fills
   `k8s/base/secret.example.yaml` → copies to `secret.yaml` (gitignored)
   → `kubectl apply`. Base64-encoded values. NOT encrypted at rest unless
   the cluster has KMS-encryption enabled.

2. **External Secrets Operator** (recommended for production): a
   `ClusterSecretStore` points at AWS Secrets Manager / GCP Secret
   Manager / HashiCorp Vault. The `ExternalSecret` resource pulls values
   into a synced Secret. Documented in `k8s/external-secrets-example.yaml`.

3. **sealed-secrets** (for GitOps without an external secret store):
   secrets encrypted with the cluster's public key, safe to commit.
   `kubeseal < secret.yaml > sealed-secret.yaml`. Documented in
   `k8s/sealed-secret-example.yaml`.

## Operator flow

```bash
kubectl create namespace doable

# Fill in secrets
cp k8s/base/secret.example.yaml k8s/base/secret.yaml
# edit secret.yaml with openssl rand -hex 32 outputs (base64-encoded for k8s)

# Apply
kubectl apply -k k8s/base/

# Wait for migrate to finish (option 2 path; option 1 path is automatic)
kubectl wait --for=condition=complete job/migrate -n doable --timeout=300s

# Check rollout
kubectl rollout status deployment/api -n doable
kubectl rollout status deployment/ws -n doable
kubectl rollout status deployment/web -n doable

# Get ingress IP
kubectl get ingress -n doable

# Visit https://app.example.com/auth/register
```

## Helm chart (follow-up, not in initial deliverable)

After the Kustomize base is validated against a real cluster (GKE Autopilot
+ EKS recommended), wrap it in a Helm chart at `charts/doable/`:

- `Chart.yaml`, `values.yaml`, `values.dev.yaml`, `values.prod.yaml`
- `templates/` mirroring the Kustomize base/
- Helm hooks for the migrate Job: `helm.sh/hook: pre-install,pre-upgrade`
- Publishable to artifacthub.io as `doable-me/doable`

The Helm chart is a separate PRD story (US-PRD-K8S-02 in a future round).

## Acceptance criteria

- [ ] `k8s/base/kustomization.yaml` validates: `kubectl kustomize k8s/base | kubectl apply --dry-run=client -f -` passes
- [ ] Apply to a kind cluster (or minikube) and all pods reach Ready
- [ ] `kubectl exec -it postgres-0 -- psql -U doable -c '\dx'` shows
      vector, pg_trgm, pgcrypto extensions
- [ ] Ingress with cert-manager + Let's Encrypt yields a valid TLS cert
      after ~60s
- [ ] First user registration via the Ingress URL succeeds
- [ ] `kubectl scale deployment/api --replicas=3 -n doable` works without
      errors (api code is stateless enough — verify api_projects PVC is
      ReadWriteMany if you scale)
