# Admin CRUD Business Review

## Kết Luận

Admin API hiện tại **đủ để FE dựng màn Admin MVP**:

- đăng nhập / lấy session / đăng xuất
- xem danh sách brand / store / user
- tạo và cập nhật brand
- tạo, xem chi tiết, cập nhật store
- gán AM cho store
- tạo user
- cập nhật thông tin cơ bản user
- bật / tắt user
- response đã có display fields để FE không phải hiển thị ID thô

Nhưng nếu xét theo nghĩa **CRUD Admin đúng nghiệp vụ đầy đủ**, hiện tại **chưa đủ 100%**. Các thiếu sót chính nằm ở quản lý role/scope của user và một số guard dữ liệu nền.

## Ma Trận Endpoint Hiện Có

| Nhóm | Endpoint | Trạng thái | Đánh giá |
|---|---|---|---|
| Auth | `POST /api/auth/login` | Đã có | Đúng MVP, có chặn inactive |
| Auth | `GET /api/auth/me` | Đã có | Đúng MVP |
| Auth | `POST /api/auth/logout` | Đã có | Đúng MVP |
| Brand | `GET /api/brands` | Đã có | Đủ cho list/picker |
| Brand | `POST /api/brands` | Đã có | Có unique code/name |
| Brand | `PATCH /api/brands/[id]` | Đã có | Không cho sửa code, đúng |
| Brand | `GET /api/brands/[id]` | Chưa có | Không bắt buộc nếu FE không có drawer brand |
| Store | `GET /api/stores` | Đã có | Có display `brand/am/manager`, đúng FE |
| Store | `GET /api/stores/[id]` | Đã có | Đủ detail hiện tại |
| Store | `POST /api/stores` | Đã có | Có validate brand/model, AM, manager role |
| Store | `PATCH /api/stores/[id]` | Đã có | Có validate brand/model, AM, manager role |
| Store | `PATCH /api/stores/[id]/assign-am` | Đã có | Đúng thao tác nhanh |
| User | `GET /api/users` | Đã có | Có role + store display |
| User | `GET /api/users?role=...` | Đã có | Đủ cho dropdown |
| User | `POST /api/users` | Đã có | Có hash password, role assignments |
| User | `PATCH /api/users/[id]` | Có một phần | Chỉ update `fullName/phone`, chưa update role/scope |
| User | `PATCH /api/users/[id]/toggle-active` | Đã có | Cần thêm guard chống tự khóa/khóa admin cuối |

## Đúng Nghiệp Vụ Hiện Tại

| Rule | Trạng thái | Ghi chú |
|---|---|---|
| Chỉ `company_admin` được mutate admin data | Đạt | Brand/store/user mutations đều yêu cầu company_admin |
| `qa_manager` chỉ xem list/detail Admin | Đạt | `GET` cho brand/store/user cho phép QAM |
| Brand code uppercase khi tạo | Đạt | `brandCreateSchema` transform uppercase |
| Brand code không sửa sau khi tạo | Đạt | PATCH brand không nhận code |
| Brand code/name unique | Đạt | Có check trước create/update |
| Store code uppercase khi tạo | Đạt | `storeCreateSchema` transform uppercase |
| Store code unique | Đạt | Có check create |
| `standard` không dùng brand `CLOUD` | Đạt | Có validate create/update |
| `cloud_kitchen` bắt buộc dùng brand `CLOUD` | Đạt | Có validate create/update |
| `amId` phải là user role `am` | Đạt một phần | Chưa chặn inactive AM |
| `managerId` phải là user role `store_manager` | Đạt một phần | Chưa chặn inactive SM |
| User không trả password | Đạt | DTO không select password |
| User create cần role | Đạt | Zod min(1) |
| Role `store_manager` cần `storeId` | Đạt một phần | Có yêu cầu storeId, nhưng chưa verify store tồn tại |
| Response không hiện ID thô thay label | Đạt phần lớn | Store/user đã có display fields |

## Gaps Cần Sửa Trước Khi Chốt Admin 100%

### P0 - Bắt Buộc Sửa

| Gap | Ảnh hưởng | Cách xử lý đề xuất |
|---|---|---|
| User update chưa quản lý role assignments | Admin không sửa được role/scope sau khi tạo user | Mở rộng `PATCH /api/users/[id]` nhận `roleAssignments` và replace trong transaction |
| `roleAssignments[].storeId` chưa validate store tồn tại | Có thể lưu scope trỏ tới store không tồn tại vì schema không có FK | Khi create/update user, kiểm tra mọi `storeId` tồn tại trước khi ghi |
| Store update/create có thể assign inactive AM/SM | Admin có thể gán người đã bị tắt tài khoản vào store | `userHasRole` nên check thêm `user.isActive = true` hoặc tạo helper mới |
| Store mutation không invalidate users cache | Nếu đổi tên/code store, `roleAssignments[].store` trong users cache có thể stale | Store create/update/assign nên invalidate thêm `users:` |

### P1 - Nên Sửa

| Gap | Ảnh hưởng | Cách xử lý đề xuất |
|---|---|---|
| Không có `GET /api/brands/[id]` | Nếu FE có drawer/detail brand sẽ thiếu endpoint | Thêm endpoint detail hoặc xác nhận FE chỉ dùng list |
| Toggle active có thể tắt chính mình | Admin có thể tự khóa session đang dùng | Chặn self-disable bằng `x-user-id` |
| Toggle active có thể tắt company_admin cuối cùng | Có thể làm hệ thống không còn admin | Trước khi disable admin, kiểm tra còn admin active khác |
| User create không kiểm tra store scope theo role ngoài SM | Nếu sau này AM cũng cần scope role assignment sẽ thiếu | Chốt mô hình: AM scope qua `Store.amId` hay `RoleAssignment.storeId` |
| Không có reset password | Admin không xử lý được user quên mật khẩu | Thêm endpoint riêng sau khi FE cần |

### P2 - Có Thể Để Sau

| Gap | Ảnh hưởng | Ghi chú |
|---|---|---|
| Không có DELETE | Đúng hiện tại vì dùng soft active/inactive |
| Không có province/ward master | Hiện dùng text field, chấp nhận được cho Admin MVP |
| Không có avatar/logo/upload | Ngoài scope Admin foundation |

## Đề Xuất Plan Sửa Tiếp Theo

### Phase 1 - User Role Assignment Update

Mục tiêu: Admin có thể chỉnh role và store scope của user sau khi tạo.

Thay đổi:

- Mở rộng `userUpdateSchema`:
  - `fullName?: string`
  - `phone?: string | null`
  - `roleAssignments?: Array<{ roleKey: RoleKey; storeId?: string }>`
- Nếu có `roleAssignments`, update trong transaction:
  1. validate không duplicate role
  2. validate `store_manager` có `storeId`
  3. validate mọi `storeId` tồn tại
  4. delete role assignments cũ
  5. create role assignments mới
  6. trả user hydrated
- Invalidate `users:`

Test bắt buộc:

- update user đổi role thành `am`
- update user thêm `store_manager` thiếu `storeId` bị 400
- update user với `storeId` không tồn tại bị 400
- response có `roleAssignments[].store`

### Phase 2 - Active User Guards

Mục tiêu: Không gán inactive user vào store, không tự khóa hệ thống.

Thay đổi:

- Tạo helper `activeUserHasRole(userId, roleKey)`.
- Store create/update/assign-am chỉ nhận active AM/SM.
- `toggle-active`:
  - chặn self-disable
  - nếu user có role `company_admin`, chặn disable khi không còn active admin khác

Test bắt buộc:

- assign inactive AM bị 400
- assign inactive SM bị 400
- self-disable bị 400 hoặc 403
- disable admin cuối bị 400

### Phase 3 - Cache & Detail Polish

Mục tiêu: Data hydrate không stale và FE có đủ endpoint detail nếu cần.

Thay đổi:

- Store create/update/assign invalidate `stores:`, `brands:`, `users:`.
- Thêm `GET /api/brands/[id]` nếu FE cần brand drawer.
- Cập nhật docs FE handoff.

Test bắt buộc:

- sau store update, users cache bị invalidated
- brand detail 404 khi không tồn tại
- brand detail trả đúng shape nếu thêm endpoint

## Definition Of Done Cho Admin CRUD

Admin CRUD chỉ nên coi là hoàn tất khi:

1. FE có thể tạo/sửa brand/store/user không cần workaround.
2. Admin có thể sửa role và store scope của user sau khi tạo.
3. Không thể tạo role assignment trỏ tới store không tồn tại.
4. Không thể gán inactive AM/SM vào store.
5. Không thể tự khóa admin hiện tại hoặc khóa admin cuối cùng.
6. Response list/detail/mutation đều có display fields, không ép FE hiện ID thô.
7. Test route-level cover đủ P0/P1.
8. `npm run test` và `npm run build` pass.

## Kết Luận Cuối

Trạng thái sau hardening:

- Đã cho phép update role assignments trong `PATCH /api/users/[id]`.
- Đã validate `storeId` trong role assignment phải tồn tại.
- Đã chặn assign inactive AM/SM vào store.
- Đã chặn self-disable.
- Đã chặn disable `company_admin` active cuối cùng.
- Đã bổ sung cache invalidation `users:` khi store mutation có thể làm stale store display trong user role assignments.

Trạng thái hiện tại: **Admin CRUD core có thể coi là đủ để FE triển khai Admin flow**, trừ các phần ngoài scope như delete/reset password/province master.
