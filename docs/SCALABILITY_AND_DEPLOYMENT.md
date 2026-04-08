# Scalability & Deployment Readiness

## Scalability Considerations

### Horizontal Scaling

- **API:** Stateless NestJS instances behind load balancer; no in-memory session state.
- **Session/Refresh:** Stored in PostgreSQL (and optionally Redis); shared across instances.
- **WebSocket:** Sticky sessions or Redis pub/sub for cross-instance notification broadcast.

### Database

- **Connection pooling:** PgBouncer or built-in pool; tune max connections per instance.
- **Read replicas:** Use for reporting, analytics, and read-heavy endpoints; write to primary.
- **Indexing:** Indexes on FKs, (user_id, course_id), (assignment_id, user_id), and time-based queries.
- **Partitioning:** Partition audit_logs by created_at (e.g. monthly) for very large volumes.
- **Migrations:** Run as part of deployment or separate job; backward-compatible changes; rollback plan.

### Caching

- **Redis:** Permission checks, course catalog, hot reads; cache invalidation on write.
- **TTL:** Short TTL for permissions; longer for catalog; invalidate on update.

### Async & Queues

- **Message queue (e.g. Bull/Redis):** Notifications, emails, heavy jobs to keep HTTP latency low.
- **Event bus (optional):** For future microservices extraction (e.g. enrollment events, grade events).

### Multi-Tenancy

- **Tenant id:** In JWT and DB (users, courses); row-level filtering or schema-per-tenant.
- **Isolation:** Per-tenant data isolation; shared infra with tenant_id in all queries.

---

## Deployment Readiness Recommendations

### Containers

- **Dockerfile:** NestJS API (Node 20 LTS); Next.js (standalone output) for frontend.
- **docker-compose:** Local dev: API + PostgreSQL + Redis; optional frontend dev server.

### Orchestration

- **Kubernetes (or equivalent):** Deploy API and frontend; secrets and config from vault or K8s secrets.
- **Health checks:** `/health` (liveness), `/ready` (readiness: DB + Redis).
- **Scaling:** HPA based on CPU/memory or request rate.

### CI/CD

- **Build:** Install deps, lint, type-check, unit tests.
- **Integration:** Run integration tests against test DB; optional E2E.
- **Deploy:** Build images, run migrations, deploy to staging then production.
- **Gates:** Security scans (dependency, container); lint and test must pass.

### Observability

- **Logging:** Structured (JSON); correlation id; log level by env.
- **Metrics:** Request rate, latency (p50, p95, p99), error rate; expose /metrics (Prometheus).
- **Tracing:** Optional distributed tracing (e.g. OpenTelemetry).
- **Alerts:** Error rate, latency, DB connections, disk usage.

### Feature Flags

- **SSO rollout:** Feature flag for Microsoft SSO vs local auth.
- **Major features:** Stored in config or feature-flag service; no code deploy for toggles.

### Rollback

- **Migrations:** Backward-compatible schema; deploy new code first, then migrate; rollback = revert code + optional migration rollback.
- **Secrets:** Rotate without downtime (e.g. multiple valid JWT signing keys during rotation).

This aligns with the high-level architecture and non-functional requirements in the system design document.
