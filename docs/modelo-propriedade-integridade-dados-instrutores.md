# Decisões propostas de propriedade e integridade dos dados

Data: 20/11/2026  
Escopo: preparação de RLS e relatórios multi-instrutor. Documento de desenho; não executado.

## 1. Modelo de catálogo de produtos

### Recomendação: catálogo central administrado por Marcus
A tabela `products` já está protegida por policies admin-only e possui `owner_id`. O aplicativo atual tem catálogo de produtos/pacotes administrado pelo responsável. Para manter o modelo simples na primeira liberação:
- Marcus mantém e administra os produtos do catálogo central.
- Instrutores não leem nem alteram diretamente `products`.
- Uma venda do instrutor pode referenciar um produto do catálogo central por `sale_items.product_id`.
- `sale_items` deve guardar snapshot de `descricao`, `quantidade`, `valor_unitario` e `subtotal`; relatórios históricos não devem depender do preço ou nome atual do produto.
- A policy de leitura de `sale_items` deve continuar filtrando o item pela venda pertencente ao instrutor. Não exigir `products.owner_id = sale_items.owner_id`, pois o catálogo é central e pode pertencer a Marcus.

Esta opção mantém a administração do catálogo centralizada e não expõe a tabela de produtos aos instrutores. Se no futuro cada instrutor precisar de catálogo próprio, isso será uma mudança de modelo separada.

## 2. Configurações do aplicativo

A tabela `app_settings` usa `owner_id` como chave primária e guarda nome da empresa, telefone, logo e cores. Isso indica configurações individuais por proprietário.

Para a primeira versão:
- manter `app_settings` admin-only, pois o papel instrutor terá apenas relatórios;
- Marcus poderá administrar configurações de qualquer perfil;
- não carregar nem alterar configurações do instrutor durante o login ou a visualização de relatórios;
- reavaliar policies se futuramente o instrutor receber tela própria de personalização.

A policy admin global do rascunho corresponde à necessidade de administração central, mas a interface deve deixar claro qual proprietário está sendo editado para evitar alterações acidentais.

## 3. Propriedade e integridade referencial

Consulta ao catálogo confirmou que as colunas `owner_id` são NOT NULL nas tabelas:
- `students`
- `lessons`
- `vehicles`
- `app_settings`
- `products`
- `sales`
- `sale_items`
- `financial_transactions`

Entretanto, a auditoria de FKs não encontrou vínculo de `owner_id` com `profiles.id`. Recomenda-se avaliar FKs:
- cada `owner_id` dessas tabelas deve referenciar `profiles(id)`;
- a criação de instrutor precisa criar o perfil antes de permitir qualquer registro com seu owner_id;
- ao remover/encerrar usuário, definir política de retenção/transferência; não usar exclusão em cascata que apague histórico financeiro ou de aulas inadvertidamente.

As FKs de negócio já existentes garantem que IDs relacionados existam, mas não garantem que os proprietários coincidam. Regras de consistência:
- `lessons.owner_id = students.owner_id`; veículo, quando informado, deve ter o mesmo owner;
- `sales.owner_id = students.owner_id`, quando `student_id` não for nulo;
- `sale_items.owner_id = sales.owner_id`;
- `financial_transactions.owner_id = students.owner_id`, quando houver aluno;
- `financial_transactions.owner_id = sales.owner_id`, quando houver venda.

A exceção intencional é `sale_items.product_id`: o produto pode pertencer ao catálogo central administrado por Marcus, enquanto o item pertence à venda do instrutor. A integridade desse vínculo deve verificar que o produto é do catálogo central autorizado, e não exigir owner_id igual.

Como os instrutores serão somente leitura, as escritas iniciais serão feitas pelo admin ou por backend confiável. Mesmo assim, as regras devem ser implementadas no banco/servidor para evitar dados inconsistentes no futuro.

## 4. Índices observados e recomendações

Índices existentes incluem:
- `students(owner_id)`
- `vehicles(owner_id)`
- `lessons(owner_id)`, `lessons(student_id)`, `lessons(vehicle_id)`
- `sales(owner_id, data_venda DESC)`, `sales(student_id)`
- `sale_items(sale_id)`
- `financial_transactions(owner_id, data_movimento DESC)`
- `products(owner_id)`

Índices adicionais a avaliar, sem criar nesta etapa:
- `sale_items(owner_id, sale_id)` para leitura dos itens próprios por venda;
- `sale_items(product_id)` para relacionamentos com catálogo;
- `financial_transactions(student_id)` e `financial_transactions(sale_id)` para joins e filtros;
- `lessons(owner_id, data_aula, horario)` para relatórios por período e diário;
- `students(owner_id, nome)` se busca/listagem por nome exigir desempenho.

Evitar criar índices duplicados ou sem plano de consulta medido. O índice composto pode substituir/duplicar índices existentes dependendo da ordem e seletividade.

## 5. Observações adicionais para o SQL RLS

- O instrutor tem somente SELECT; as policies de INSERT/UPDATE/DELETE não devem ser concedidas a ele.
- O admin pode operar globalmente, mas cada linha nova deve manter `owner_id` do instrutor correto. Não usar automaticamente o ID de Marcus como owner de registros criados para outro instrutor.
- O filtro `owner_id` no frontend é apenas conveniência; RLS deve ser a barreira definitiva.
- As policies de SELECT devem continuar protegendo relações, mas a integridade das gravações precisa de constraints/triggers/serviço confiável.
- Antes de adicionar constraints, consultar órfãos e inconsistências; no estado atual as tabelas financeiras e principais estavam vazias, mas revalidar imediatamente antes de qualquer DDL.
- Não alterar políticas de WhatsApp ou IA neste escopo.

## 6. Estado
- Recomendações documentadas.
- Nenhuma policy, grant, FK, índice, trigger ou dado foi alterado.
- Nenhum SQL foi executado.
- Decisão recomendada para primeira versão: catálogo central admin-only; app_settings admin-only; instrutores somente leitura dos próprios relatórios.
