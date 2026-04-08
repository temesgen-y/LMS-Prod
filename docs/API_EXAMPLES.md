# API Structure Examples

**Base URL:** `https://api.<tenant>.lms.example/v1`  
**Auth:** `Authorization: Bearer <accessToken>`  
**Content-Type:** `application/json`

## Authentication

### POST /auth/oauth/callback

Exchange OAuth authorization code for tokens (OpenID Connect / Microsoft).

**Request:**

```json
{
  "code": "authorization_code_from_redirect",
  "redirectUri": "https://app.lms.example/auth/callback",
  "codeVerifier": "pkce_code_verifier"
}
```

**Response (200):**

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "rt_...",
    "expiresIn": 900,
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Jane Doe",
      "roles": ["Student"]
    }
  }
}
```

### POST /auth/refresh

Rotate refresh token and return new access token.

**Request:**

```json
{
  "refreshToken": "rt_..."
}
```

**Response (200):** Same shape as above (new accessToken, new refreshToken, expiresIn, optional user).

### POST /auth/logout

Revoke refresh token.

**Request:**

```json
{
  "refreshToken": "rt_..."
}
```

**Response (204):** No content.

---

## Users

### GET /users/me

Current user profile. **Auth:** JWT.

**Response (200):**

```json
{
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Jane Doe",
    "avatarUrl": null,
    "roles": ["Student"],
    "createdAt": "2025-02-15T00:00:00Z"
  }
}
```

---

## Courses

### GET /courses

List courses (filtered by role/enrollment). **Auth:** JWT. **Permissions:** course:read (or enrolled).

**Query:** `page`, `limit`, `status`, `search`.

**Response (200):**

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Introduction to Computer Science",
      "slug": "intro-cs",
      "description": "...",
      "status": "published",
      "createdAt": "2025-02-15T00:00:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 42 }
}
```

### GET /courses/:id

Course detail. **Auth:** JWT. **Permissions:** course:read (or enrolled).

**Response (200):** Single course object (with modules/lessons if needed).

### POST /courses

Create course. **Auth:** JWT. **Permissions:** course:create.

**Request:** DTO with title, description, status (class-validator).

**Response (201):** Created course object.

---

## Enrollments

### POST /enrollments

Enroll user in course. **Auth:** JWT. **Permissions:** enrollment:create (or self-enroll if allowed).

**Request:**

```json
{
  "userId": "uuid",
  "courseId": "uuid"
}
```

**Response (201):** Enrollment object.

### GET /courses/:id/enrollments

List enrollments for course. **Auth:** JWT. **Permissions:** course:read (instructor) or enrollment:read.

**Response (200):** Array of enrollments with user summary.

---

## Assignments & Submissions

### GET /assignments

List assignments (query by courseId). **Auth:** JWT.

**Response (200):** Array of assignments with meta.

### POST /assignments/:id/submissions

Create or update submission. **Auth:** JWT.

**Request:** DTO (e.g. content, attachments).

**Response (201):** Submission object.

### PUT /submissions/:id/grade

Set grade. **Auth:** JWT. **Permissions:** grade:write.

**Request:**

```json
{
  "score": 85,
  "feedback": "Well done."
}
```

**Response (200):** Grade object.

---

## Gradebook

### GET /gradebook/courses/:courseId

Gradebook view for course. **Auth:** JWT. **Permissions:** grade:read.

**Response (200):** Rows (user, enrollments, assignments, grades).

---

## Discussions

### GET /discussions

List discussions (query by courseId). **Auth:** JWT.

**Response (200):** Array of discussions with meta.

### POST /discussions/:id/comments

Add comment. **Auth:** JWT.

**Request:** `{ "body": "..." }`.

**Response (201):** Comment object.

---

## Notifications

### GET /notifications

User notifications. **Auth:** JWT.

**Query:** `unreadOnly`, `page`, `limit`.

**Response (200):** Array of notifications with meta.

### PATCH /notifications/:id/read

Mark as read. **Auth:** JWT.

**Response (200):** Updated notification.

---

## Audit

### GET /audit-logs

Query audit logs (admin). **Auth:** JWT. **Permissions:** audit:read.

**Query:** `userId`, `resource`, `action`, `from`, `to`, `page`, `limit`.

**Response (200):** Array of audit_logs with meta.

---

## Global Error Response

**4xx/5xx:** Handled by global exception filter.

```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Insufficient permissions",
  "timestamp": "2025-02-15T12:00:00Z"
}
```

All DTOs use class-validator; validation errors return 400 with field-level messages.
