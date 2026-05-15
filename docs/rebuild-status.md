# Rebuild Status

## Trang Thai Hien Tai

- Nhanh hien tai: `dev`
- Baseline: `main`
- Huong moi: lam lai theo role-first
- Role dang chuan bi: `company_admin`
- Database: giu nguyen, khong reset / truncate / reseed
- Source tren `dev`: don ve skeleton toi thieu, chi giu ha tang nen va auth

## Dieu Dang Cho

BE dang cho tai lieu API/flow Admin tu FE truoc khi implement lai.

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

1. Chot contract Admin.
2. Chot test matrix Admin.
3. Chot endpoint nao giu, endpoint nao sua, endpoint nao bo.
4. Implement luong Admin.
5. Handoff lai FE.
6. Chi khi Admin dat DoD moi mo sang `qa_manager`.
