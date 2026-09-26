// Gera workflow-teste-simulacao.json: testa só a geração de imagem (Gemini), sem WhatsApp.
// Usa a foto da Master como "ambiente da cliente", insere a Clássica na cor de teste
// e grava o resultado em assets/teste-simulacao.<ext>.
//
// Uso: node workflow/build-v3.js && node workflow/build-teste-simulacao.js
//      n8n import:workflow --input=workflow/workflow-teste-simulacao.json
//      n8n execute --id=TesteSimulacao01
const fs = require('fs');
const path = require('path');

const [v3] = JSON.parse(fs.readFileSync(path.join(__dirname, 'workflow-v3.json'), 'utf8'));
const copy = (name) => JSON.parse(JSON.stringify(v3.nodes.find((n) => n.name === name)));
const ASSETS = 'C:/Users/denis/miriam-mota-bot/assets/';

const nodes = [
  {
    parameters: {},
    id: 'd0000000-0000-4000-8000-000000000001',
    name: 'Iniciar teste',
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position: [0, 0],
  },
  {
    parameters: {
      jsCode: "return [{ json: { modelo: 'classica', cor: 'azul marinho', foto: 'teste' } }];",
    },
    id: 'd0000000-0000-4000-8000-000000000002',
    name: 'Separar resposta',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [200, 0],
  },
  {
    parameters: { operation: 'read', fileSelector: ASSETS + 'macas/master.jpg', options: {} },
    id: 'd0000000-0000-4000-8000-000000000003',
    name: 'Ler ambiente de teste',
    type: 'n8n-nodes-base.readWriteFile',
    typeVersion: 1.1,
    position: [400, 0],
  },
  copy('Foto do ambiente em base64'),
  copy('Ler foto da maca'),
  copy('Montar pedido para o Gemini'),
  copy('Gerar imagem (Gemini)'),
  copy('Extrair imagem gerada'),
  {
    parameters: {
      operation: 'write',
      fileName: `={{ '${ASSETS}teste-simulacao.' + ($json.mime.split('/')[1] || 'png') }}`,
      options: {},
    },
    id: 'd0000000-0000-4000-8000-000000000009',
    name: 'Salvar resultado',
    type: 'n8n-nodes-base.readWriteFile',
    typeVersion: 1.1,
    position: [1600, 0],
  },
];
nodes.forEach((n, i) => {
  n.position = [i * 200, 0];
  delete n.onError; // no teste, erro deve aparecer
});

const order = nodes.map((n) => n.name);
const connections = {};
order.slice(0, -1).forEach((name, i) => {
  connections[name] = { main: [[{ node: order[i + 1], type: 'main', index: 0 }]] };
});

const wf = {
  id: 'TesteSimulacao01',
  name: 'TESTE - Simulação de maca (Gemini)',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  active: false,
  pinData: {},
};
fs.writeFileSync(path.join(__dirname, 'workflow-teste-simulacao.json'), JSON.stringify([wf], null, 2));
console.log('workflow-teste-simulacao.json gerado');
