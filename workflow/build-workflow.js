const fs = require('fs');
const path = require('path');

const systemMessage = fs.readFileSync(
  path.join(__dirname, '..', 'prompt', 'system-prompt.md'),
  'utf8'
);

const workflow = {
  id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
  name: 'Miriam Mota - Atendimento WhatsApp',
  nodes: [
    {
      parameters: {
        public: false,
        options: {},
      },
      id: '999e7958-ccf2-4487-96b4-8caca8bcf443',
      name: 'Chat Trigger (teste)',
      type: '@n8n/n8n-nodes-langchain.chatTrigger',
      typeVersion: 1.3,
      position: [240, 300],
      webhookId: '3177a867-f39b-4ea8-9ae4-06e535cb86a5',
    },
    {
      parameters: {
        promptType: 'define',
        text: '={{ $json.chatInput }}',
        options: {
          systemMessage: systemMessage,
        },
      },
      id: '9fffaea5-fe00-4eb9-8688-f93e9d1dd82d',
      name: 'AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 3.1,
      position: [520, 300],
    },
    {
      parameters: {
        model: {
          __rl: true,
          mode: 'list',
          value: 'claude-sonnet-5',
          cachedResultName: 'Claude Sonnet 5',
        },
        options: {},
      },
      id: '51d42e1e-b79a-475f-8c37-6646e2cf1294',
      name: 'Anthropic Chat Model',
      type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
      typeVersion: 1.6,
      position: [500, 520],
    },
  ],
  connections: {
    'Chat Trigger (teste)': {
      main: [[{ node: 'AI Agent', type: 'main', index: 0 }]],
    },
    'Anthropic Chat Model': {
      ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]],
    },
  },
  settings: {
    executionOrder: 'v1',
  },
};

fs.writeFileSync(
  path.join(__dirname, 'miriam-mota-atendimento.json'),
  JSON.stringify(workflow, null, 2)
);
console.log('workflow written');
