---
title: "QC Audit Execution Core - Test Report"
created: "2026-05-18"
status: "passed"
---

# QC Audit Execution Core - Test Report

## Tom Tat

Task QC core da duoc kiem tra bang route/unit tests hien co va production build.

| Hang muc | Ket qua |
|---|---|
| Route/unit tests | Pass |
| Tong so test | `45/45` |
| Production build | Pass |
| Prisma schema validate | Pass |

## Phan Da Duoc Kiem Tra

| Nhom | Coverage chinh |
|---|---|
| Scoring | deduction thuong, critical group zero, risk alarm |
| Audit session | chi tra du lieu co ban, khong keo history bundle |
| History bundle | mot request gom nhieu criteria, tra repeat ke tiep va anh lich su |
| Draft | draft dau tien tao audit va doi assignment sang `in_progress` |
| Submit | repeat lan 4 auto CCP, tu tao Action Plan `draft` |
| Concurrency guard | request stale khi draft/submit tra `409` thay vi ghi lech du lieu |
| Upload security | file ten gia `.html` van chi duoc luu bang extension anh hop le |
| Regression | toan bo test cu cua Admin + QAM van pass |

## Khoang Trong Con Lai

- Chua benchmark voi du lieu that lon cho history bundle.
- Chua trien khai luong `SM yeu cau -> QAM reopen/update audit`.
- Chua co integration test chay truc tiep voi database that cho transaction submit.
- Chua co integration test bao phu truong hop hai audit khac nhau cua cung `store + criteria` submit dong thoi.

## Ket Luan

Loi QC hien da du de FE bat dau man thuc thi audit:

- mo bai;
- tai history bundle nen;
- luu nhap;
- dinh anh;
- submit;
- nhan ket qua scoring va AP tu sinh.
