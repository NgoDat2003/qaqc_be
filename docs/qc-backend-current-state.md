# QC Backend Current State

## Tong Quan

Tai lieu nay tong hop trang thai hien tai cua luong `qc_auditor` de chu du an va FE cung doc mot ban la hieu:

- BE da mo xong loi thuc thi audit cho QC tren nhanh `dev`;
- FE da co du API de lam man QC audit execution;
- co mot vai diem BE van can tiep tuc xu ly truoc khi coi la san sang cho moi truong that.

## Pham Vi Da Hoan Thanh

| Nhom | Trang thai | Ghi chu |
|---|---|---|
| Mo bai audit tu assignment | Done | QC chi mo bai cua chinh minh |
| Luu nhap | Done | Draft dau tien chuyen assignment `pending -> in_progress` |
| Lich su loi theo tieu chi | Done | Tach thanh 1 API bundle nen de tranh 100 request le |
| Anh bang chung | Done | Upload anh, validate noi dung anh, attach vao violation |
| Submit audit | Done | BE tu tinh repeat, score, grade, group score |
| Auto Action Plan | Done | Co loi thi tu tao AP `draft` |
| Read-only sau submit | Done | QC khong sua lai bai sau submit |

## Nghiep Vu FE Can Hieu

1. QC khong duoc xem diem preview truoc khi submit.
2. QC khong gui `repeatCount`, `finalScore`, `grade`, `groupScores`.
3. Repeat do BE tu tinh theo `store + criteria` va chi dua tren audit da submit.
4. Lan lap thu 4 tu dong kich hoat CCP cho group; chu ky sau reset ve lan 1.
5. RISK lam diem toan bai ve `0` va grade thanh `alarm`.
6. Anh bang chung gan theo tung loi, khong phai theo toan bai.
7. Sau submit, man QC chi doc; neu can sua lai bai thi do la luong sau cua SM/QAM, khong phai QC.

## Luong Goi API FE Nen Dung

```txt
GET /api/audit-plans/my-assignments
        ->
GET /api/audits/assignments/:assignmentId
        ->
render man audit ngay
        ->
GET /api/audits/assignments/:assignmentId/history
        ->
cache historiesByCriteriaId
        ->
POST /api/upload/images
        ->
PATCH /api/audits/draft
        ->
POST /api/audits/submit
```

Ly do tach nhu tren:

- API mo bai can nhe de render nhanh;
- history goi nen mot lan cho toan checklist se sach hon so voi goi 1 lan / 1 tieu chi;
- khi user bam vao tieu chi, FE doc ngay tu cache da co.

## API FE Can Dung

| API | Muc dich | FE can luu y |
|---|---|---|
| `GET /api/audit-plans/my-assignments` | Lay viec cua QC hien tai | Chi hien bai da publish/open |
| `GET /api/audits/assignments/:assignmentId` | Mo/resume bai audit | Khong kem history bundle |
| `GET /api/audits/assignments/:assignmentId/history` | Lay full history cua checklist trong 1 request | Nen goi ngam sau khi man chinh render |
| `POST /api/upload/images` | Upload anh bang chung | Chi nhan JPEG/PNG/WEBP, toi da `5MB` |
| `PATCH /api/audits/draft` | Luu nhap | FE gui full danh sach violation hien tai |
| `POST /api/audits/submit` | Chot bai | Response moi tra score + repeat info |

## Contract Quan Trong

### Body draft/submit

```ts
type AuditWriteBody = {
  assignmentId: string
  violations: Array<{
    criteriaId: string
    numErrors: number
    note?: string | null
    imageIds?: string[]
  }>
}
```

### Response submit

```ts
type SubmitAuditResponse = {
  id: string
  finalScore: number
  grade: "excellent" | "good" | "pass" | "fail" | "alarm"
  isRiskTriggered: boolean
  repeatInfo: Array<{
    criteriaId: string
    numErrors: number
    repeatCount: number
    repeatLabel: "first" | "second" | "third" | "auto_ccp" | "reset"
    isCriticalTriggered: boolean
  }>
}
```

## Loi FE Nen Xu Ly Rieng

| HTTP | Message | Y nghia |
|---|---|---|
| `400` | `Completed assignment cannot be changed` | Bai da submit |
| `400` | `Submitted audit cannot be changed by QC` | QC dang co sua bai da chot |
| `400` | `Audit is outside the allowed audit window` | Chua toi ngay hoac da het han audit |
| `400` | `All criteria must belong to the assigned checklist` | FE gui sai tieu chi |
| `400` | `Some images are already attached elsewhere` | Anh khong thuoc bai dang thao tac |
| `400` | `Image content does not match the declared file type` | File gia dinh dang anh |
| `403` | `Assignment does not belong to current auditor` | QC mo viec khong phai cua minh |
| `409` | `Audit assignment changed while the request was in progress` | Request cu/stale, FE nen refetch session roi cap nhat lai man hinh |

## Trang Thai Kiem Thu

| Hang muc | Ket qua |
|---|---|
| Route/unit tests | `45/45` pass |
| Production build | Pass |
| Coverage moi them | concurrent draft/submit guard, upload extension an toan |

## Cac Diem BE Van Can Lam Tiep

### 1. Repeat co the stale neu hai bai cung cua hang submit cung luc

Hien tai BE da chan race tren cung mot assignment. Tuy nhien, neu co hai assignment khac nhau cung `store + criteria` submit gan nhu dong thoi, hai request van co the doc cung lich su cu va luu cung mot `repeatCount`.

Tac dong:

- chuoi lap `1 -> 2 -> 3 -> auto CCP` co the bi lech;
- day la loi nghiep vu, khong phai loi hien thi.

Huong xu ly BE:

- dua viec doc history + tinh repeat vao vung transaction co serialize phu hop;
- hoac khoa theo `store + criteria` truoc khi ghi ket qua.

FE impact:

- khong can doi contract;
- khong nen tu tinh repeat phia client.

### 2. File anh co the mo coi neu DB tao evidence that bai

BE da chong file gia `.html` doi lot anh. Nhung neu ghi file vat ly thanh cong ma `evidence.create()` that bai, file van co the nam lai tren disk ma khong co row DB.

Tac dong:

- ton dung luong;
- kho don dep ve sau.

Huong xu ly BE:

- rollback bang `unlink` neu tao evidence that bai;
- sau nay co the them job cleanup temp file neu can.

FE impact:

- khong can doi contract.

## Buoc Tiep Theo Sau QC

Thu tu hop ly tiep theo:

1. sua hai diem BE con no o tren;
2. mo role `store_manager`;
3. lam luong `SM gui yeu cau xem lai bai -> QAM reopen/update audit`;
4. sau do moi di tiep Action Plan va dashboard.

## Tai Lieu Lien Quan

- `docs/qc-fe-handoff.md`
- `plans/260518-qc-audit-execution-core/plan.md`
- `plans/260518-qc-audit-execution-core/reports/test-report.md`
- `docs/rebuild-status.md`
