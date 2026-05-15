# Admin API Intake

## Muc Dich

Tai lieu nay la khung de FE cung cap dung nhu cau cho luong `company_admin` truoc khi BE bat dau implement lai.

## 1. Danh Sach Man Hinh

| Man hinh | Muc dich | Ghi chu |
|---|---|---|
|  |  |  |

## 2. API Can Cho Tung Man

| Man hinh | Hanh dong | API mong muon | Ghi chu |
|---|---|---|---|
|  | list / detail / create / update / toggle / lookup |  |  |

## 3. Bang Va Picker

| Man hinh | Cot can hien thi | Search | Filter | Sort | Pagination |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## 4. Form Tao Va Sua

| Entity | Field | Bat buoc | Chi doc | Gia tri mac dinh | Ghi chu validation |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

## 5. Relation Can Hien Thi

Ghi ro field nao FE can de tranh hien raw id:

| Entity | Relation | Field can tra ve |
|---|---|---|
| user | roleAssignments.store | `id`, `code`, `name` |
| store | brand | `id`, `code`, `name` |
| store | am | `id`, `fullName` |
| store | manager | `id`, `fullName` |

## 6. Sau Mutation FE Can Cap Nhat Gi Ngay

| Hanh dong | FE can response tra ve gi de cap nhat UI ngay |
|---|---|
| Tao moi |  |
| Cap nhat |  |
| Bat/tat trang thai |  |

## 7. Cau Hoi Can Chot Truoc Khi BE Lam

1. Admin co bao nhieu man hinh that su?
2. Man nao can list API, man nao chi can lookup API?
3. FE muon mo detail bang drawer, modal, hay page rieng?
4. Cac bang co can search/filter/sort o server khong?
5. Field nao bat buoc phai thay ngay tren list?
6. Sau create/update, FE muon refetch hay dung response de cap nhat state ngay?

## 8. Dieu Kien Du De Bat Dau BE

BE chi bat dau chot API contract khi:

1. Tat ca man Admin da duoc liet ke.
2. Moi man da co action can ho tro.
3. Field hien thi cua table/picker/detail da ro.
4. Validation toi thieu da ro.
5. FE da chi ra response nao can dung ngay sau mutation.
