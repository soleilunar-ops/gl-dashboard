alter table public.stock_movement
  add column if not exists real_quantity numeric;

update public.stock_movement
set real_quantity = abs(quantity_delta)::numeric
where real_quantity is null;

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
execute function public.trg_stock_movement_set_real_quantity();;
