
-- counterparty를 internal_entities와 대조해서 is_internal 자동 세팅하는 함수
CREATE OR REPLACE FUNCTION trg_orders_set_is_internal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_matched_pattern TEXT;
BEGIN
  -- counterparty가 없으면 외부거래로 간주 (기본값 false 유지)
  IF NEW.counterparty IS NULL OR TRIM(NEW.counterparty) = '' THEN
    RETURN NEW;
  END IF;
  
  -- 1순위: exact 매칭
  SELECT pattern INTO v_matched_pattern
  FROM internal_entities
  WHERE is_active = TRUE
    AND match_type = 'exact'
    AND pattern = TRIM(NEW.counterparty)
  LIMIT 1;
  
  IF v_matched_pattern IS NOT NULL THEN
    NEW.is_internal := TRUE;
    RETURN NEW;
  END IF;
  
  -- 2순위: contains 매칭
  SELECT pattern INTO v_matched_pattern
  FROM internal_entities
  WHERE is_active = TRUE
    AND match_type = 'contains'
    AND TRIM(NEW.counterparty) LIKE '%' || pattern || '%'
  LIMIT 1;
  
  IF v_matched_pattern IS NOT NULL THEN
    NEW.is_internal := TRUE;
    RETURN NEW;
  END IF;
  
  -- 3순위: regex 매칭
  SELECT pattern INTO v_matched_pattern
  FROM internal_entities
  WHERE is_active = TRUE
    AND match_type = 'regex'
    AND TRIM(NEW.counterparty) ~ pattern
  LIMIT 1;
  
  IF v_matched_pattern IS NOT NULL THEN
    NEW.is_internal := TRUE;
    RETURN NEW;
  END IF;
  
  -- 아무것도 매칭 안 되면 외부거래 (사용자가 지정한 is_internal 값 유지)
  RETURN NEW;
END;
$$;

-- BEFORE INSERT 트리거 등록
-- AFTER INSERT인 trg_orders_to_stock_movement보다 먼저 실행되어야 함
CREATE TRIGGER before_orders_insert_set_is_internal
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_orders_set_is_internal();

COMMENT ON FUNCTION trg_orders_set_is_internal() IS 
  'orders INSERT 시 counterparty를 internal_entities와 대조해 is_internal 자동 세팅. exact → contains → regex 순서로 매칭';
;
