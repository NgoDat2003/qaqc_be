# Rebuild Status

## Trang Thai Hien Tai

- Nhanh hien tai: `dev`
- Baseline: `main`
- Huong moi: lam lai theo role-first
- Role dang chuan bi: `qa_manager`
- Database: giu nguyen, khong reset / truncate / reseed
- Source tren `dev`: don ve skeleton toi thieu, chi giu ha tang nen va auth

## Dieu Dang Cho

Admin core da hoan thanh tren nhanh `dev`.

BE dang mo tiep QAM Foundation: criteria group, criteria, checklist builder, audit plan va QC my assignments.

Tai lieu dau vao can dung mau:

- `docs/admin-api-intake.md`

## Cai Gi Tam Dung

- Cac plan cu ve audit, AP, RBAC, pagination, performance
- Viec toi uu API sau
- Viec mo rong sang role tiep theo
- Cac route nghiep vu cu va CRUD Admin cu tren `dev`

Nhung tai lieu cu van duoc giu lai de tham khao lich su, khong con la backlog chinh cho dot rebuild nay.

## Skeleton Dang Giu Lai

- Prisma schema / client
- auth
- middleware
- response helper
- RBAC helper
- khung Next.js

Nhung module khac se duoc dua lai vao source khi co tai lieu FE va role tuong ung duoc mo.

## Thu Tu Sau Khi Co Tai Lieu FE

1. Admin core: done.
2. QAM Foundation: dang implement.
3. Sau QAM Foundation moi mo QC audit execution + scoring.
