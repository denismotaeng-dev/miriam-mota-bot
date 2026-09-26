// Gera workflow-v3.json a partir do workflow em produção (workflow-atual.json):
// - memória de conversa por cliente no agente do WhatsApp
// - normalizador que entende texto, foto e ignora webhooks de status
// - simulação da maca no ambiente da cliente com o Gemini
//
// Uso: node workflow/build-v3.js
const fs = require('fs');
const path = require('path');

const [workflow] = JSON.parse(fs.readFileSync(path.join(__dirname, 'workflow-atual.json'), 'utf8'));
const systemMessage = fs.readFileSync(path.join(__dirname, '..', 'prompt', 'system-prompt.md'), 'utf8');

const PHONE_NUMBER_ID = '1141510365703813';
const GRAPH = 'https://graph.facebook.com/v22.0';
const GEMINI_MODEL = 'gemini-3.1-flash-image';
const ASSETS_DIR = 'C:/Users/denis/miriam-mota-bot/assets/macas/';
const FALLBACK_TEXT =
  'Tive um probleminha pra gerar a simulação agora. Pra te mostrar certinho como fica, fala direto com o nosso time de macas: (31) 99495-6526.';

const byName = (name) => {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`nó não encontrado: ${name}`);
  return node;
};

const whatsAppCredential = byName('Enviar Resposta WhatsApp').credentials;

// Prompt atualizado nos dois agentes (teste e WhatsApp)
for (const name of ['AI Agent', 'AI Agent (WhatsApp)']) {
  byName(name).parameters.options.systemMessage = systemMessage;
}

// Normalizador: texto, foto, outros tipos; status de entrega não gera execução de erro
Object.assign(byName('Normalizar mensagem WhatsApp'), {
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
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

const waFrom = "$('Normalizar mensagem WhatsApp').first().json.waFrom";
const resposta = "$('Separar resposta').first().json";

const textNode = byName('Enviar Resposta WhatsApp');
textNode.position = [2600, 704];
textNode.parameters.recipientPhoneNumber = `={{ ${waFrom} }}`;
textNode.parameters.textBody = `={{ ${resposta}.texto }}`;

const whatsAppAuth = {
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'whatsAppApi',
};

const newNodes = [
  {
    parameters: {
      sessionIdType: 'customKey',
      sessionKey: `={{ ${waFrom} }}`,
      contextWindowLength: 30,
    },
    id: 'c0a1b2c3-0001-4000-8000-000000000001',
    name: 'Memória da conversa',
    type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
    typeVersion: 1.3,
    position: [832, 928],
  },
  {
    parameters: {
      jsCode: `const texto0 = $input.first().json.output || '';
const re = /\\[\\[GERAR_IMAGEM\\s*\\|([^\\]]*)\\]\\]/i;
const m = texto0.match(re);
let modelo = null, cor = null, foto = null;
if (m) {
  const kv = {};
  for (const par of m[1].split('|')) {
    const i = par.indexOf('=');
    if (i > 0) kv[par.slice(0, i).trim().toLowerCase()] = par.slice(i + 1).trim();
  }
  modelo = (kv.modelo || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
  cor = kv.cor || null;
  foto = kv.foto || null;
}
const gerar = ['classica', 'luxo', 'master'].includes(modelo) && !!cor && !!foto;
const texto = texto0.replace(re, '').trim();
return [{ json: { texto, gerar, modelo, cor, foto } }];`,
    },
    id: 'c0a1b2c3-0002-4000-8000-000000000002',
    name: 'Separar resposta',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [944, 704],
  },
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
        conditions: [
          {
            id: 'c0a1b2c3-0003-4000-8000-00000000000a',
            leftValue: '={{ $json.gerar }}',
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    id: 'c0a1b2c3-0003-4000-8000-000000000003',
    name: 'Gerar simulação?',
    type: 'n8n-nodes-base.if',
    typeVersion: 2.3,
    position: [1152, 704],
  },
  {
    parameters: {
      url: `={{ '${GRAPH}/' + $json.foto }}`,
      ...whatsAppAuth,
      options: {},
    },
    id: 'c0a1b2c3-0004-4000-8000-000000000004',
    name: 'Buscar dados da foto',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.5,
    position: [1360, 544],
    credentials: whatsAppCredential,
    onError: 'continueErrorOutput',
  },
  {
    parameters: {
      url: '={{ $json.url }}',
      ...whatsAppAuth,
      options: { response: { response: { responseFormat: 'file' } } },
    },
    id: 'c0a1b2c3-0005-4000-8000-000000000005',
    name: 'Baixar foto do ambiente',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.5,
    position: [1552, 544],
    credentials: whatsAppCredential,
    onError: 'continueErrorOutput',
  },
  {
    parameters: {
      jsCode: `const item = $input.first();
const buf = await this.helpers.getBinaryDataBuffer(0, 'data');
return [{ json: { b64: buf.toString('base64'), mime: item.binary.data.mimeType || 'image/jpeg' } }];`,
    },
    id: 'c0a1b2c3-0006-4000-8000-000000000006',
    name: 'Foto do ambiente em base64',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1744, 544],
    onError: 'continueErrorOutput',
  },
  {
    parameters: {
      operation: 'read',
      fileSelector: `={{ '${ASSETS_DIR}' + ${resposta}.modelo + '.jpg' }}`,
      options: {},
    },
    id: 'c0a1b2c3-0007-4000-8000-000000000007',
    name: 'Ler foto da maca',
    type: 'n8n-nodes-base.readWriteFile',
    typeVersion: 1.1,
    position: [1936, 544],
    onError: 'continueErrorOutput',
  },
  {
    parameters: {
      jsCode: `const maca = await this.helpers.getBinaryDataBuffer(0, 'data');
const macaMime = $input.first().binary.data.mimeType || 'image/jpeg';
const sala = $('Foto do ambiente em base64').first().json;
const r = $('Separar resposta').first().json;
const nomes = { classica: 'MACA PRO Clássica', luxo: 'MACA PRO Luxo', master: 'MACA PRO Master' };
const prompt = [
  'Edit the CUSTOMER ROOM photo: add to it the professional eyelash extension bed ("maca", model ' + nomes[r.modelo] + ') shown in the PRODUCT REFERENCE photo.',
  'The result must be the CUSTOMER ROOM photo: same walls, floor, furniture, lighting and framing. Never return or reuse the background of the PRODUCT REFERENCE photo.',
  'From the PRODUCT REFERENCE, copy only the bed, with its exact design: shape, base, legs, tufting and proportions. Ignore every other object, person, wall and floor in that photo, and do not mix in details from other furniture.',
  'The PRODUCT REFERENCE may be a collage with several photos; all of them show the same single bed model.',
  'Add exactly one full-size bed (a real treatment bed, around 1.9 m long), standing on the floor with realistic scale, matching the room perspective, light and shadows.',
  'If the customer room already has a treatment bed or lounge bed, replace it with the new bed in the same position. Otherwise, place the new bed in a free and natural spot.',
  'Change only the upholstery color of the new bed to: ' + r.cor + '. Keep the colors of every other object in the room exactly as they are.',
  'When replacing an existing bed, remove it completely, including its legs and base, so that only the new bed remains.',
  'Do not add, remove or move other objects in the room, and do not add any text or logos. Return a single photorealistic image.',
].join('\\n');
return [{ json: { body: {
  contents: [{ role: 'user', parts: [
    { text: 'PRODUCT REFERENCE (use only the bed; ignore its background):' },
    { inline_data: { mime_type: macaMime, data: maca.toString('base64') } },
    { text: 'CUSTOMER ROOM (the scene to edit and return):' },
    { inline_data: { mime_type: sala.mime, data: sala.b64 } },
    { text: prompt },
  ] }],
  generationConfig: { responseModalities: ['IMAGE'] },
} } }];`,
    },
    id: 'c0a1b2c3-0008-4000-8000-000000000008',
    name: 'Montar pedido para o Gemini',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2128, 544],
    onError: 'continueErrorOutput',
  },
  {
    parameters: {
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.body) }}',
      options: { timeout: 120000 },
    },
    id: 'c0a1b2c3-0009-4000-8000-000000000009',
    name: 'Gerar imagem (Gemini)',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.5,
    position: [2320, 544],
    // Credencial "Header Auth" do n8n com x-goog-api-key (a chave fica só no n8n)
    credentials: { httpHeaderAuth: { id: 'rfTfiWwqtSsWS7Kl', name: 'Gemini API' } },
    onError: 'continueErrorOutput',
  },
  {
    parameters: {
      jsCode: `const res = $input.first().json;
const parts = res?.candidates?.[0]?.content?.parts || [];
const img = parts.find((p) => (p.inlineData || p.inline_data)?.data);
if (!img) throw new Error('O Gemini não devolveu imagem: ' + JSON.stringify(res).slice(0, 500));
const d = img.inlineData || img.inline_data;
const mime = d.mimeType || d.mime_type || 'image/png';
const ext = mime.split('/')[1] || 'png';
const data = await this.helpers.prepareBinaryData(Buffer.from(d.data, 'base64'), 'simulacao.' + ext, mime);
return [{ json: { mime }, binary: { data } }];`,
    },
    id: 'c0a1b2c3-0010-4000-8000-000000000010',
    name: 'Extrair imagem gerada',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [2512, 544],
    onError: 'continueErrorOutput',
  },
  {
    parameters: {
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
      options: {},
    },
    id: 'c0a1b2c3-0011-4000-8000-000000000011',
    name: 'Subir imagem no WhatsApp',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.5,
    position: [2704, 544],
    credentials: whatsAppCredential,
    onError: 'continueErrorOutput',
  },
  {
    parameters: {
      method: 'POST',
      url: `${GRAPH}/${PHONE_NUMBER_ID}/messages`,
      ...whatsAppAuth,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ messaging_product: 'whatsapp', to: ${waFrom}, type: 'image', image: { id: $json.id, caption: 'Simulação ilustrativa: a cor real pode variar um pouco.' } }) }}`,
      options: {},
    },
    id: 'c0a1b2c3-0012-4000-8000-000000000012',
    name: 'Enviar simulação',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.5,
    position: [2896, 544],
    credentials: whatsAppCredential,
    onError: 'continueErrorOutput',
  },
  {
    parameters: {
      operation: 'send',
      phoneNumberId: `=${PHONE_NUMBER_ID}`,
      recipientPhoneNumber: `={{ ${waFrom} }}`,
      textBody: FALLBACK_TEXT,
      additionalFields: {},
    },
    id: 'c0a1b2c3-0013-4000-8000-000000000013',
    name: 'Avisar falha na simulação',
    type: 'n8n-nodes-base.whatsApp',
    typeVersion: 1,
    position: [2896, 800],
    webhookId: 'c0a1b2c3-0013-4000-8000-0000000000ff',
    credentials: whatsAppCredential,
  },
];
workflow.nodes.push(...newNodes);

// Ligações
const main = (node) => ({ node, type: 'main', index: 0 });
const c = workflow.connections;
c['AI Agent (WhatsApp)'] = { main: [[main('Separar resposta')]] };
c['Memória da conversa'] = { ai_memory: [[{ node: 'AI Agent (WhatsApp)', type: 'ai_memory', index: 0 }]] };
c['Separar resposta'] = { main: [[main('Gerar simulação?')]] };
c['Gerar simulação?'] = { main: [[main('Buscar dados da foto')], [main('Enviar Resposta WhatsApp')]] };

// Cadeia da simulação: saída 0 = sucesso segue, saída 1 = erro vai para o aviso
const cadeia = [
  'Buscar dados da foto',
  'Baixar foto do ambiente',
  'Foto do ambiente em base64',
  'Ler foto da maca',
  'Montar pedido para o Gemini',
  'Gerar imagem (Gemini)',
  'Extrair imagem gerada',
  'Subir imagem no WhatsApp',
  'Enviar simulação',
];
cadeia.forEach((name, i) => {
  const next = cadeia[i + 1] || 'Enviar Resposta WhatsApp';
  c[name] = { main: [[main(next)], [main('Avisar falha na simulação')]] };
});

workflow.pinData = {};
fs.writeFileSync(path.join(__dirname, 'workflow-v3.json'), JSON.stringify([workflow], null, 2));
console.log('workflow-v3.json gerado com', workflow.nodes.length, 'nós');
