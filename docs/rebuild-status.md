# Rebuild Status

## Trang Thai Hien Tai

- Nhanh hien tai: `dev`
- Baseline: `main`
- Huong moi: lam lai theo role-first
- Role dang chuan bi: `store_manager`
- Database: giu nguyen, khong reset / truncate / reseed
- Source tren `dev`: don ve skeleton toi thieu, chi giu ha tang nen va auth

## Dieu Dang Cho

Admin core va QAM foundation da hoan thanh tren nhanh `dev`.

QC Audit Execution Core da hoan thanh: mo bai audit, luu draft, history bundle, anh bang chung, scoring va submit.

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
2. QAM Foundation: done.
3. QC audit execution + scoring: done.
4. Tiep theo: store manager + luong yeu cau xem lai bai / action plan.
