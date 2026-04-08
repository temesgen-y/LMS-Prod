# Security Strategy Documentation

## 1. Access Tokens (JWT)

- **Lifetime:** 5–15 minutes (configurable).
- **Signing:** RS256 (asymmetric) or HS256 with strong secret; issuer and audience validated.
- **Claims:** sub (user_id), roles, tenant_id, exp, iat, iss, aud.
- **Validation:** Signature, exp, iss, aud on every request; no sensitive data in payload.
- **Storage (frontend):** Prefer httpOnly cookie for access token, or memory-only; avoid long-lived localStorage for access token.

## 2. Refresh Tokens

- **Storage:** Hashed (e.g. SHA-256) in DB; never store plaintext.
- **Rotation:** New refresh token issued on every refresh; old one revoked; same family_id for detection of reuse.
- **Reuse detection:** If old refresh token is used after rotation, revoke entire family (possible theft).
- **Lifetime:** Configurable (e.g. 7–30 days); revocable on logout or admin action.
- **Binding:** Optional device/fingerprint or IP binding for high-security environments.

## 3. OAuth 2.0 / OpenID Connect (SSO)

- **PKCE:** Required for public clients (SPA); code_verifier/code_challenge in authorization and token exchange.
- **State:** Random state parameter; validate on callback to prevent CSRF.
- **Redirect URI:** Strict allowlist; exact match (no wildcard for production).
- **Scopes:** Request only openid, profile, email (or minimal set); store only necessary claims.
- **Token handling:** Exchange code server-side (backend); never expose client_secret in frontend.

## 4. RBAC

- **Backend:** Every protected route guarded by JWT + permission/role check; no trust of frontend-only checks.
- **Resource-level:** Verify ownership or enrollment (e.g. course, assignment) in service layer.
- **Principle of least privilege:** Default deny; grant minimum permissions per role.

## 5. Rate Limiting

- **Global:** Per-IP and per-user (by JWT sub) limits on API.
- **Auth endpoints:** Stricter limits on /auth/login, /auth/oauth/callback, /auth/refresh, password reset.
- **Implementation:** Redis-backed sliding window or token bucket; return 429 with Retry-After.

## 6. CSRF Protection

- **SameSite:** Cookies with SameSite=Strict or Lax.
- **CSRF token:** For state-changing operations if using cookie-based session/token; validate on server.
- **OAuth:** State parameter for redirect flow.

## 7. Input Validation & Sanitization

- **DTOs:** class-validator on all request bodies; whitelist allowed fields.
- **Rich text:** Sanitize HTML (e.g. DOMPurify or server-side library) before store/display.
- **SQL:** Parameterized queries only; no string concatenation for SQL.
- **File upload:** Validate type, size, and scan for malware; store outside web root with safe names.

## 8. Password Storage (If Local Auth)

- **Hashing:** bcrypt (cost ≥ 12) or argon2id; never plaintext or reversible encryption.
- **Policies:** Minimum length, complexity; optional breach check.

## 9. HTTP Security Headers

- **Strict-Transport-Security (HSTS):** max-age; includeSubDomains.
- **X-Content-Type-Options:** nosniff.
- **X-Frame-Options:** DENY or SAMEORIGIN.
- **Content-Security-Policy:** Restrict scripts, styles, and sources.
- **Referrer-Policy:** strict-origin-when-cross-origin or stricter.
- **Permissions-Policy:** Restrict camera, microphone, etc., as needed.

## 10. Audit Logging

- **Events:** Login, logout, role/permission change, grade change, sensitive data access, failed auth.
- **Fields:** user_id, action, resource, resource_id, ip, user_agent, timestamp; optional meta (jsonb).
- **Retention:** Per policy; consider partitioning and archival for large volumes.
- **Integrity:** Optional signing or append-only store for high-assurance environments.

## 11. Secrets Management

- **Storage:** Environment variables or secret manager (e.g. AWS Secrets Manager, HashiCorp Vault); never in repo.
- **Rotation:** Key rotation policy for JWT signing keys and OAuth client secrets; support multiple valid keys during rotation.
- **Least privilege:** DB and API credentials with minimal required permissions.

## 12. Dependency & Supply Chain

- **Scanning:** Regular dependency scans (e.g. npm audit, Snyk); fix or mitigate known vulnerabilities.
- **Pinning:** Lockfile and pinned versions in production; review updates before upgrade.

This strategy aligns with the authentication flow (OAuth/OpenID Connect, JWT, refresh token rotation) and RBAC design described in the system design document.
