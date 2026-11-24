CREATE OR REPLACE FUNCTION private.protect_vehicle_rental_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.fixed_item_key = 'aluguel_veiculo' THEN
    IF TG_OP = 'DELETE'
       AND current_setting('app.allow_vehicle_rental_sale_delete', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'A venda de Aluguel de Veículo só pode ser excluída pelo fluxo seguro de exclusão de venda.';
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW IS DISTINCT FROM OLD
       AND current_setting('app.allow_vehicle_rental_refund', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Alterações em vendas de Aluguel de Veículo devem utilizar o fluxo próprio de devolução.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;