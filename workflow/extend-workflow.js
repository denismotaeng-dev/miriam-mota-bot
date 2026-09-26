const fs = require('fs');
const path = require('path');

const exportedPath = path.join(__dirname, 'exported.json');
const [workflow] = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));

const systemMessage = fs.readFileSync(
  path.join(__dirname, '..', 'prompt', 'system-prompt.md'),
  'utf8'
);

// Values from the Meta app "Miriam Mota Academy" (test WhatsApp Business Account)
const PHONE_NUMBER_ID = '1260407567165087';

const whatsAppTrigger = {
  parameters: {
    updates: ['messages'],
    options: {},
  },
  id: 'b23993a8-f004-43eb-85e2-42a6cd91543f',
  name: 'WhatsApp Trigger',
  type: 'n8n-nodes-base.whatsAppTrigger',
  typeVersion: 1,
  position: [240, 700],
  webhookId: 'b798332c-b4d4-4989-ae51-5e59d967ccfa',
};

const normalizeNode = {
  parameters: {
    mode: 'manual',
    assignments: {
      assignments: [
        {
          id: '6d16fbce-bee6-4606-bd29-6a2de3c9962c',
          name: 'chatInput',
          value: '={{ $json.messages[0].text.body }}',
          type: 'string',
        },
        {
          id: '3b037d7e-717c-461a-915f-fe0fa2dc4dfe',
          name: 'waFrom',
          value: '={{ $json.messages[0].from }}',
          type: 'string',
        },
      ],
    },
    options: {},
  },
  id: '355b5696-9264-4972-b409-4d3c0ccc6693',
  name: 'Normalizar mensagem WhatsApp',
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position: [460, 700],
};

const waAgent = {
  parameters: {
    promptType: 'define',
    text: '={{ $json.chatInput }}',
    options: {
      systemMessage: systemMessage,
    },
  },
  id: '1188ac9c-c155-4ea7-8417-9715e6e74975',
  name: 'AI Agent (WhatsApp)',
  type: '@n8n/n8n-nodes-langchain.agent',
  typeVersion: 3.1,
  position: [700, 700],
};

const sendNode = {
  parameters: {
    resource: 'message',
    operation: 'send',
    messageType: 'text',
    phoneNumberId: PHONE_NUMBER_ID,
    recipientPhoneNumber: "={{ $('Normalizar mensagem WhatsApp').item.json.waFrom }}",
    textBody: '={{ $json.output }}',
    additionalFields: {},
  },
  id: 'a4f1e2d3-c4b5-4a69-8f01-2c3d4e5f6a7b',
  name: 'Enviar Resposta WhatsApp',
  type: 'n8n-nodes-base.whatsApp',
  typeVersion: 1,
  position: [940, 700],
};

workflow.nodes.push(whatsAppTrigger, normalizeNode, waAgent, sendNode);

workflow.connections['WhatsApp Trigger'] = {
  main: [[{ node: 'Normalizar mensagem WhatsApp', type: 'main', index: 0 }]],
};
workflow.connections['Normalizar mensagem WhatsApp'] = {
  main: [[{ node: 'AI Agent (WhatsApp)', type: 'main', index: 0 }]],
};
workflow.connections['AI Agent (WhatsApp)'] = {
  main: [[{ node: 'Enviar Resposta WhatsApp', type: 'main', index: 0 }]],
};
// Share the same Anthropic Chat Model with the WhatsApp agent
workflow.connections['Anthropic Chat Model'].ai_languageModel.push([
  { node: 'AI Agent (WhatsApp)', type: 'ai_languageModel', index: 0 },
]);

fs.writeFileSync(
  path.join(__dirname, 'miriam-mota-atendimento.v2.json'),
  JSON.stringify([workflow], null, 2)
);
console.log('extended workflow written');
