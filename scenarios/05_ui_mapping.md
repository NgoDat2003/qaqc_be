# Scenario 05: UI/UX Component Mapping

## 1. Global Components (Clone Styles)
- **Sidebar**: Brand logo, Navigation menu (RBAC filtered).
- **Header**: User info, Notifications, Breadcrumbs.
- **Form Elements**: Search with debounce, Date Range picker, Select with search.

## 2. Page Specific Components
### A. Dashboard / Stores
- **Store Card**: Visual status of last audit, basic info.
- **Area Grid**: Grouping stores by region.

### B. Audit Performance (Mobile Experience)
- **Assessment List**: Accordion style grouping by C/H/P/E.
- **Criteria Item**:
    - Pass/Fail toggle buttons.
    - Error counter (+/-).
    - Photo upload button with preview thumbnails.
    - Note text area (expandable).
- **Progress Bar**: Sticky header showing current score live calculation.

### C. Action Plan
- **Status Timeline**: Steps of the remediation.
- **Compare Plate**: Photo BEFORE (Audit) vs AFTER (Fixed).
