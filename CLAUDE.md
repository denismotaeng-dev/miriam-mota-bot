# Chatbot WhatsApp — Miriam Mota Academy

Bot de atendimento no WhatsApp (e, em andamento, Instagram) feito em n8n, usando a Claude como modelo e a Meta Cloud API como canal. Leia o `README.md` para ver o status completo, os IDs das contas Meta e as armadilhas já conhecidas.

## Estrutura

- `roteiro-agente-whatsapp-miriam-mota.md` — roteiro de negócio completo (trilhas Loja, Curso, Congresso, Macas; regras de escalonamento).
- `prompt/system-prompt.md` — prompt de sistema usado pelos nós "AI Agent" do n8n. Fonte de verdade do texto do bot.
- `workflow/workflow-atual.json` — export do workflow que está em produção (sem credenciais e sem dados de execução). Importável no n8n.
- `workflow/build-workflow.js`, `workflow/extend-workflow.js` e os outros `.json` — scripts e versões antigas da montagem inicial do fluxo; guardados como histórico.
- `workflow/build-v4.js` → `workflow/workflow-v4.json` — **versão atual**: gera o fluxo a partir do `workflow-atual.json`, do `prompt/system-prompt.md`, de `workflow/orcamento.js` (preços, frete por CEP, orçamento, CPF, PIX) e de `workflow/marca-dagua.js`. Rode `node workflow/build-v4.js && node workflow/workflow-v4.test.js` sempre que mudar o prompt ou as regras.
- `workflow/orcamento.test.js` e `workflow/workflow-v4.test.js` — testes das regras e dos nós de código (rodam sem n8n).
- `workflow/build-v3.js` — versão anterior (memória + simulação), guardada como histórico.
- `assets/macas/` — fotos de referência de cada modelo (`classica.jpg`, `luxo.jpg`, `master.jpg`); `assets/acessorios/` — mocho e carrinho.
- `start-n8n.ps1` — sobe o n8n local na porta 5678, usando `.n8n/` como pasta de dados e o túnel ngrok como `WEBHOOK_URL`.

## Regras importantes

- **Só existe uma instância de produção** (hoje no computador do Denis). Não ative esse workflow em outro n8n com as mesmas credenciais do WhatsApp: o número responderia em duplicidade.
- **Nunca commitar** `.n8n/`, logs, tokens da Meta ou chave da Anthropic. As credenciais vivem só dentro do n8n.
- Ao mudar o texto do bot, edite `prompt/system-prompt.md` e cole o mesmo texto nos dois nós "AI Agent" do n8n (o de teste e o do WhatsApp). Depois exporte o workflow de novo para `workflow/workflow-atual.json`.
- O bot só pode citar preços, links e condições que estão no roteiro. Na dúvida, o comportamento correto é escalar para atendimento humano.

## Simulação da maca no ambiente (Gemini)

- A Claude não gera imagem. Quando tem modelo, cor e o id da foto da cliente, ela termina a resposta com a linha interna `[[GERAR_IMAGEM|modelo=...|cor=...|foto=...]]`.
- O nó "Separar resposta" tira essa linha do texto e, se ela existir, o fluxo baixa a foto do WhatsApp, lê a foto de referência em `assets/macas/`, chama o `gemini-3.1-flash-image` (`generateContent`), sobe a imagem gerada na Meta e envia para a cliente antes do texto.
- Qualquer erro no caminho manda a mensagem de "Avisar falha na simulação" (encaminha para o time de macas) em vez do texto normal.
- A chave do Gemini fica numa credencial "Header Auth" do n8n (`x-goog-api-key`), nunca no repositório.
- A memória da conversa é a "Simple Memory" do n8n: fica na memória do processo e se perde quando o n8n reinicia.

## Orçamento e pedido de macas (v4)

- Preços: lidos a cada mensagem da planilha "Planilha_Precificacao_Macas_Miriam_Mota_CORRIGIDA", aba **Resumo**, colunas A (variação), I (preço PIX) e J (preço cartão), pela credencial "Google Sheets" do n8n. Corrigir preço = editar a planilha. Custos e margens nunca entram no prompt.
- A IA não faz contas: escreve `[[ORCAMENTO|...]]` e `[[PEDIDO|...]]`, e o nó "Separar resposta" calcula tudo com `orcamento.js`.
- Frete por CEP (pedido inteiro): BH capital (CEP 30000–31999) R$ 300, resto do Sudeste R$ 600, Sul R$ 800, Nordeste e Centro-Oeste R$ 1.000, Norte não vende.
- Base dourada só na Master; mocho na cor da maca, com base dourada só com a Master (+R$ 50); carrinho sempre preto.
- PIX: código copia e cola estático gerado pelo bot (chave CNPJ 62.768.656/0001-06, POWER LASH CILIOS E CURSOS LTDA). Não há confirmação automática: a equipe confere o comprovante.
- Cartão: a Rede não tem API de link de pagamento; a equipe gera o link no portal UseRede e manda para a cliente.
- Cada pedido vira uma linha na planilha "Pedidos Macas - Bot WhatsApp" e um aviso no WhatsApp da Andrea (31) 98349-4901. A Meta só entrega esse aviso se a Andrea tiver falado com o número nas últimas 24 h (senão, precisa de modelo de mensagem aprovado); a planilha é o registro confiável.
- Estado por cliente (último orçamento, simulações, pedido) e a numeração MM0001… ficam nos dados estáticos do workflow no n8n.
- Marca d'água "MACAS PRO / MIRIAM MOTA" desenhada com `@napi-rs/canvas` (vem com o n8n) usando a fonte Bodoni MT do Windows; o `start-n8n.ps1` libera `fs` e `@napi-rs/canvas` para os nós de código.

## Exportar o workflow atualizado do n8n

```powershell
$env:N8N_USER_FOLDER = "$PWD\.n8n"
n8n export:workflow --all --pretty --output=workflow\workflow-atual.json
```

Antes de commitar, confira se o `pinData` está vazio (`{}`), porque ele pode conter mensagens e números de clientes.
