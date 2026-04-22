-- 1. 기존 CHECK 제약 해제 (gl_pharm 허용 목록 제거용)
ALTER TABLE orders DROP CONSTRAINT orders_erp_system_check;
ALTER TABLE item_erp_mapping DROP CONSTRAINT item_erp_mapping_erp_system_check;
ALTER TABLE internal_entities DROP CONSTRAINT internal_entities_erp_system_check;
ALTER TABLE ecount_stock_ledger DROP CONSTRAINT ecount_stock_ledger_company_code_check;
ALTER TABLE excel_uploads DROP CONSTRAINT excel_uploads_company_code_check;

-- 2. 데이터 값 rename: gl_pharm -> glpharm
UPDATE orders SET erp_system = 'glpharm' WHERE erp_system = 'gl_pharm';
UPDATE item_erp_mapping SET erp_system = 'glpharm' WHERE erp_system = 'gl_pharm';
UPDATE internal_entities SET erp_system = 'glpharm' WHERE erp_system = 'gl_pharm';
UPDATE ecount_stock_ledger SET company_code = 'glpharm' WHERE company_code = 'gl_pharm';
UPDATE excel_uploads SET company_code = 'glpharm' WHERE company_code = 'gl_pharm';

-- 3. CHECK 제약 재생성 — 신규 허용 목록 (gl, glpharm, hnb)
ALTER TABLE orders ADD CONSTRAINT orders_erp_system_check
  CHECK (erp_system IN ('gl','glpharm','hnb'));
ALTER TABLE item_erp_mapping ADD CONSTRAINT item_erp_mapping_erp_system_check
  CHECK (erp_system IN ('gl','glpharm','hnb'));
ALTER TABLE internal_entities ADD CONSTRAINT internal_entities_erp_system_check
  CHECK (erp_system IN ('gl','glpharm','hnb'));
ALTER TABLE ecount_stock_ledger ADD CONSTRAINT ecount_stock_ledger_company_code_check
  CHECK (company_code IN ('gl','glpharm','hnb'));
ALTER TABLE excel_uploads ADD CONSTRAINT excel_uploads_company_code_check
  CHECK (company_code IS NULL OR company_code IN ('gl','glpharm','hnb'));;
