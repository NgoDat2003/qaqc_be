# Scenario 03: Scoring Engine Logic (The Brain)

## 1. Input Variables
- `base_score`: Default is 2 (for criteria group C/H/P/E).
- `max_score`: Default is 8.
- `num_errors`: User input (Number of errors found).
- `repeat_errors`: User input (Number of repeat errors).
- `is_risk`: Critical flag.
- `group_weight`: C (30%), H (15%), P (15%), E (40%).

## 2. Calculation Rules
### Level 1: Criteria Score (Điểm Tiêu chí)
- If `is_risk` is TRUE and `num_errors` > 0: **CRITERIA_SCORE = 0** and **AUDIT_FAILED = TRUE**.
- Else: `CRITERIA_SCORE = max_score - (base_score * num_errors)`.
- *Note:* `CRITERIA_SCORE` cannot be less than 0.

### Level 2: Group Score (Điểm Nhóm C/H/P/E)
- `GROUP_SCORE = (Sum of CRITERIA_SCORES in Group) / (Sum of MAX_SCORES in Group) * 100`.

### Level 3: Final Audit Score (Điểm Tổng)
- `FINAL_SCORE = (Group_C_Score * 30%) + (Group_H_Score * 15%) + (Group_P_Score * 15%) + (Group_E_Score * 40%)`.
- If `AUDIT_FAILED` is TRUE: `FINAL_SCORE = 0`.

## 3. Special Cases
- **CCP (Critical Control Point):** If CCP is ON, `num_errors` can still be entered, but the scoring behavior shouldn't reset when toggling.
- **Rounding:** Round to 2 decimal places.
