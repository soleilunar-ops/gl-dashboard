-- stock_movement 실입고 원본값 컬럼 추가
-- 변경 이유: 재고 승인 카드의 누적 실입고 입력값을 별도 컬럼(real_quantity)으로 저장

alter table public.stock_movement
  add column if not exists real_quantity numeric;

-- 기존 데이터는 quantity_delta 절대값으로 1회 백필
update public.stock_movement
set real_quantity = abs(quantity_delta)::numeric
where real_quantity is null;

-- 신규/수정 시 real_quantity 미입력인 경우 quantity_delta 기반 기본값 채움
create or replace function public.trg_stock_movement_set_real_quantity()
returns trigger
language plpgsql
as $$
begin
  if new.real_quantity is null then
    new.real_quantity := abs(coalesce(new.quantity_delta, 0))::numeric;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stock_movement_set_real_quantity on public.stock_movement;
create trigger trg_stock_movement_set_real_quantity
before insert or update of quantity_delta, real_quantity
on public.stock_movement
for each row
execute function public.trg_stock_movement_set_real_quantity();
