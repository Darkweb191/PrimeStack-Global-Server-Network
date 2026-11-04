# PrimeStack Kubernetes baseline

This directory deploys the existing 14-service runtime to a Kubernetes namespace. PostgreSQL, Redis, and RabbitMQ are external managed services; this package does not deploy them or run database migrations. It is a secure starting point, not a complete production platform: configure network policies, cluster-level ingress/WAF, backups, monitoring, secret synchronization, and tested recovery procedures for the selected provider.

## Prerequisites

- A Kubernetes cluster with the `restricted` Pod Security Admission profile, an ingress controller, and metrics-server (for the API gateway HPA).
- Managed PostgreSQL with the service databases and least-privilege users already provisioned, plus migrations applied using the project's migration process.
- Managed Redis and RabbitMQ endpoints reachable from the cluster.
- `kubectl`, Docker, and registry credentials where required.

PostgreSQL clients require TLS with certificate verification (`PGSSLMODE=require`). The images use Node's trusted CA set. If the provider requires a custom CA, extend the workload with a read-only CA mount and `NODE_EXTRA_CA_CERTS`; do not disable certificate verification.

## Build images

From this directory, build all images with an immutable release tag:

```powershell
.\build-images.ps1 -Registry "registry.example.com" -Tag "REPLACE_WITH_RELEASE_OR_COMMIT_SHA"
```

Add `-Push` to publish the images. The terminal and ISO8583 gateway Dockerfiles use `services/` as their build context because they copy `services/shared`; the other images use service-local contexts.

Before deployment, update all 14 `images` entries in `kustomization.yaml`: set each `newName` to `<registry>/primestack/<image-name>` and each `newTag` to the same tag used for the build. Use a commit-SHA or release tag and enforce tag immutability in the registry. The committed registry and tag are deliberate placeholders.

## Configure environment-specific values

1. In `configmap.yaml`, replace `PGHOST` with the managed PostgreSQL hostname. Keep `PGSSLMODE: require`. Service URLs use Kubernetes ClusterIP DNS and should remain internal.
2. In `ingress.yaml`, set the cluster's `ingressClassName` and replace `api.primestack.example` with the API domain. Provision the referenced `primestack-api-tls` Secret in the `primestack` namespace before applying the ingress.
3. Create or synchronize a Kubernetes Secret named `primestack-runtime-secrets` in that namespace. Secret values must come from the organization's secrets manager; do not put live values in manifests, source control, command history, or deployment logs.

The secret must contain these keys (values are not included here):

| Key | Consumer / expected value |
| --- | --- |
| `ledger-db-password` | Password for PostgreSQL user `ledger_svc` |
| `ip-whitelist-db-password` | Password for `ipwl_svc` |
| `auth-db-password` | Password for `auth_svc` |
| `terminal-db-password` | Password for `terminal_svc` |
| `transfer-db-password` | Password for `transfer_svc` |
| `risk-db-password` | Password for `risk_svc` |
| `audit-db-password` | Password for `audit_svc` |
| `settlement-db-password` | Password for `settlement_svc` |
| `notification-db-password` | Password for `notification_svc` |
| `switch-db-password` | Password for `switch_svc` |
| `security-db-password` | Password for `security_svc` |
| `routing-db-password` | Password for `routing_svc` |
| `iso8583-db-password` | Password for `iso8583_svc` |
| `redis-url-ip-whitelist` | Complete Redis connection URL for the IP whitelist service |
| `redis-url-auth` | Complete Redis connection URL for the auth service |
| `redis-url-risk` | Complete Redis connection URL for the risk service |
| `rabbitmq-url-transfer` | Complete AMQP connection URL for the transfer service |
| `rabbitmq-url-audit` | Complete AMQP connection URL for the audit service |
| `auth-jwt-secret` | High-entropy JWT signing secret |
| `security-encryption-key` | A 64-character hexadecimal, 32-byte AES-256 key for the security service |

Connection URLs must use the managed services' TLS scheme/configuration where supported. The deployment intentionally requires every referenced key; a missing key prevents its workload from starting.

## Apply and check

After configuring the placeholders and provisioning external dependencies and secrets:

```powershell
kubectl apply -k .
kubectl -n primestack get deployments,services,ingress
kubectl -n primestack rollout status deployment/api-gateway
```

The API gateway is the only externally routed service. All other services use ClusterIP Services. `/health` probes indicate that the HTTP process is responding; they do not confirm database, Redis, RabbitMQ, or downstream-service readiness. Initially only the API gateway has an HPA and disruption budget. Other services stay at one replica until their state, load behavior, and throughput are tested.

## Operational limits

- No cloud provider, managed-service address, DNS name, ingress controller, or TLS certificate is assumed.
- No database migration Job is included. Provision databases/users and apply migrations before rolling out workloads.
- The manifests do not include service-mesh mTLS, network policies, WAF, multi-region failover, or backup/restore automation.
- The ISO8583 gateway keeps its existing `SKIP_CONNECTIONS=false` production behavior and attempts to load configured hosts from its database.
