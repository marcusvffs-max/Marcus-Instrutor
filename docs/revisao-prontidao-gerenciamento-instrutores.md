# Revisão de prontidão do gerenciamento de instrutores

Data: 20/11/2026
Projeto Supabase: `ydyqagqsuqntuibzgwzd`
Branch: `feature/relatorios-instrutor-app`

## Estado atual confirmado

- A Edge Function `admin-manage-instructors` não consta na lista de funções implantadas.
- Nenhuma função de gerenciamento de instrutores foi criada ou implantada.
- A migration de segurança continua sem execução.
- O trigger em `auth.users` que cria automaticamente `profiles` ainda não existe.
- O trigger que protege `profiles.role` ainda não existe.
- A política `profiles_update_own` continua ativa e não impede alteração da coluna role.
- Portanto, não se deve expor o redirecionamento por papel para contas de instrutor em produção nem convidar instrutores.

## Revisão do código proposto

O documento `docs/edge-function-gerenciar-instrutores.md` contém uma proposta que:
- valida o access token por `auth.getUser(accessToken)`;
- consulta o papel atual do solicitante no banco usando cliente administrativo;
- aceita somente `action=invite_instructor`;
- fixa o papel `instrutor`, sem aceitar role do body;
- usa service_role somente no servidor;
- confirma o profile criado pelo trigger e não faz INSERT manual;
- limita o corpo JSON a 8 KiB;
- não encaminha o Authorization do usuário ao cliente service_role;
- usa `verify_jwt=true` como requisito de implantação.

## Bloqueios de prontidão

1. **Dependência do trigger:** o endpoint pressupõe que o trigger em auth.users já crie o profile. Implantar antes do trigger faria o endpoint falhar na confirmação do profile.
2. **CORS:** `APP_ALLOWED_ORIGINS` ainda precisa ser configurada com a origem de produção confirmada. CORS não substitui autenticação.
3. **Rate limit:** não há proteção contra sequência abusiva de convites. Definir solução sem criar serviço pago sem autorização.
4. **Auditoria:** falta registrar quem convidou, quando, e o resultado da operação em mecanismo confiável.
5. **Falha parcial:** o convite pode ter sido enviado antes de eventual falha de reconciliação; é necessário procedimento operacional para detectar e resolver contas inconsistentes.
6. **Variáveis:** confirmar no Dashboard os nomes e disponibilidade das variáveis padrão e secrets do projeto. Não ler nem alterar secrets nesta etapa.
7. **Fluxo de administração:** a primeira versão só convida instrutores; não promove, remove nem altera papel de usuários. Isso deve permanecer explícito na interface futura.

## Sequência segura proposta

1. Concluir a revisão estática e obter autorização explícita para a migration de segurança.
2. Antes de qualquer DDL, confirmar manualmente que `private` não está em Exposed schemas e confirmar o efeito global do trigger Auth.
3. Aplicar a migration somente após autorização e janela de recuperação definida.
4. Validar as policies e triggers sem convidar usuários reais.
5. Só então preparar o endpoint, configurar CORS e rate limit e fazer revisão final dos secrets.
6. Implantar com `verify_jwt=true` somente após autorização específica.
7. Testar com conta admin e conta instrutor de teste autorizada; não usar a conta admin de produção para simular instrutor.

## Nenhuma ação operacional realizada

- Nenhum SQL/DDL executado.
- Nenhum secret acessado, criado ou alterado.
- Nenhuma Edge Function criada ou implantada.
- Nenhuma conta ou convite criado.
- Nenhum deploy frontend ou merge.
- Nenhuma alteração em WhatsApp ou IA.
