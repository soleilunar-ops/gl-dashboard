
CREATE TABLE IF NOT EXISTS inbound_staging (
  tx_date date,
  erp_tx_no text,
  erp_system text,
  tx_type text,
  erp_code text,
  erp_item_name_raw text,
  counterparty text,
  quantity integer,
  unit_price numeric,
  supply_amount numeric,
  vat numeric,
  total_amount numeric,
  memo text,
  is_internal boolean
);

TRUNCATE inbound_staging;
