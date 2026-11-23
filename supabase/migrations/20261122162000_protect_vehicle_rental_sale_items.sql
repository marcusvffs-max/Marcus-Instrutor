CREATE OR REPLACE FUNCTION private.protect_vehicle_rental_sale_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF OLD.fixed_item_key = 'aluguel_veiculo' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'A venda de Aluguel de Veículo não pode ser excluída pelo fluxo comum; o saldo precisa ser conciliado primeiro.';
    END IF;
    IF NEW.quantidade_devolvida > OLD.quantidade_devolvida THEN
      RAISE EXCEPTION 'A devolução de Aluguel de Veículo ainda não está disponível; o saldo do aluno não pode ser alterado por este fluxo.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_vehicle_rental_sale_item ON public.sale_items;
CREATE TRIGGER protect_vehicle_rental_sale_item
BEFORE UPDATE OF quantidade_devolvida OR DELETE ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION private.protect_vehicle_rental_sale_item();