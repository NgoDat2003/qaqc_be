# Scenario 09: Skill Mapping for Maycha QA/QC Platform

## Phase 1: Architectural Foundation
- **Data Modeling (SQL/Prisma):** Understanding relational data, foreign keys, and indexes.
- **RBAC Design:** Designing hierarchical permissions (CA -> QAM -> QC -> AM -> SM).
- **Project Structure:** Learning the "Feature-based" folder structure in Next.js.

## Phase 2: Business Logic (The Logic Engine)
- **TypeScript Fundamentals:** Using Types to ensure data integrity (e.g., preventing a string from entering a score field).
- **Algorithm Translation:** Converting BA formulas into robust code functions.
- **Test-Driven Thinking:** Learning to verify logic with Unit Tests.

## Phase 3: Frontend & Mobile UX
- **Tailwind CSS:** Building responsive, premium-looking UI without heavy CSS files.
- **Component Composition:** Creating reusable UI atoms (Buttons, Inputs) and molecules (Audit Cards).
- **Client-Side State:** Managing complex audit forms with many inputs and image uploads.

## Phase 4: Integration & Storage
- **Server Actions / API Routes:** Learning how Next.js communicates with the Database securely.
- **Cloud Storage Integration:** Handling file uploads (MinIO/S3/Supabase Storage).
- **Error Handling:** Building a resilient system that shows friendly errors instead of crashing.

## Phase 5: Reporting & Deployment
- **Aggregation Queries:** Learning to group and summarize data for dashboards.
- **CI/CD Basics:** Understanding how code goes from your machine to the Internet (Vercel/Docker).
