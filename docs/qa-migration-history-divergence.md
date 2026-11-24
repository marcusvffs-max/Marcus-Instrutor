# Conciliação do histórico de migrations QA

Data: 24/11/2026  
Projeto QA: `voyjssflroiwdyaacthh`  
Branch: `feature/relatorios-instrutor-app`

## Achado

A consulta de migrations do Supabase QA retornou 71 versões registradas. A branch contém 50 arquivos SQL. Apenas 9 versões coincidem diretamente pelos números de versão; 49 registros remotos têm uma migration local com nome correspondente, mas com prefixo de versão diferente, e 22 registros remotos não têm arquivo local correspondente.

Entre os nomes remotos sem arquivo correspondente estão migrations de restauração do schema-base, políticas operacionais, funções financeiras, ciclos de conversas WhatsApp, prevenção de conflitos de aulas, fundação anterior de parceiros e sincronização de acesso do Central.

## Risco

Não executar `supabase db push` ou promover migrations para produção enquanto esse histórico não for reconciliado. Uma versão local com número diferente pode ser executada novamente mesmo que a alteração equivalente já esteja aplicada no QA; migrations não idempotentes podem falhar ou alterar o comportamento. Também não é seguro criar arquivos vazios para simular migrations históricas sem reconstruir e revisar o conteúdo original.

## Ação segura já feita

As cinco migrations novas do trabalho atual foram renomeadas para coincidir com as versões registradas no QA:
- `20261124045002_partner_module_schema_and_commissions.sql`
- `20261124045009_backfill_student_rental_credit_ledger.sql`
- `20261124045125_partner_referral_fk_indexes.sql`
- `20261124045622_restrict_partner_commission_progress_read.sql`
- `20261124050054_consolidate_partner_read_policies_indexes.sql`

Essas cinco aparecem no histórico remoto e têm conteúdo versionado na branch.

## Próxima etapa de release

Reconstruir ou recuperar os SQL originais das migrations ausentes, comparar o conteúdo local com o estado remoto, e preparar um plano de reconciliação versionado. Não editar a tabela de histórico manualmente nem aplicar migrations na produção sem essa revisão.
