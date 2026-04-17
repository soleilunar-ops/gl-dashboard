
-- center를 포함하도록 unique constraint 수정
ALTER TABLE inventory_operation DROP CONSTRAINT uq_inv_op;
ALTER TABLE inventory_operation ADD CONSTRAINT uq_inv_op UNIQUE (op_date, sku_id, center);
