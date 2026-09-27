// Testa os nós de código do workflow-v4.json fora do n8n, simulando $input, $() e o estado.
// Uso: node workflow/build-v4.js && node workflow/workflow-v4.test.js
const assert = require('assert');
const w = require('./workflow-v4.json')[0];
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
const codeOf = (name) => w.nodes.find((n) => n.name === name).parameters.jsCode;

let falhas = 0;
const testes = [];
const teste = (nome, fn) => testes.push([nome, fn]);

// Sintaxe de todos os nós de código e ligações existentes
for (const n of w.nodes) {
  if (n.parameters && n.parameters.jsCode) {
    teste('sintaxe: ' + n.name, () => new AsyncFn('$input', '$', '$getWorkflowStaticData', 'require', n.parameters.jsCode));
  }
}
teste('ligações apontam para nós existentes', () => {
  const nomes = new Set(w.nodes.map((n) => n.name));
  for (const [k, v] of Object.entries(w.connections)) {
    assert.ok(nomes.has(k), 'origem ' + k);
    for (const outs of Object.values(v)) for (const o of outs) for (const t of o) assert.ok(nomes.has(t.node), 'destino ' + t.node);
  }
});

// Ambiente simulado
const linha = (nome, pix, cartao) => [nome, 0, 0, 0, 0, 0, 0, 0, pix, cartao];
const precos = {
  values: [
    ['Variação'],
    linha('Master — sem massageador / sem base dourada', 2990, 3290),
    linha('Master — com massageador / com base dourada', 3890, 4290),
    linha('Clássica — sem massageador', 2090, 2290),
    linha('Luxo — sem massageador', 2190, 2490),
    linha('Mocho', 590, 649),
    linha('carrinho auxiliar', 99, 108.9),
  ],
};
function ambiente(output, estado, chatInput = 'oi') {
  const nodes = {
    'Normalizar mensagem WhatsApp': { json: { waFrom: '5531999990000', chatInput } },
    'Buscar preços': { json: precos },
  };
  const $ = (n) => ({ first: () => nodes[n] });
  return { $, $input: { first: () => ({ json: { output } }) }, st: () => estado };
}
const rodar = async (name, output, estado, chatInput) => {
  const a = ambiente(output, estado, chatInput);
  const r = await new AsyncFn('$input', '$', '$getWorkflowStaticData', 'require', codeOf(name))(a.$input, a.$, a.st, require);
  return r[0].json;
};

teste('Preparar contexto: tabela de preços e estado no prompt', async () => {
  const estado = { clientes: { '5531999990000': { simulacoes: 1 } } };
  const a = ambiente('', estado, 'quero uma maca');
  a.$input.first = () => ({ json: precos });
  const r = (await new AsyncFn('$input', '$', '$getWorkflowStaticData', 'require', codeOf('Preparar contexto'))(a.$input, a.$, a.st, require))[0].json;
  assert.ok(r.precosOk);
  assert.ok(r.systemPrompt.includes('Clássica — sem massageador: PIX R$ 2.090,00 | Cartão R$ 2.290,00'));
  assert.ok(r.systemPrompt.includes('Simulações de imagem já feitas: 1 de 2.'));
  assert.ok(!r.systemPrompt.includes('{{'));
  assert.strictEqual(r.chatInput, 'quero uma maca');
});

teste('Preparar contexto: planilha fora do ar', async () => {
  const a = ambiente('', {}, 'oi');
  a.$input.first = () => ({ json: { error: { message: 'falhou' } } });
  const r = (await new AsyncFn('$input', '$', '$getWorkflowStaticData', 'require', codeOf('Preparar contexto'))(a.$input, a.$, a.st, require))[0].json;
  assert.strictEqual(r.precosOk, false);
  assert.ok(r.systemPrompt.includes('INDISPONÍVEL'));
});

teste('Separar resposta: orçamento calculado pelo sistema', async () => {
  const estado = {};
  const r = await rodar('Separar resposta', 'Montei pra você:\n[[ORCAMENTO|modelo=master|massageador=nao|base_dourada=nao|mocho=sim|mocho_base_dourada=nao|carrinho=sim|quantidade=1|cep=30140-071]]\nQuer fechar?', estado);
  const t = r.mensagens[0].texto;
  assert.ok(t.includes('Total no PIX: R$ 3.979,00'), t); // 2990 + 590 + 99 + 300
  assert.ok(t.includes('Quer fechar?'));
  assert.ok(!t.includes('[['));
  assert.strictEqual(estado.clientes['5531999990000'].orcamento.totalPix, 3979);
});

teste('Separar resposta: Norte recusado', async () => {
  const r = await rodar('Separar resposta', '[[ORCAMENTO|modelo=classica|massageador=nao|cep=66010-000]]', {});
  assert.ok(r.mensagens[0].texto.includes('região Norte'));
});

const pedidoMarcador = (extra = '') =>
  '[[PEDIDO|nome=Maria Teste|telefone=(31) 99999-0000|cpf=529.982.247-25|email=m@t.com|endereco=Rua A|numero=10|complemento=|bairro=Centro|cidade=Belo Horizonte|uf=MG|cep=30140-071|cor_tecido=preto facto|pagamento=pix|obs=' + extra + ']]';
const comOrcamento = () => ({
  clientes: { '5531999990000': { orcamento: { params: { modelo: 'classica', massageador: 'nao', cep: '30140071' }, resumo: 'x', cep: '30140-071' } } },
});

teste('Separar resposta: pedido no PIX gera número, PIX, linha e aviso', async () => {
  const estado = comOrcamento();
  const r = await rodar('Separar resposta', 'Perfeito!\n' + pedidoMarcador(), estado);
  assert.strictEqual(r.pedido.id, 'MM0001');
  assert.ok(r.mensagens[0].texto.includes('Pedido *MM0001* registrado'));
  assert.ok(r.mensagens[0].texto.includes('Total no PIX: R$ 2.390,00'));
  assert.ok(r.mensagens[2].texto.startsWith('000201'), 'terceira mensagem é o PIX');
  assert.ok(r.mensagens[2].texto.includes('54072390.00'));
  assert.strictEqual(r.pedido.linha.length, 30);
  assert.strictEqual(r.pedido.linha[6], '529.982.247-25');
  assert.ok(r.pedido.avisoEquipe.includes('PIX de R$ 2.390,00'));
  assert.strictEqual(estado.seqPedido, 1);
});

teste('Separar resposta: pedido no cartão avisa a equipe para gerar o link', async () => {
  const estado = comOrcamento();
  const r = await rodar('Separar resposta', pedidoMarcador().replace('pagamento=pix', 'pagamento=cartao'), estado);
  assert.ok(r.mensagens[1].texto.includes('link de pagamento no cartão'));
  assert.ok(r.mensagens[1].texto.includes('R$ 2.590,00'));
  assert.ok(r.pedido.avisoEquipe.includes('gerar o link na Rede'));
});

teste('Separar resposta: CPF inválido não registra pedido', async () => {
  const r = await rodar('Separar resposta', pedidoMarcador().replace('529.982.247-25', '111.222.333-44'), comOrcamento());
  assert.strictEqual(r.pedido, null);
  assert.ok(r.mensagens[0].texto.includes('CPF'));
});

teste('Separar resposta: pedido sem orçamento antes', async () => {
  const r = await rodar('Separar resposta', pedidoMarcador(), {});
  assert.strictEqual(r.pedido, null);
  assert.ok(r.mensagens[0].texto.includes('orçamento'));
});

teste('Separar resposta: CEP diferente recalcula o frete antes de fechar', async () => {
  const r = await rodar('Separar resposta', pedidoMarcador().replace('cep=30140-071', 'cep=01310-100'), comOrcamento());
  assert.strictEqual(r.pedido, null);
  assert.ok(r.mensagens[0].texto.includes('R$ 600,00'), r.mensagens[0].texto);
});

teste('Separar resposta: simulação com mocho e carrinho', async () => {
  const estado = {};
  const r = await rodar('Separar resposta', 'Olha que linda!\n[[GERAR_IMAGEM|modelo=Clássica|cor=rosa|foto=123|base_dourada=sim|mocho=sim|mocho_base_dourada=sim|carrinho=sim]]', estado);
  assert.strictEqual(r.gerar, true);
  assert.strictEqual(r.foto, '123');
  assert.strictEqual(r.simulacao.baseDourada, false, 'base dourada só na Master');
  assert.strictEqual(r.simulacao.mochoBaseDourada, false);
  assert.strictEqual(r.simulacao.carrinho, true);
  assert.strictEqual(estado.clientes['5531999990000'].simulacoes, 1);
});

teste('Separar resposta: terceira simulação é bloqueada', async () => {
  const estado = { clientes: { '5531999990000': { simulacoes: 2 } } };
  const r = await rodar('Separar resposta', 'Aqui!\n[[GERAR_IMAGEM|modelo=luxo|cor=azul|foto=9]]', estado);
  assert.strictEqual(r.gerar, false);
  assert.ok(r.mensagens.some((m) => m.texto.includes('2 simulações')));
});

teste('Separar resposta: texto comum passa direto', async () => {
  const r = await rodar('Separar resposta', 'Oi! Tudo bem?', {});
  assert.deepStrictEqual(r.mensagens, [{ texto: 'Oi! Tudo bem?' }]);
  assert.strictEqual(r.pedido, null);
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); console.log('ok  ', nome); } catch (e) { falhas++; console.log('FALHA', nome, '\n     ', e.message); }
  }
  console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes passaram');
  process.exit(falhas ? 1 : 0);
})();
