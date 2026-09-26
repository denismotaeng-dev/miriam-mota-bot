# Chatbot WhatsApp — Miriam Mota Academy

Bot de atendimento no WhatsApp (e, em andamento, Instagram) feito em n8n, usando a Claude como modelo e a Meta Cloud API como canal. Leia o `README.md` para ver o status completo, os IDs das contas Meta e as armadilhas já conhecidas.

## Estrutura

- `roteiro-agente-whatsapp-miriam-mota.md` — roteiro de negócio completo (trilhas Loja, Curso, Congresso, Macas; regras de escalonamento).
- `prompt/system-prompt.md` — prompt de sistema usado pelos nós "AI Agent" do n8n. Fonte de verdade do texto do bot.
- `workflow/workflow-atual.json` — export do workflow que está em produção (sem credenciais e sem dados de execução). Importável no n8n.
- `workflow/build-workflow.js`, `workflow/extend-workflow.js` e os outros `.json` — scripts e versões antigas da montagem inicial do fluxo; guardados como histórico.
- `start-n8n.ps1` — sobe o n8n local na porta 5678, usando `.n8n/` como pasta de dados e o túnel ngrok como `WEBHOOK_URL`.

## Regras importantes

- **Só existe uma instância de produção** (hoje no computador do Denis). Não ative esse workflow em outro n8n com as mesmas credenciais do WhatsApp: o número responderia em duplicidade.
- **Nunca commitar** `.n8n/`, logs, tokens da Meta ou chave da Anthropic. As credenciais vivem só dentro do n8n.
- Ao mudar o texto do bot, edite `prompt/system-prompt.md` e cole o mesmo texto nos dois nós "AI Agent" do n8n (o de teste e o do WhatsApp). Depois exporte o workflow de novo para `workflow/workflow-atual.json`.
- O bot só pode citar preços, links e condições que estão no roteiro. Na dúvida, o comportamento correto é escalar para atendimento humano.

## Exportar o workflow atualizado do n8n

```powershell
$env:N8N_USER_FOLDER = "$PWD\.n8n"
n8n export:workflow --all --pretty --output=workflow\workflow-atual.json
```

Antes de commitar, confira se o `pinData` está vazio (`{}`), porque ele pode conter mensagens e números de clientes.
