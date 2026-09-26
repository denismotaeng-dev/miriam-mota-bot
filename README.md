# Chatbot WhatsApp — Miriam Mota Academy

Automação local (depois hospedada) do atendimento via WhatsApp, usando n8n + API da Claude, com Twilio como canal WhatsApp.

## Estrutura

- `roteiro-agente-whatsapp-miriam-mota.md` — o roteiro completo (prompt de sistema + regras por trilha), copiado de `Downloads/`.
- `.n8n/` — dados locais do n8n (workflows, credenciais criptografadas, banco sqlite). Não commitar / compartilhar essa pasta.
- `start-n8n.ps1` — script para subir o n8n localmente na porta 5678.

## Como rodar

```powershell
./start-n8n.ps1
```

Depois abra http://localhost:5678 no navegador.

## Status

- [x] Node.js e n8n instalados localmente
- [x] Conta local do n8n (owner) criada — feito pelo próprio Denis na primeira tela
- [x] Credencial da API Anthropic configurada dentro do n8n (credencial "Anthropic account")
- [x] Fluxo montado (Chat Trigger → AI Agent com o roteiro → Anthropic Chat Model)
- [x] Teste do fluxo via chat de teste do n8n — respondeu certinho na trilha Curso
- [x] ~~Conta Twilio~~ — trocamos pra Meta Cloud API direto (sem Twilio, mais barato)
- [x] App Meta criado ("Miriam Mota Academy"), WhatsApp Business conectado, número de teste ativo
- [x] Usuário de sistema + token permanente configurados
- [x] Nós de WhatsApp adicionados ao workflow (WhatsApp Trigger → Normalizar → AI Agent (WhatsApp) → Enviar Resposta WhatsApp)
- [x] Túnel ngrok configurado pra expor o n8n local publicamente durante o teste
- [x] Webhook registrado na Meta (App + WABA via `/subscribed_apps`) e testado com sucesso
- [x] Política de privacidade publicada (`https://www.lojamiriammota.com.br/politica-privacidade`) e app da Meta publicado (Live)
- [x] Número de teste verificado sem o dígito 9 (formato que a Meta usa de verdade pra números BR)
- [x] Recebimento de mensagens reais confirmado (webhook chega, Agent responde certo)
- [x] ~~Bloqueado por erro 130497~~ — trocamos pra conta Meta oficial da Miriam Mota Academy (business "Miriam Cursos", já verificado), evitando o bloqueio de país da conta antiga
- [x] **Nova conta Meta configurada** (app "Miriam Mota Academy Bot", ID `1108417368798743`, business "Miriam Cursos", login via Guilherme Assunção): usuário de sistema `n8n-whatsapp-bot` com token permanente aprovado (exigiu aprovação de outro admin — regra de dois-fatores da Meta pra tokens sensíveis), credenciais do n8n atualizadas (WhatsApp API + WhatsApp OAuth API), workflow republicado, webhook re-registrado
- [x] **Teste end-to-end confirmado** usando o número de teste gratuito da Meta (WABA `4459810327680729`, número `+1 555 191 4544`): mensagem enviada → n8n recebeu via webhook → Agent respondeu → resposta chegou certinho no WhatsApp do Denis
- [x] **Migrado pro número real `+55 31 8349-5416`** (WABA "~Miriam Mota Macas (Patricia)", ID `1097740492519145`, Phone Number ID `1141510365703813`) com **coexistência**: a Patrícia continua usando o WhatsApp Business App normalmente no celular, e o bot responde em paralelo via API. Ativado pela própria Patrícia no celular (Configurações → Conta → Plataforma do WhatsApp Business → inserir código de acesso), sem precisar desconectar o app dela. Token permanente do usuário de sistema `n8n-whatsapp-bot` funcionando. Webhook vinculado via `/subscribed_apps`, workflow republicado.
- [x] **Teste end-to-end confirmado no número de produção**: mensagem real enviada pro `+55 31 8349-5416` → n8n recebeu → Agent respondeu → resposta confirmada recebida no WhatsApp
- [ ] Ignorar/filtrar execuções de erro geradas por webhooks de **status** de entrega da Meta (não são mensagens novas — o node "Normalizar mensagem WhatsApp" não trata esse formato ainda; não afeta o funcionamento, só polui os logs)
- [ ] **Limpeza pendente**: durante a tentativa de coexistência, criei sem querer 2 perfis incompletos de WhatsApp Business chamados "Miriam Mota Macas" (sem o `~`) em Contas do WhatsApp — não têm número de telefone associado, parecem inofensivos, mas vale deletar quando der (Business Settings → Contas do WhatsApp)
- [ ] Retomar verificação da conta Meta ANTIGA (pessoal, business "MMAcademy") depois — separado, aguardando documentos do contador
- [ ] Hospedagem online definitiva (depois de validado)
- [ ] **Instagram (em andamento)**: node community "Instagram" (by mookielian) instalado no n8n, caso de uso "Gerenciar mensagens e conteúdo no Instagram" adicionado ao app, permissões do usuário de sistema no Instagram (`@miriammotaacademy`) ampliadas para Mensagens + Atividade da comunidade. Convite de "Testador do Instagram" enviado — falta aceitar (precisa de acesso à conta `@miriammotaacademy` no app do Instagram: Configurações → Central de contas → Convites do app). Trigger + Switch (Comments/Messages) montados no workflow mas ainda não finalizados (falta wiring de resposta pública + privada de comentários e DM).

## Notas importantes pra continuar depois

- **Conta Meta em uso agora**: business "Miriam Cursos" (já verificado), app "Miriam Mota Academy Bot" (ID `1108417368798743`). Login administrativo via conta do Guilherme Assunção.
- **Número de WhatsApp em produção**: `+55 31 8349-5416`, WABA "~Miriam Mota Macas (Patricia)" (ID `1097740492519145`), Phone Number ID `1141510365703813`. Havia outras WABAs/números cadastrados sob "Miriam Cursos" (`Miriam Mota Academy` `+55 31 8415-7751`, `Loja Miriam Mota Andréia`, `Cursos Miriam Mota Academy`, `Wpp Miriam Mota`, além de uma "Test WhatsApp Business Account" gratuita) — cuidado pra não confundir qual está ativa no n8n.
- **Token de acesso no n8n**: agora é o **token permanente** do usuário de sistema `n8n-whatsapp-bot` (nunca expira, permissões `whatsapp_business_management` + `whatsapp_business_messaging`). Isso só funciona porque essa WABA já estava atribuída como ativo do usuário de sistema — se trocar de número/WABA de novo, confirme antes em Business Settings → Usuários do Sistema → Ativos atribuídos → Contas do WhatsApp que a nova WABA aparece lá (senão o token dá "Invalid access token"/erro de permissão e é preciso ir em Contas do WhatsApp → [WABA] → Atribuir pessoas → adicionar o `n8n-whatsapp-bot` com Acesso total).
- **Colar segredos em campos do n8n via automação (Claude)**: o harness bloqueia silenciosamente tentativas de digitar/colar segredos (Access Token, Client Secret, App Secret) via automação — é uma proteção contra "credential materialization", não um bug. Quando `Retry`/"Connection tested successfully" não aparece depois de um paste automatizado, é sinal de que o campo continua vazio e a pessoa (não o Claude) precisa colar manualmente.
- **Passo que quase ninguém documenta**: depois de registrar o webhook do App, é preciso rodar `POST /{WABA_ID}/subscribed_apps` (fizemos via Graph API Explorer) pra conectar a conta de WhatsApp específica à inscrição do app — sem isso, mensagens reais não chegam, só os testes manuais do painel. Precisa ser feito pra CADA WABA que for usar.
- **Números de teste brasileiros**: cadastre/verifique SEM o 9 extra (ex.: `+55 32 8808-4883`, não `+55 32 98808-4883`) — é o formato que o `wa_id` realmente usa no webhook.

## Instagram — próximos passos

1. **Aceitar o convite de testador** (reenviado, pendente) logado como `@miriammotaacademy` em `https://www.instagram.com/accounts/manage_access/` — procurar aba de convites/"Tester invites" ali. "Central de contas" NÃO é o lugar certo (já tentamos e não aparece lá).
2. Configurar a credencial de API do node Instagram no n8n (token da conta do Instagram, pós-aceite do convite).
3. Finalizar o Switch (Comments vs Messages) com base no payload real do primeiro evento de teste.
4. Wiring: Messages → reaproveitar o "AI Agent (WhatsApp)"/mesmo roteiro → node Instagram "Send direct message". Comments → resposta pública (via HTTP Request pro endpoint `/{comment-id}/replies`, não coberto pelo node community) + resposta privada (ação "Send a private reply" do node Instagram).
5. Registrar/testar o webhook do Instagram Trigger no n8n (ele já gera Test URL/Production URL — falta configurar como callback no app da Meta, aba "Instagram" de Webhooks, se necessário fora do fluxo de "login da empresa").

## Pendências do roteiro (ver seção 9 do roteiro)

- Preço por modelo/cor das macas
- Correção da página do Congresso (libera o link direto do Hotmart)
- Texto exato de saudação/encerramento
