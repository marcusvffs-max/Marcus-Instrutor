# Isolamento de ambientes Supabase — Preview e produção

## Regra de roteamento

O frontend carrega `supabase-config.js` antes de inicializar qualquer cliente Supabase.

- Produção: somente `marcusinstrutor.vercel.app` usa o projeto original `ydyqagqsuqntuibzgwzd`.
- Preview: hosts de deployment/branch da Vercel no padrão `marcusinstrutor-<deployment>-marcusvffs-2839.vercel.app` usam exclusivamente o projeto isolado `voyjssflroiwdyaacthh`.
- Hosts desconhecidos, localhost e domínios não cadastrados recebem configuração nula; as páginas bloqueiam a inicialização do cliente.
- As chaves incluídas são publishable keys, destinadas ao uso client-side. Nenhuma chave `service_role` é usada no navegador.

## Páginas cobertas

- `index.html` (login, recuperação de senha e sessão administrativa)
- `instrutor.html` / `instrutor.js`
- `usuario.html` / `usuario.js`
- `claim-student.html` (confirmação de vínculo de aluno)

Os scripts administrativos carregados pelo painel reutilizam o cliente de `index.html`.

## Cache

A versão do cache do service worker foi incrementada e o arquivo de configuração foi incluído na lista de recursos. A atualização remove o cache anterior no evento de ativação.

## Limites de validação

Esta alteração de código não significa que a homologação foi concluída. Antes de liberar o Preview para testes funcionais:

1. Confirmar que a nova versão está implantada no Preview.
2. Confirmar em cada página que `MARCUS_SUPABASE_CONFIG.environment` é `preview` e que a URL é do projeto isolado.
3. Testar login, recuperação de senha e confirmação de vínculo com contas sintéticas criadas exclusivamente no projeto isolado.
4. Testar os fluxos de CRUD e autorização no Preview.
5. Confirmar que a página oficial de produção continua selecionando o projeto original, sem executar operações de escrita durante esta verificação.

A Edge Function `admin-manage-instructors` foi implantada somente no projeto Supabase isolado, versão 1, com `verify_jwt=true`. O código aceita a origem oficial e os hosts Preview deste projeto; links de recuperação e convite usam a origem atual do navegador. A implantação não foi testada por HTTP/JWT real.

Antes de testar recuperação de senha, convites ou vínculo de aluno:

1. Confirmar que a lista de Redirect URLs do Auth no projeto isolado permite a origem Preview (padrão `https://marcusinstrutor-*.vercel.app/**`).
2. Confirmar/configurar as variáveis SMTP dedicadas ao ambiente isolado: `SMTP_HOST`, `SMTP_PORT` (465 ou 587), `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`. Sem elas, os fluxos de envio de e-mail retornam erro controlado. Nenhum e-mail real foi enviado durante a preparação.
3. Testar a Edge Function com JWT real de contas sintéticas do projeto isolado.

A Edge Function `whatsapp-webhook` não foi implantada no projeto isolado: o código atual contém um `OWNER_ID` fixo que não existe entre os perfis do banco isolado, e a própria implementação mantém a análise Gemini e respostas automáticas pausadas. Não alterar nem ativar esse fluxo sem revisar a vinculação por conta e receber autorização explícita.

Não copiar secrets de produção nem usar a service role key no frontend.

Não fazer merge para `main` nem deploy manual como parte desta alteração.


## Proteção contra conflito de horário

A migration `20261122011223_prevent_duplicate_active_lesson_slots.sql` cria um índice único parcial em `lessons(owner_id, data_aula, horario)`. Ele impede que o mesmo instrutor tenha duas aulas não canceladas no mesmo horário, inclusive quando duas telas tentam salvar ao mesmo tempo. Aulas com status `cancelada` liberam o horário para novo agendamento.

A migration foi aplicada e verificada somente no projeto isolado `voyjssflroiwdyaacthh`. Antes de aplicá-la em qualquer banco de produção, executar uma consulta de pré-validação para identificar duplicidades existentes por proprietário, data e horário; não remover nem alterar aulas automaticamente para contornar conflitos.
