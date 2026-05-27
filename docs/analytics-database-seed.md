# Analytics Database Seed

Tai lieu nay mo ta bo du lieu lon dung de test dashboard, report, filter, top loi, top store, Action Plan status va performance tren Supabase dev.

## Muc Tieu

- Tao du lieu QA/QC demo lon, khong dung du lieu cong ty that.
- Giu master data quan trong, khong reset users/stores/brands/criteria/checklist khi chay mode reset analytics.
- Tao du lieu co phan bo nghiep vu de chart khong bi trong hoac qua dep.

## Lenh Chay

Append them du lieu analytics:

```bash
npm run seed:analytics
```

Reset rieng audit-domain roi tao lai analytics:

```bash
npm run seed:analytics:reset
```

Benchmark query thong ke va API list:

```bash
npm run benchmark:analytics
```

## Bien Moi Truong Tuy Chinh

| Bien | Mac dinh | Y nghia |
| --- | ---: | --- |
| `ANALYTICS_TARGET_STORES` | `800` | So cua hang toi thieu dung cho analytics |
| `ANALYTICS_TARGET_QC` | `30` | So QC auditor toi thieu |
| `ANALYTICS_TARGET_AM` | `45` | So AM toi thieu |
| `ANALYTICS_TARGET_QAM` | `6` | So QA manager toi thieu |
| `ANALYTICS_MONTHS` | `12` | So thang audit plan |
| `ANALYTICS_COMPLETION_RATE` | `0.9` | Ty le assignment da submit audit |
| `ANALYTICS_VIOLATION_RATE` | `0.55` | Ty le audit co loi |
| `ANALYTICS_ACTION_PLAN_RATE` | `0.45` | Ty le audit co loi tao AP |
| `ANALYTICS_USER_PASSWORD` | `Test@1234` | Password cho user demo tao them |

## Data Shape

Seed mac dinh tao:

- 12 audit plans theo thang.
- Moi plan gan cho tat ca store trong target.
- 90% assignment duoc submit audit.
- Mot nhom store diem thap co loi nhieu hon de dashboard co top/bottom ro.
- Risk criteria it hon normal/critical, nhung risk audit luon `finalScore = 0`, `grade = alarm`.
- Moi audit submitted co du `group_scores`.
- Audit co Action Plan se co item tuong ung moi violation.
- AP co status phan bo `draft`, `submitted`, `rejected`, `closed`.
- Notification demo cho Action Plan.
- Du lieu hien thi cho FE duoc chuan hoa tieng Viet: brand, store, dia chi, ten nguoi, ghi chu loi, nguyen nhan, huong khac phuc, notification va correction request.

## Luu Y

- Mode `reset-qaqc-analytics` chi xoa du lieu audit-domain: audit plan, assignment, audit, violation, group score, AP, AP item, evidence, correction request va notification lien quan.
- Script khong xoa criteria/checklist/brand/store/user hien co.
- Neu can dataset nho hon cho local, chay voi bien moi truong, vi du:

```bash
ANALYTICS_TARGET_STORES=120 ANALYTICS_MONTHS=6 npm run seed:analytics:reset
```

Tren Windows PowerShell:

```powershell
$env:ANALYTICS_TARGET_STORES="120"; $env:ANALYTICS_MONTHS="6"; npm run seed:analytics:reset
```

## Ket Qua Seed Hien Tai

Lan seed gan nhat chay voi:

```powershell
$env:ANALYTICS_TARGET_STORES="500"; npm run seed:analytics:reset
```

Ket qua:

| Bang | Rows |
| --- | ---: |
| `brands` | 5 |
| `stores` | 500 |
| `users` | 962 |
| `audit_plans` | 12 |
| `audit_assignments` | 6000 |
| `audits` | 5410 |
| `group_scores` | 21640 |
| `violations` | 12721 |
| `action_plans` | 2294 |
| `action_plan_items` | 9599 |
| `evidences` | 10393 |
| `audit_correction_requests` | 46 |
| `notifications` | 4588 |

Verify sau seed:

| Check | Ket qua |
| --- | ---: |
| Audit thieu group score | 0 |
| Action Plan item mismatch voi violation | 0 |
| Risk audit sai score/grade | 0 |

Benchmark sau seed:

| Query/API | Rows | Avg |
| --- | ---: | ---: |
| Monthly average score | 12 | ~312 ms |
| Top criteria by violations | 10 | ~299 ms |
| Bottom stores by score | 10 | ~212 ms |
| Action plan status counts | 4 | ~309 ms |
| API benchmark | - | skipped vi dev server khong chay luc do |

Ket luan: query aggregate truc tiep da du de lam dashboard. Cac API list audit/AP can toi uu shape, filter hoac pagination/cursor neu FE can render bang lon nhanh hon.
