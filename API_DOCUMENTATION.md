# QualityOps Backend API Documentation

This document provides a comprehensive overview of all RESTful API endpoints available in the `qaqc-be` application.

## Authentication (`/api/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **POST** | `/api/auth/login` | Authenticate user and receive token |
| **POST** | `/api/auth/logout` | Invalidate current session |
| **GET**  | `/api/auth/me` | Get current authenticated user profile |

## Users & Roles (`/api/users`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/users` | List all users |
| **POST** | `/api/users` | Create a new user |
| **PATCH** | `/api/users/[id]` | Update user details |
| **PATCH** | `/api/users/[id]/toggle-active` | Activate/Deactivate a user |

## Organization
### Brands (`/api/brands`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/brands` | List all brands |
| **POST** | `/api/brands` | Create a new brand |
| **PATCH** | `/api/brands/[id]` | Update brand details |

### Stores (`/api/stores`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/stores` | List all stores |
| **POST** | `/api/stores` | Create a new store |
| **PATCH** | `/api/stores/[id]` | Update store details |
| **PATCH** | `/api/stores/[id]/assign-am` | Assign an Area Manager to a store |

## Criteria Library
### Criteria Groups (`/api/criteria-groups`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/criteria-groups` | List criteria groups |
| **POST** | `/api/criteria-groups` | Create criteria group |
| **PATCH** | `/api/criteria-groups/[id]` | Update criteria group |
| **DELETE**| `/api/criteria-groups/[id]` | Delete criteria group |

### Criteria Items (`/api/criteria`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/criteria` | List criteria items |
| **POST** | `/api/criteria` | Create criteria item |
| **PATCH** | `/api/criteria/[id]` | Update criteria item |
| **DELETE**| `/api/criteria/[id]` | Delete criteria item |

## Checklists (`/api/checklists`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/checklists` | List all checklists |
| **POST** | `/api/checklists` | Create a new checklist form |
| **GET** | `/api/checklists/[id]` | Get checklist details |
| **PATCH** | `/api/checklists/[id]` | Update checklist form |
| **PATCH** | `/api/checklists/[id]/archive` | Archive checklist |
| **POST** | `/api/checklists/[id]/publish` | Publish checklist |
| **POST** | `/api/checklists/[id]/sections` | Add a section to checklist |
| **POST** | `/api/checklists/[id]/sections/[sectionId]/items` | Add items to a section |

## Audit Planning (`/api/audit-plans`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/audit-plans` | List audit plans |
| **POST** | `/api/audit-plans` | Create a new audit plan |
| **GET** | `/api/audit-plans/[id]` | Get audit plan details |
| **PATCH** | `/api/audit-plans/[id]/close` | Close an audit plan |
| **GET** | `/api/audit-plans/my-assignments` | Get assignments for current user |

## Audit Execution (`/api/audits`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/audits` | List executed audits |
| **GET** | `/api/audits/[id]` | Get audit details |
| **GET** | `/api/audits/[id]/checklist` | Get the checklist specific to this audit |
| **POST** | `/api/audits/calculate` | Calculate audit score automatically |
| **PATCH** | `/api/audits/draft` | Save audit as draft |
| **POST** | `/api/audits/submit` | Submit completed audit |

## Action Plans (`/api/action-plans`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/action-plans` | List action plans |
| **GET** | `/api/action-plans/[id]` | Get action plan details |
| **PATCH** | `/api/action-plans/[id]` | Update action plan |
| **POST** | `/api/action-plans/[id]/confirm` | Confirm action plan implementation |
| **POST** | `/api/action-plans/[id]/close` | Close action plan (QAM only) |

## Utilities
### Analytics (`/api/analytics`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/analytics/overview` | Get dashboard overview statistics |

### Notifications (`/api/notifications`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **GET** | `/api/notifications` | Get user notifications |
| **PATCH** | `/api/notifications` | Mark notifications as read |

### File Upload (`/api/upload`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| **POST** | `/api/upload/evidence` | Upload evidence images/files |
