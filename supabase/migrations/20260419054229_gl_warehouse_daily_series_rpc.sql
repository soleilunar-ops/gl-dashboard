-- Restored from Supabase schema_migrations (version 20260419054229)
-- Original migration name: gl_warehouse_daily_series_rpc


CREATE OR REPLACE FUNCTION public.gl_warehouse_daily_series(p_from date, p_to date)
RETURNS TABLE (
  d date,
  inbound_qty bigint,
  outbound_qty bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    o.tx_date::date AS d,
    COALESCE(SUM(o.quantity) FILTER (WHERE o.tx_type IN ('purchase', 'return_sale')), 0)::bigint AS inbound_qty,
    COALESCE(SUM(o.quantity) FILTER (WHERE o.tx_type IN ('sale', 'return_purchase')), 0)::bigint AS outbound_qty
  FROM public.orders o
  WHERE o.is_internal = false
    AND o.tx_date::date >= p_from
    AND o.tx_date::date <= p_to
  GROUP BY o.tx_date::date
  ORDER BY d;
$$;

COMMENT ON FUNCTION public.gl_warehouse_daily_series(date, date) IS
  '외부 orders 기준 일별 입고(purchase+return_sale)·출고(sale+return_purchase) 수량. GL 창고 차트용.';

GRANT EXECUTE ON FUNCTION public.gl_warehouse_daily_series(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.gl_warehouse_daily_series(date, date) TO authenticated;
