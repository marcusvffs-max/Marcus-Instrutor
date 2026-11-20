# Revisão final do fluxo de convite de instrutores

Data: 20/11/2026  
Status: análise; não implantado.

## 1. Fluxo atual proposto e problema

O documento `edge-function-gerenciar-instrutores.md` usa:
1. `auth.admin.inviteUserByEmail(email, { data: { nome } })`;
2. INSERT em `public.profiles`;
3. se o INSERT falhar, tenta excluir o usuário Auth.

A documentação oficial confirma que `inviteUserByEmail` cria/convoca o usuário e envia o e-mail de convite; a opção `data` grava em `user_metadata`. Portanto, o convite pode ser disparado antes da criação do perfil. O rollback posterior não recolhe o e-mail que já foi enviado.

## 2. Proposta preferida para tornar o cadastro atômico

Avaliar um trigger controlado em `auth.users` que crie o perfil correspondente dentro da mesma transação de criação do usuário:
- o trigger cria `profiles.id = NEW.id`;
- define `role = 'instrutor'` literalmente no servidor/banco;
- usa `raw_user_meta_data->>'nome'` apenas como dado de exibição, nunca como autorização;
- se a criação do perfil falhar, a inserção do usuário Auth falha e o endpoint não deve reportar convite bem-sucedido;
- a Edge Function deixa de fazer INSERT manual em profiles e valida que o perfil existe antes de responder sucesso.

Esse desenho é uma hipótese técnica, não uma mudança aprovada. Antes de adotá-lo, verificar se todos os usuários Auth criados neste projeto devem receber perfil de instrutor, como preservar a conta admin já existente e como o trigger de proteção de role interage com chamadas da Auth API e operações administrativas do Dashboard.

## 3. Alternativa se não for usado trigger em auth.users

Separar criação do usuário e envio de e-mail:
1. criar usuário não confirmado com Auth Admin API;
2. criar perfil instrutor com service_role;
3. gerar link de convite e enviar por provedor de e-mail somente depois de confirmar perfil;
4. implementar reconciliação para falhas entre as etapas.

Essa alternativa exige escolher/configurar provedor de e-mail e controlar o envio. Não foi implementada e pode envolver custos; não configurar sem autorização.

## 4. Validação do endpoint existente

Pontos corretos no rascunho:
- autentica o token com `auth.getUser(accessToken)`;
- consulta o perfil no servidor e exige role admin;
- fixa role como instrutor;
- não aceita papel enviado no corpo;
- mantém service_role no servidor;
- CORS não substitui autenticação.

Pontos a fechar:
- cliente service_role deve ser criado isoladamente, sem repassar o Authorization do usuário;
- a lista de origens deve ser preenchida com origem real confirmada; ausência de Origin pode ser necessária em clientes móveis e não deve ser tratada como autenticação;
- adicionar limite de tentativas e auditoria administrativa;
- padronizar respostas sem revelar se um e-mail já existe;
- limitar tamanho total do body e rejeitar propriedades inesperadas;
- definir estratégia de recuperação para usuário Auth sem profile e profile sem fluxo de convite concluído;
- decidir se a ação administrativa será permitida somente via painel autenticado e protegida por confirmação explícita do admin.

## 5. Metadados e autorização

`user_metadata` pode ser alterado pelo usuário e não pode ser usado para conceder papel ou autorização. O campo `nome` pode ser armazenado ali apenas como dado não confiável de exibição. A fonte de autorização é `profiles.role`, modificada apenas pelo backend administrativo confiável.

## 6. Decisão desta revisão

Não aprovar o endpoint atual para produção enquanto o problema de convite enviado antes da criação do perfil não for resolvido. Preferência para próxima etapa: validar a viabilidade de trigger transacional em `auth.users`, mantendo papel fixo no banco e sem criar qualquer usuário real durante os testes.

## 7. Estado
- Nenhuma Edge Function implantada.
- Nenhum trigger criado.
- Nenhum usuário convidado.
- Nenhum secret configurado.
- Nenhum e-mail enviado.
