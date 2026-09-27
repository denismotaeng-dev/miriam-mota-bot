// Gera workflow-v4.json a partir do workflow-atual.json:
// - v3: memória de conversa, normalizador de texto/foto, simulação com Gemini
// - v4: preços lidos ao vivo da planilha (aba Resumo, colunas A, I e J), orçamento com frete por CEP,
//       pedido com PIX copia e cola, registro na planilha de pedidos, aviso para a equipe,
//       mocho e carrinho na simulação e marca d'água MACAS PRO nas imagens geradas.
//
// Uso: node workflow/build-v4.js
// As regras de preço/frete/PIX ficam em orcamento.js e a marca d'água em marca-dagua.js;
// este script copia o código delas para os nós do n8n.
const fs = require('fs');
const path = require('path');

const [workflow] = JSON.parse(fs.readFileSync(path.join(__dirname, 'workflow-atual.json'), 'utf8'));
const systemPrompt = fs.readFileSync(path.join(__dirname, '..', 'prompt', 'system-prompt.md'), 'utf8');

// ---------- configuração ----------
const PHONE_NUMBER_ID = '1141510365703813';
const GRAPH = 'https://graph.facebook.com/v22.0';
const GEMINI_MODEL = 'gemini-3.1-flash-image';
const ASSETS_DIR = 'C:/Users/denis/miriam-mota-bot/assets/';
const PLANILHA_PRECOS = '1Hlusr7gXirrc1KLlGZ-2oSiuFGHTQOLNLbd-h1YyyYI'; // Planilha_Precificacao_Macas_Miriam_Mota_CORRIGIDA
const PLANILHA_PEDIDOS = '1jVlvqoQ7R0_1L2cXaKQZU1gvnsA9Oe1X4c06u67VFxc'; // Pedidos Macas - Bot WhatsApp
const WHATSAPP_EQUIPE = '5531983494901'; // Andrea
const CRED_GEMINI = { httpHeaderAuth: { id: 'rfTfiWwqtSsWS7Kl', name: 'Gemini API' } };
// Preenchido depois que a credencial "Google Sheets" for criada no n8n (ver CLAUDE.md)
const CRED_SHEETS = { googleSheetsOAuth2Api: { id: process.env.CRED_SHEETS_ID || 'MCuPkrxMNpgKsmI1', name: 'Google Sheets' } };
const FALLBACK_SIMULACAO =
  'Tive um probleminha pra gerar a simulação agora. Pra te mostrar certinho como fica, fala direto com o nosso time de macas: (31) 99495-6526.';

// ---------- código compartilhado ----------
const libOrcamento = fs
  .readFileSync(path.join(__dirname, 'orcamento.js'), 'utf8')
  .replace(/module\.exports[\s\S]*$/, '');
const libMarca = fs
  .readFileSync(path.join(__dirname, 'marca-dagua.js'), 'utf8')
  .match(/async function aplicarMarcaDagua[\s\S]*?\n}\n/)[0];

const byName = (name) => {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`nó não encontrado: ${name}`);
  return node;
};
const whatsAppCredential = byName('Enviar Resposta WhatsApp').credentials;
const whatsAppAuth = { authentication: 'predefinedCredentialType', nodeCredentialType: 'whatsAppApi' };
const sheetsAuth = { authentication: 'predefinedCredentialType', nodeCredentialType: 'googleSheetsOAuth2Api' };
const waFrom = "$('Normalizar mensagem WhatsApp').first().json.waFrom";
let idSeq = 0;
const nid = () => `c0a1b2c4-${String(++idSeq).padStart(4, '0')}-4000-8000-000000000000`;

// Agente de teste (Chat Trigger): prompt sem os dados ao vivo
byName('AI Agent').parameters.options.systemMessage = systemPrompt
  .replace('{{TABELA_PRECOS}}', '(no chat de teste a tabela não é carregada: não passe preços)')
  .replace('{{ESTADO_CLIENTE}}', 'Chat de teste.');

// Agente do WhatsApp: prompt montado a cada mensagem pelo nó "Preparar contexto"
const agenteWa = byName('AI Agent (WhatsApp)');
agenteWa.parameters.text = '={{ $json.chatInput }}';
agenteWa.parameters.options.systemMessage = "={{ $('Preparar contexto').first().json.systemPrompt }}";
agenteWa.position = [1000, 704];

// ---------- normalizador ----------
Object.assign(byName('Normalizar mensagem WhatsApp'), {
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [440, 704],
  parameters: {
    jsCode: `const out = [];
for (const item of $input.all()) {
  const msg = (item.json.messages || [])[0];
  // Webhooks de status (enviado, entregue, lido) não têm "messages": ignora
  if (!msg) continue;
  let chatInput;
  let mediaId = null;
  switch (msg.type) {
    case 'text':
      chatInput = msg.text.body;
      break;
    case 'image':
      mediaId = msg.image.id;
      chatInput = \`[FOTO RECEBIDA id=\${mediaId}]\` + (msg.image.caption ? \` Legenda: \${msg.image.caption}\` : '');
      break;
    case 'document':
      mediaId = msg.document.id;
      chatInput = \`[ARQUIVO RECEBIDO id=\${mediaId} nome=\${msg.document.filename || 'arquivo'}]\` + (msg.document.caption ? \` Legenda: \${msg.document.caption}\` : '');
      break;
    case 'button':
      chatInput = msg.button.text;
      break;
    case 'interactive':
      chatInput = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[resposta interativa]';
      break;
    default:
      chatInput = \`[A cliente enviou uma mensagem do tipo "\${msg.type}", que não consigo abrir]\`;
  }
  out.push({ json: { chatInput, waFrom: msg.from, mediaId, msgType: msg.type } });
}
return out;`,
  },
});

// ---------- envio de texto (uma mensagem por item) ----------
const textNode = byName('Enviar Resposta WhatsApp');
textNode.position = [3200, 704];
textNode.parameters.recipientPhoneNumber = `={{ ${waFrom} }}`;
textNode.parameters.textBody = '={{ $json.texto }}';

const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  parameters, id: nid(), name, type, typeVersion, position, ...extra,
});
const code = (name, position, jsCode, extra) => node(name, 'n8n-nodes-base.code', 2, position, { jsCode }, extra);
const http = (name, position, parameters, extra) =>
  node(name, 'n8n-nodes-base.httpRequest', 4.5, position, { options: {}, ...parameters }, extra);

const newNodes = [
  http('Buscar preços', [620, 704], {
    url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILHA_PRECOS}/values/Resumo!A1:J60`,
    ...sheetsAuth,
    sendQuery: true,
    queryParameters: { parameters: [{ name: 'valueRenderOption', value: 'UNFORMATTED_VALUE' }] },
    options: { timeout: 15000 },
  }, { credentials: CRED_SHEETS, onError: 'continueRegularOutput', alwaysOutputData: true }),

  code('Preparar contexto', [800, 704], `${libOrcamento}
const BASE_PROMPT = ${JSON.stringify(systemPrompt)};
const msg = $('Normalizar mensagem WhatsApp').first().json;
const resp = $input.first().json || {};
const tabela = Array.isArray(resp.values) ? parsePrecos(resp.values) : null;
const precosOk = !!(tabela && tabela.linhas.length);
const tabelaTexto = precosOk
  ? tabelaParaTexto(tabela)
  : 'INDISPONÍVEL no momento: não passe preços e ofereça o atendimento humano.';
const st = $getWorkflowStaticData('global');
const c = (st.clientes || {})[msg.waFrom] || {};
const estado = [
  c.orcamento ? 'Último orçamento enviado: ' + c.orcamento.resumo : 'Nenhum orçamento enviado ainda.',
  'Simulações de imagem já feitas: ' + (c.simulacoes || 0) + ' de 2.',
  c.pedido
    ? 'Pedido registrado: ' + c.pedido.id + (c.pedido.pagamento === 'pix' ? ' (PIX, aguardando comprovante).' : ' (cartão, a equipe vai enviar o link).')
    : 'Nenhum pedido registrado.',
].join('\\n');
const systemPrompt = BASE_PROMPT.replace('{{TABELA_PRECOS}}', tabelaTexto).replace('{{ESTADO_CLIENTE}}', estado);
return [{ json: { chatInput: msg.chatInput, systemPrompt, precosOk } }];`),

  node('Memória da conversa', '@n8n/n8n-nodes-langchain.memoryBufferWindow', 1.3, [1100, 928], {
    sessionIdType: 'customKey',
    sessionKey: `={{ ${waFrom} }}`,
    contextWindowLength: 30,
  }),

  code('Separar resposta', [1300, 704], `${libOrcamento}
const msg = $('Normalizar mensagem WhatsApp').first().json;
const resp = $('Buscar preços').first().json || {};
const tabela = parsePrecos(Array.isArray(resp.values) ? resp.values : []);
const st = $getWorkflowStaticData('global');
st.clientes = st.clientes || {};
const c = (st.clientes[msg.waFrom] = st.clientes[msg.waFrom] || {});
let texto = $input.first().json.output || '';
const extras = [];

function marcador(nome) {
  const re = new RegExp('\\\\[\\\\[' + nome + '\\\\s*\\\\|([^\\\\]]*)\\\\]\\\\]', 'i');
  const m = texto.match(re);
  if (!m) return null;
  const kv = {};
  for (const par of m[1].split('|')) {
    const i = par.indexOf('=');
    if (i > 0) kv[par.slice(0, i).trim().toLowerCase()] = par.slice(i + 1).trim();
  }
  return { kv, bruto: m[0] };
}
const trocar = (m, novo) => { texto = texto.replace(m.bruto, novo); };
const ERRO_ORC = {
  cep: 'Não consegui identificar esse CEP. Pode conferir e me mandar de novo?',
  regiao_nao_atendida: 'Poxa, ainda não entregamos na região Norte. Assim que passarmos a atender, te aviso por aqui!',
  preco_indisponivel: 'Não consegui carregar os valores agora. Vou te passar pra nossa equipe, que te manda o orçamento certinho: (31) 98349-4901 (Andrea).',
  modelo: 'Me confirma qual modelo você quer: Clássica, Luxo ou Master?',
};

// ----- orçamento -----
const mo = marcador('ORCAMENTO');
if (mo) {
  const o = calcularOrcamento(mo.kv, tabela);
  if (o.ok) {
    trocar(mo, orcamentoParaTexto(o));
    c.orcamento = { params: mo.kv, resumo: resumoOrcamento(o), totalPix: o.totalPix, totalCartao: o.totalCartao, cep: o.frete.cep, data: new Date().toISOString() };
  } else {
    trocar(mo, ERRO_ORC[o.erro] || ERRO_ORC.preco_indisponivel);
  }
}

// ----- simulação -----
let gerar = false;
let simulacao = null;
const mi = marcador('GERAR_IMAGEM');
if (mi) {
  const kv = mi.kv;
  const modelo = semAcento(kv.modelo || '').toLowerCase().trim();
  const ok = ['classica', 'luxo', 'master'].includes(modelo) && kv.cor && kv.foto;
  if (ok && (c.simulacoes || 0) >= 2) {
    trocar(mi, '');
    extras.push('Já fizemos as 2 simulações por aqui 😊 Pra ver outras combinações, o nosso time de macas te ajuda: (31) 99495-6526.');
  } else if (ok) {
    trocar(mi, '');
    gerar = true;
    c.simulacoes = (c.simulacoes || 0) + 1;
    simulacao = {
      modelo,
      cor: kv.cor,
      foto: kv.foto,
      baseDourada: modelo === 'master' && sim(kv.base_dourada),
      mocho: sim(kv.mocho),
      mochoBaseDourada: modelo === 'master' && sim(kv.mocho) && sim(kv.mocho_base_dourada),
      carrinho: sim(kv.carrinho),
    };
  } else {
    trocar(mi, '');
  }
}

// ----- pedido -----
let pedido = null;
const mp = marcador('PEDIDO');
if (mp) {
  const d = mp.kv;
  const faltando = ['nome', 'cpf', 'endereco', 'numero', 'bairro', 'cidade', 'uf', 'cep', 'cor_tecido'].filter((k) => !d[k]);
  const pagamento = /cart/i.test(d.pagamento || '') ? 'cartao' : /pix/i.test(d.pagamento || '') ? 'pix' : null;
  let problema = null;
  if (!c.orcamento) problema = 'Antes de fechar, deixa eu te passar o orçamento certinho. Me confirma o modelo, os opcionais e o CEP?';
  else if (faltando.length) problema = 'Pra fechar o pedido ainda preciso de: ' + faltando.join(', ').replace(/_/g, ' ') + '.';
  else if (!cpfValido(d.cpf)) problema = 'O CPF informado parece incorreto. Pode conferir e me mandar de novo?';
  else if (!pagamento) problema = 'Você prefere pagar no PIX ou no cartão (em até 12x)?';
  let o = null;
  if (!problema) {
    o = calcularOrcamento({ ...c.orcamento.params, cep: d.cep }, tabela);
    if (!o.ok) problema = ERRO_ORC[o.erro] || ERRO_ORC.preco_indisponivel;
    else if (o.frete.cep !== c.orcamento.cep) {
      problema = 'Como o CEP de entrega mudou, o frete ficou assim:\\n\\n' + orcamentoParaTexto(o) + '\\n\\nPosso fechar com esses valores?';
      c.orcamento = { params: { ...c.orcamento.params, cep: d.cep }, resumo: resumoOrcamento(o), totalPix: o.totalPix, totalCartao: o.totalCartao, cep: o.frete.cep, data: new Date().toISOString() };
    }
  }
  if (problema) {
    trocar(mp, problema);
  } else {
    st.seqPedido = (st.seqPedido || 0) + 1;
    const id = 'MM' + String(st.seqPedido).padStart(4, '0');
    const total = pagamento === 'pix' ? o.totalPix : o.totalCartao;
    const cpf = d.cpf.replace(/\\D/g, '').replace(/(\\d{3})(\\d{3})(\\d{3})(\\d{2})/, '$1.$2.$3-$4');
    const itens = o.itens.map((i) => i.qtd + 'x ' + i.descricao).join('; ');
    const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    trocar(mp, 'Pedido *' + id + '* registrado! ✅\\n\\n' + itens + '\\nCor e tecido: ' + d.cor_tecido +
      '\\nEntrega: ' + d.endereco + ', ' + d.numero + (d.complemento ? ' (' + d.complemento + ')' : '') + ' - ' + d.bairro + ', ' + d.cidade + '/' + d.uf + ', CEP ' + o.frete.cep +
      '\\nFrete: ' + brl(o.frete.valor) +
      '\\n*Total ' + (pagamento === 'pix' ? 'no PIX' : 'no cartão') + ': ' + brl(total) + '*');
    if (pagamento === 'pix') {
      extras.push('Pra pagar, copie o código abaixo e cole no app do seu banco, na opção *PIX copia e cola*. O valor (' + brl(total) + ') já vem preenchido, e o recebedor é a POWER LASH CILIOS E CURSOS LTDA.\\n\\nDepois me manda o comprovante por aqui, que a nossa equipe confere e confirma o seu pedido 💛');
      extras.push(gerarPix({ valor: total, txid: id }));
    } else {
      extras.push('Nossa equipe vai gerar o link de pagamento no cartão (em até 12x), no valor de ' + brl(total) + ', e te envia por aqui em instantes 💛');
    }
    const linha = [
      agora, id, pagamento === 'pix' ? 'Aguardando comprovante PIX' : 'Enviar link do cartão',
      d.nome, msg.waFrom, d.telefone || '', cpf, d.email || '', d.endereco, d.numero, d.complemento || '',
      d.bairro, d.cidade, d.uf, o.frete.cep, NOME_MODELO[o.modelo], String(o.quantidade), d.cor_tecido,
      o.massageador ? 'Sim' : 'Não', o.baseDourada ? 'Sim' : 'Não', o.mocho ? 'Sim' : 'Não',
      o.mochoBaseDourada ? 'Sim' : 'Não', o.carrinho ? 'Sim' : 'Não', itens, o.frete.valor, o.frete.regiao,
      o.totalPix, o.totalCartao, pagamento === 'pix' ? 'PIX' : 'Cartão', d.obs || '',
    ];
    const avisoEquipe = [
      '🛎️ *Novo pedido ' + id + '* (bot WhatsApp)',
      'Cliente: ' + d.nome + ' | WhatsApp: +' + msg.waFrom + (d.telefone ? ' | Tel.: ' + d.telefone : ''),
      'Itens: ' + itens,
      'Cor e tecido: ' + d.cor_tecido,
      'Entrega: ' + d.cidade + '/' + d.uf + ', CEP ' + o.frete.cep + ' | Frete ' + brl(o.frete.valor),
      'Pagamento: ' + (pagamento === 'pix'
        ? 'PIX de ' + brl(total) + ' (conferir o comprovante na conversa)'
        : 'CARTÃO de ' + brl(total) + ' → gerar o link na Rede e enviar para a cliente'),
      'Dados completos na planilha "Pedidos Macas - Bot WhatsApp".',
    ].join('\\n');
    pedido = { id, linha, avisoEquipe };
    c.pedido = { id, pagamento, data: new Date().toISOString() };
  }
}

texto = texto.replace(/\\n{3,}/g, '\\n\\n').trim();
const mensagens = [texto, ...extras].filter((t) => t && t.trim()).map((t) => ({ texto: t }));
return [{ json: { mensagens, gerar, foto: simulacao && simulacao.foto, simulacao, pedido } }];`),

  node('Gerar simulação?', 'n8n-nodes-base.if', 2.3, [1500, 704], {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
      conditions: [{ id: nid(), leftValue: '={{ $json.gerar }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and',
    },
    options: {},
  }),

  http('Buscar dados da foto', [1700, 544], { url: `={{ '${GRAPH}/' + $json.foto }}`, ...whatsAppAuth },
    { credentials: whatsAppCredential, onError: 'continueErrorOutput' }),

  http('Baixar foto do ambiente', [1900, 544], {
    url: '={{ $json.url }}', ...whatsAppAuth,
    options: { response: { response: { responseFormat: 'file' } } },
  }, { credentials: whatsAppCredential, onError: 'continueErrorOutput' }),

  code('Montar pedido para o Gemini', [2100, 544], `const fs = require('fs');
const ASSETS = ${JSON.stringify(ASSETS_DIR)};
const sala = await this.helpers.getBinaryDataBuffer(0, 'data');
const salaMime = $input.first().binary.data.mimeType || 'image/jpeg';
const s = $('Separar resposta').first().json.simulacao;
const nomes = { classica: 'MACA PRO Clássica', luxo: 'MACA PRO Luxo', master: 'MACA PRO Master' };
const ler = (arq) => (fs.existsSync(ASSETS + arq) ? fs.readFileSync(ASSETS + arq).toString('base64') : null);
const parts = [];
const ref = (rotulo, arq) => {
  const b64 = ler(arq);
  if (!b64) return false;
  parts.push({ text: rotulo }, { inline_data: { mime_type: 'image/jpeg', data: b64 } });
  return true;
};
if (!ref('BED REFERENCE (use only the bed; ignore its background):', 'macas/' + s.modelo + '.jpg')) throw new Error('foto de referência da maca não encontrada: ' + s.modelo);
const temRefMocho = s.mocho && ref('STOOL REFERENCE (use only the stool; ignore its background):', s.mochoBaseDourada ? 'acessorios/mocho-dourado.jpg' : 'acessorios/mocho.jpg');
const temRefCarrinho = s.carrinho && ref('TROLLEY REFERENCE (use only the trolley; ignore its background):', 'acessorios/carrinho.jpg');
parts.push({ text: 'CUSTOMER ROOM (the scene to edit and return):' }, { inline_data: { mime_type: salaMime, data: sala.toString('base64') } });

const base = s.modelo === 'master'
  ? (s.baseDourada ? 'The bed base and legs are gold, as in the BED REFERENCE.' : 'The bed base and legs must be matte black, not gold.')
  : 'The bed has no gold parts.';
const linhas = [
  'Edit the CUSTOMER ROOM photo: add to it the professional eyelash extension bed ("maca", model ' + nomes[s.modelo] + ') shown in the BED REFERENCE photo.',
  'The result must be the CUSTOMER ROOM photo: same walls, floor, furniture, lighting and framing. Never return or reuse the background of any reference photo.',
  'From each reference, copy only the product, with its exact design: shape, base, legs, tufting and proportions. Ignore every other object, person, wall and floor in the references, and do not mix in details from other furniture.',
  'A reference may be a collage with several photos; all of them show the same single product.',
  'Add exactly one full-size bed (a real treatment bed, around 1.9 m long), standing on the floor with realistic scale, matching the room perspective, light and shadows.',
  'If the customer room already has a treatment bed or lounge bed, replace it with the new bed in the same position. Otherwise, place the new bed in a free and natural spot.',
  'Change the upholstery color of the new bed to: ' + s.cor + '. ' + base,
];
if (s.mocho) linhas.push('Also add one professional stool ("mocho") next to the head of the bed' + (temRefMocho ? ', with the exact design of the STOOL REFERENCE' : ', round tufted seat with a low backrest, on a five-star base with casters') + ', upholstered in the same color as the bed (' + s.cor + '). ' + (s.mochoBaseDourada ? 'Its base is gold.' : 'Its base is matte black, not gold.'));
if (s.carrinho) linhas.push('Also add one small auxiliary trolley next to the bed' + (temRefCarrinho ? ', with the exact design of the TROLLEY REFERENCE' : ', with shelves and casters') + '. The trolley is entirely black.');
linhas.push('Keep the colors of every other object in the room exactly as they are. When replacing an existing bed, remove it completely, including its legs and base, so that only the new bed remains.');
linhas.push('Do not add, remove or move other objects in the room, and do not add any text or logos. Return a single photorealistic image.');
parts.push({ text: linhas.join('\\n') });
return [{ json: { body: { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'] } } } }];`,
  { onError: 'continueErrorOutput' }),

  http('Gerar imagem (Gemini)', [2300, 544], {
    method: 'POST',
    url: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.body) }}',
    options: { timeout: 120000 },
  }, { credentials: CRED_GEMINI, onError: 'continueErrorOutput' }),

  code('Extrair imagem e aplicar marca', [2500, 544], `${libMarca}
const res = $input.first().json;
const parts = res?.candidates?.[0]?.content?.parts || [];
const img = parts.find((p) => (p.inlineData || p.inline_data)?.data);
if (!img) throw new Error('O Gemini não devolveu imagem: ' + JSON.stringify(res).slice(0, 500));
const d = img.inlineData || img.inline_data;
const comMarca = await aplicarMarcaDagua(Buffer.from(d.data, 'base64'), require('@napi-rs/canvas'));
const data = await this.helpers.prepareBinaryData(comMarca, 'simulacao-macas-pro.jpg', 'image/jpeg');
return [{ json: { mime: 'image/jpeg' }, binary: { data } }];`,
  { onError: 'continueErrorOutput' }),

  http('Subir imagem no WhatsApp', [2700, 544], {
    method: 'POST',
    url: `${GRAPH}/${PHONE_NUMBER_ID}/media`,
    ...whatsAppAuth,
    sendBody: true,
    contentType: 'multipart-form-data',
    bodyParameters: {
      parameters: [
        { parameterType: 'formData', name: 'messaging_product', value: 'whatsapp' },
        { parameterType: 'formData', name: 'type', value: '={{ $json.mime }}' },
        { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'data' },
      ],
    },
  }, { credentials: whatsAppCredential, onError: 'continueErrorOutput' }),

  http('Enviar simulação', [2900, 544], {
    method: 'POST',
    url: `${GRAPH}/${PHONE_NUMBER_ID}/messages`,
    ...whatsAppAuth,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ messaging_product: 'whatsapp', to: ${waFrom}, type: 'image', image: { id: $json.id, caption: 'Simulação ilustrativa: a cor real pode variar um pouco.' } }) }}`,
  }, { credentials: whatsAppCredential, onError: 'continueErrorOutput' }),

  node('Avisar falha na simulação', 'n8n-nodes-base.whatsApp', 1, [2900, 800], {
    operation: 'send',
    phoneNumberId: `=${PHONE_NUMBER_ID}`,
    recipientPhoneNumber: `={{ ${waFrom} }}`,
    textBody: FALLBACK_SIMULACAO,
    additionalFields: {},
  }, { webhookId: 'c0a1b2c3-0013-4000-8000-0000000000ff', credentials: whatsAppCredential }),

  code('Mensagens para a cliente', [3050, 704],
    "return ($('Separar resposta').first().json.mensagens || []).map((m) => ({ json: m }));"),

  code('Tem pedido?', [3400, 704],
    "const p = $('Separar resposta').first().json.pedido;\nreturn p ? [{ json: p }] : [];"),

  http('Registrar pedido na planilha', [3600, 704], {
    method: 'POST',
    url: `https://sheets.googleapis.com/v4/spreadsheets/${PLANILHA_PEDIDOS}/values/A1:append`,
    ...sheetsAuth,
    sendQuery: true,
    queryParameters: {
      parameters: [
        { name: 'valueInputOption', value: 'RAW' },
        { name: 'insertDataOption', value: 'INSERT_ROWS' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ values: [$json.linha] }) }}',
  }, { credentials: CRED_SHEETS, onError: 'continueRegularOutput' }),

  http('Avisar equipe', [3800, 704], {
    method: 'POST',
    url: `${GRAPH}/${PHONE_NUMBER_ID}/messages`,
    ...whatsAppAuth,
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ messaging_product: 'whatsapp', to: '${WHATSAPP_EQUIPE}', type: 'text', text: { body: $('Tem pedido?').first().json.avisoEquipe } }) }}`,
  }, { credentials: whatsAppCredential, onError: 'continueRegularOutput' }),
];
workflow.nodes.push(...newNodes);

// ---------- ligações ----------
const main = (n) => ({ node: n, type: 'main', index: 0 });
const c = workflow.connections;
c['WhatsApp Trigger'] = { main: [[main('Normalizar mensagem WhatsApp')]] };
c['Normalizar mensagem WhatsApp'] = { main: [[main('Buscar preços')]] };
c['Buscar preços'] = { main: [[main('Preparar contexto')]] };
c['Preparar contexto'] = { main: [[main('AI Agent (WhatsApp)')]] };
c['Memória da conversa'] = { ai_memory: [[{ node: 'AI Agent (WhatsApp)', type: 'ai_memory', index: 0 }]] };
c['AI Agent (WhatsApp)'] = { main: [[main('Separar resposta')]] };
c['Separar resposta'] = { main: [[main('Gerar simulação?')]] };
c['Gerar simulação?'] = { main: [[main('Buscar dados da foto')], [main('Mensagens para a cliente')]] };
const cadeia = [
  'Buscar dados da foto', 'Baixar foto do ambiente', 'Montar pedido para o Gemini',
  'Gerar imagem (Gemini)', 'Extrair imagem e aplicar marca', 'Subir imagem no WhatsApp', 'Enviar simulação',
];
cadeia.forEach((name, i) => {
  const next = cadeia[i + 1] || 'Mensagens para a cliente';
  c[name] = { main: [[main(next)], [main('Avisar falha na simulação')]] };
});
c['Mensagens para a cliente'] = { main: [[main('Enviar Resposta WhatsApp')]] };
c['Enviar Resposta WhatsApp'] = { main: [[main('Tem pedido?')]] };
c['Tem pedido?'] = { main: [[main('Registrar pedido na planilha')]] };
c['Registrar pedido na planilha'] = { main: [[main('Avisar equipe')]] };

workflow.pinData = {};
fs.writeFileSync(path.join(__dirname, 'workflow-v4.json'), JSON.stringify([workflow], null, 2));
console.log('workflow-v4.json gerado com', workflow.nodes.length, 'nós; credencial Sheets:', CRED_SHEETS.googleSheetsOAuth2Api.id);
