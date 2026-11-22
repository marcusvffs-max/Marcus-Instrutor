CREATE OR REPLACE FUNCTION private.protect_vehicle_rental_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF OLD.fixed_item_key = 'aluguel_veiculo' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'A venda de Aluguel de Veículo não pode ser excluída; utilize o fluxo de devolução para conciliar o saldo.';
    END IF;
    IF NEW IS DISTINCT FROM OLD
       AND current_setting('app.allow_vehicle_rental_refund', true) IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'Alterações em vendas de Aluguel de Veículo devem utilizar o fluxo próprio de devolução.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_vehicle_rental_sale_item ON public.sale_items;
CREATE TRIGGER protect_vehicle_rental_sale_item
BEFORE UPDATE OR DELETE ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION private.protect_vehicle_rental_sale_item();