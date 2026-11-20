# Auditoria de gatilhos para cadastro de instrutores

Data: 20/11/2026  
Consulta somente de leitura: gatilhos não internos em `auth.users` e `public.profiles`.

## Resultado

A consulta ao catálogo PostgreSQL não encontrou gatilhos de usuário em:
- `auth.users`
- `public.profiles`

Isso confirma que, no estado consultado, não há trigger automático visível nessas tabelas criando um perfil a partir de um usuário Auth nem protegendo alterações de papel em `profiles`.

## Impacto no convite administrativo proposto

A Edge Function documentada pode seguir o fluxo explícito:
1. validar o JWT do administrador;
2. confirmar `profiles.role = 'admin'`;
3. chamar `auth.admin.inviteUserByEmail`;
4. inserir o perfil com `role = 'instrutor'` usando cliente service_role no servidor.

Como não foi encontrado trigger automático de criação de perfil, não há evidência de duplicidade automática de perfil neste estado. Ainda assim, a função deve tratar conflito de ID/perfil e falha parcial de convite. O convite por e-mail pode ser enviado antes de o INSERT do perfil falhar; rollback por exclusão do usuário é compensação best-effort, não transação atômica.

## Proteção de role

O rascunho SQL propõe criar `private.protect_profile_role()` e o trigger `profiles_protect_role`. Ambos ainda não existem no banco. Não foram criados nesta auditoria.

## Estado
- Consulta somente de leitura.
- Nenhum trigger criado, alterado ou removido.
- Nenhum usuário ou convite criado.
- Nenhuma alteração em Auth ou profiles.
