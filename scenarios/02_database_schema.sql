-- --- 1. PHÂN CẤP TỔ CHỨC & NGƯỜI DÙNG ---

CREATE TABLE brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL, -- VD: UAT-MC
    name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL, -- VD: HCM - Khu vực 1
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL, -- VD: mc-015
    name VARCHAR(255) NOT NULL,
    address TEXT,
    province VARCHAR(100),
    district VARCHAR(100),
    ward VARCHAR(100),
    brand_id UUID REFERENCES brands(id),
    area_id UUID REFERENCES areas(id),
    manager_email VARCHAR(255),
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) NOT NULL, -- ADMIN, QA_MANAGER, QC_AUDITOR, SHOP_MANAGER, AREA_MANAGER
    scope_type VARCHAR(50) DEFAULT 'COMPANY', -- COMPANY, BRAND, AREA, STORE
    scope_id UUID,
    is_locked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- --- 2. CẤU HÌNH TIÊU CHÍ & BẢNG KIỂM ---

CREATE TYPE criteria_group AS ENUM ('C', 'H', 'P', 'E');

CREATE TABLE criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    "group" criteria_group NOT NULL,
    dbase INTEGER DEFAULT 2,
    dmax INTEGER DEFAULT 8,
    is_risk BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(20) NOT NULL,
    brand_id UUID REFERENCES brands(id),
    weight_c NUMERIC(5,2) DEFAULT 30.00,
    weight_h NUMERIC(5,2) DEFAULT 15.00,
    weight_p NUMERIC(5,2) DEFAULT 15.00,
    weight_e NUMERIC(5,2) DEFAULT 40.00,
    status VARCHAR(20) DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE checklist_criteria (
    checklist_id UUID REFERENCES checklists(id) ON DELETE CASCADE,
    criteria_id UUID REFERENCES criteria(id),
    PRIMARY KEY (checklist_id, criteria_id)
);

-- --- 3. KẾ HOẠCH & KẾT QUẢ ĐÁNH GIÁ ---

CREATE TABLE audit_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    checklist_id UUID REFERENCES checklists(id),
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES audit_plans(id),
    store_id UUID REFERENCES stores(id),
    auditor_id UUID REFERENCES users(id),
    total_score NUMERIC(5,2) DEFAULT 0.00,
    has_risk BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'DRAFT',
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
    criteria_id UUID REFERENCES criteria(id),
    is_passed BOOLEAN NOT NULL,
    num_errors INTEGER DEFAULT 0,
    repeat_errors INTEGER DEFAULT 0,
    is_ccp BOOLEAN DEFAULT false,
    note TEXT,
    evidence_urls TEXT[],
    created_at TIMESTAMPTZ DEFAULT now()
);

-- --- 4. ACTION PLAN ---

CREATE TABLE action_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id UUID UNIQUE REFERENCES audits(id),
    status VARCHAR(20) DEFAULT 'IN_PROGRESS',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE action_plan_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_plan_id UUID REFERENCES action_plans(id) ON DELETE CASCADE,
    criteria_id UUID REFERENCES criteria(id),
    root_cause TEXT,
    solution TEXT,
    assignee_name VARCHAR(255),
    deadline DATE,
    evidence_url TEXT,
    status VARCHAR(20) DEFAULT 'OPEN',
    updated_at TIMESTAMPTZ DEFAULT now()
 );
