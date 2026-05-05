# Scenario 04: Production-Grade API Contracts (Granular Specification)

## 1. Auth & Identity Cluster
- `POST /api/auth/login`: Email/Pass login.
- `POST /api/auth/logout`: End session.
- `GET  /api/auth/check`: Verify session valid (Used for Middleware).
- `GET  /api/profile/me`: Detailed user info, permissions, and scope context.
- `PATCH /api/profile/update`: Update name, phone, or preferences.
- `PATCH /api/profile/password`: Security credential update.
- `POST /api/profile/avatar`: Upload and set avatar image.

## 2. Organization Cluster (Admin/AM)
- `GET   /api/org/brands`: List brands.
- `POST  /api/org/brands`: Create new brand.
- `GET   /api/org/areas`: List geographic areas.
- `GET   /api/org/stores`: Paginated list of stores with filters (Brand, Area, Status).
- `GET   /api/org/stores/:id`: Detailed store info + historical score chart.
- `POST  /api/org/stores`: Create/Import stores (Bulk support).
- `PATCH /api/org/stores/:id`: Update store details.

## 3. Assessment Config Cluster (QA Manager)
- `GET/POST /api/qa/categories`: Manage groups (C/H/P/E) and weights default.
- `GET/POST /api/qa/criteria`: Master library of scoring questions.
- `GET/POST /api/qa/checklists`: Checklist header and group weights.
- `GET      /api/qa/checklists/:id/criteria`: View linked criteria for a checklist.
- `POST     /api/qa/checklists/:id/criteria`: Link multiple criteria to a checklist.
- `POST     /api/qa/checklists/duplicate/:id`: Clone checklist to new draft version.
- `PATCH    /api/qa/checklists/:id/publish`: Mark as active (locks criteria).

## 4. Execution Cluster (QC Auditor)
- `GET  /api/execution/plans`: List audit plans relevant to user.
- `GET  /api/execution/assignments`: List assigned stores for audit in a plan.
- `POST /api/execution/audit/start`: Initialize audit session (Track start time).
- `GET  /api/execution/audit/form/:id`: Dynamic form fetch based on plan's checklist.
- `PATCH /api/execution/audit/save-draft`: Partial results save (Auto-save/Manual).
- `POST /api/execution/audit/submit`: Final submission. Triggers scoring algorithm and Action Plan creation.

## 5. Remediation & Action Plan Cluster (SM/QA)
- `GET   /api/remediation/list`: Filterable list of action plans by Status.
- `GET   /api/remediation/:id`: Detail of a specific Action Plan with audit context.
- `PATCH /api/remediation/item/:id`: SM updates root cause, solution, and evidence image.
- `POST  /api/remediation/item/:id/comment`: Discussion between SM and QA on a specific error.
- `PATCH /api/remediation/close/:id`: QA Manager approves and closes the task.

## 6. Analytics & Export Cluster
- `GET /api/stats/dashboard`: High-level metrics for dashboard (Avg Score, Pass Rate).
- `GET /api/stats/top-issues`: Aggregated most frequent errors.
- `GET /api/stats/store-ranking`: Leaderboard of best/worst stores.
- `GET /api/stats/trend`: Time-series score changes.
- `POST /api/export/excel`: Bulk export audit data.
- `GET  /api/export/pdf/:auditId`: Single audit report PDF generation.

## 7. Notifications
- `GET   /api/notifications`: List of alerts (New audit, AP completed, AP rejected).
- `PATCH /api/notifications/read-all`: Mark all as read.
