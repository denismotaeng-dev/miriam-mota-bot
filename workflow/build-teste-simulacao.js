// Gera workflow-teste-simulacao.json: testa só a geração de imagem (Gemini + marca d'água), sem WhatsApp.
// Usa uma foto de assets/macas como "ambiente da cliente" e grava o resultado em assets/teste-simulacao.jpg.
//
// Uso: node workflow/build-v4.js && node workflow/build-teste-simulacao.js
//      n8n import:workflow --input=workflow/workflow-teste-simulacao.json
//      n8n execute --id=TesteSimulacao01
// Variáveis opcionais: GEMINI_MODEL, SIM_MODELO, SIM_COR, SIM_AMBIENTE (arquivo em assets/macas),
//                      SIM_BASE, SIM_MOCHO, SIM_MOCHO_BASE, SIM_CARRINHO (sim/nao)
const fs = require('fs');
const path = require('path');

const [v4] = JSON.parse(fs.readFileSync(path.join(__dirname, 'workflow-v4.json'), 'utf8'));
const copy = (name) => JSON.parse(JSON.stringify(v4.nodes.find((n) => n.name === name)));
const ASSETS = 'C:/Users/denis/miriam-mota-bot/assets/';
const env = (k, padrao) => process.env[k] || padrao;
const sim = (k, padrao) => /^s/i.test(env(k, padrao));

const simulacao = {
  modelo: env('SIM_MODELO', 'master'),
  cor: env('SIM_COR', 'rosa bebê'),
  foto: 'teste',
  baseDourada: sim('SIM_BASE', 'sim'),
  mocho: sim('SIM_MOCHO', 'sim'),
  mochoBaseDourada: sim('SIM_MOCHO_BASE', 'sim'),
  carrinho: sim('SIM_CARRINHO', 'sim'),
};

const gemini = copy('Gerar imagem (Gemini)');
if (process.env.GEMINI_MODEL) gemini.parameters.url = gemini.parameters.url.replace(/models\/[^:]+:/, 'models/' + process.env.GEMINI_MODEL + ':');

const nodes = [
  { parameters: {}, id: 'd0000000-0000-4000-8000-000000000001', name: 'Iniciar teste', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0] },
  {
    parameters: { jsCode: `return [{ json: { simulacao: ${JSON.stringify(simulacao)} } }];` },
    id: 'd0000000-0000-4000-8000-000000000002', name: 'Separar resposta', type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 0],
  },
  {
    parameters: { operation: 'read', fileSelector: ASSETS + 'macas/' + env('SIM_AMBIENTE', 'classica.jpg'), options: {} },
    id: 'd0000000-0000-4000-8000-000000000003', name: 'Ler ambiente de teste', type: 'n8n-nodes-base.readWriteFile', typeVersion: 1.1, position: [0, 0],
  },
  copy('Montar pedido para o Gemini'),
  gemini,
  copy('Extrair imagem e aplicar marca'),
  {
    parameters: { operation: 'write', fileName: ASSETS + 'teste-simulacao.jpg', options: {} },
    id: 'd0000000-0000-4000-8000-000000000009', name: 'Salvar resultado', type: 'n8n-nodes-base.readWriteFile', typeVersion: 1.1, position: [0, 0],
  },
];
nodes.forEach((n, i) => {
  n.position = [i * 200, 0];
  delete n.onError; // no teste, erro deve aparecer
});
const connections = {};
nodes.slice(0, -1).forEach((n, i) => {
  connections[n.name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
});

fs.writeFileSync(
  path.join(__dirname, 'workflow-teste-simulacao.json'),
  JSON.stringify([{ id: 'TesteSimulacao01', name: 'TESTE - Simulação de maca (Gemini)', nodes, connections, settings: { executionOrder: 'v1' }, active: false, pinData: {} }], null, 2)
);
console.log('workflow-teste-simulacao.json gerado:', JSON.stringify(simulacao));
