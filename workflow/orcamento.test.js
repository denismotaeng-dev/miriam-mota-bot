// Testes das regras de orçamento. Uso: node workflow/orcamento.test.js
const assert = require('assert');
const o = require('./orcamento');

let falhas = 0;
const teste = (nome, fn) => {
  try { fn(); console.log('ok  ', nome); } catch (e) { falhas++; console.log('FALHA', nome, '\n     ', e.message); }
};

// Colunas A..J da aba Resumo, como a API do Sheets devolve (UNFORMATTED_VALUE), cópia de 27/09/2026
const linha = (nome, pix, cartao) => [nome, 0, 0, 0, 0, 0, 0, 0, pix, cartao];
const values = [
  ['Variação', 'Custo Total', 'Preço PIX', 'Lucro PIX', 'Preço Cartão', 'Lucro Cartão', 'Diferença', 'Markup', 'Preço PIX', 'Preço Cartão'],
  linha('Master — sem massageador / sem base dourada', 2990, 3290),
  linha('Master — com massageador / sem base dourada', 3590, 3990),
  linha('Master — sem massageador / com base dourada', 3290, 3590),
  linha('Master — com massageador / com base dourada', 3890, 4290),
  linha('Clássica — sem massageador', 2090, 2290),
  linha('Clássica — com massageador', 2690, 2890),
  linha('Luxo — sem massageador', 2190, 2490),
  linha('Luxo — com massageador', 2790, 3090),
  linha('Master — sem massageador / sem base dourada + mocho', 3990, 4490),
  linha('Luxo — sem massageador + mocho', 3290, 3590),
  linha('Mocho', 590, 649),
  linha('carrinho auxiliar', 99, 108.9),
  [''],
];
const tabela = o.parsePrecos(values);

teste('lê as variações, o mocho e o carrinho', () => {
  assert.strictEqual(Object.keys(tabela.variacoes).length, 10);
  assert.deepStrictEqual(tabela.mocho, { nome: 'Mocho', pix: 590, cartao: 649 });
  assert.strictEqual(tabela.carrinho.cartao, 108.9);
});

teste('aceita números formatados em reais', () => {
  assert.strictEqual(o.numero('R$ 2.990,00'), 2990);
  assert.strictEqual(o.numero(108.9), 108.9);
});

teste('frete: BH capital R$ 300', () => {
  const f = o.freteDoCep('30140-071');
  assert.strictEqual(f.valor, 300);
  assert.strictEqual(f.regiao, 'Belo Horizonte (capital)');
});
teste('frete: Contagem (Grande BH) paga Sudeste R$ 600', () => assert.strictEqual(o.freteDoCep('32010000').valor, 600));
teste('frete: São Paulo R$ 600', () => assert.strictEqual(o.freteDoCep('01310-100').valor, 600));
teste('frete: Curitiba R$ 800', () => assert.strictEqual(o.freteDoCep('80010-000').valor, 800));
teste('frete: Salvador R$ 1.000', () => assert.strictEqual(o.freteDoCep('40010-000').valor, 1000));
teste('frete: Ponta Porã/MS R$ 1.000', () => assert.strictEqual(o.freteDoCep('79904-474').valor, 1000));
teste('frete: Brasília R$ 1.000', () => assert.strictEqual(o.freteDoCep('70040-010').valor, 1000));
teste('frete: Belém não atende', () => assert.strictEqual(o.freteDoCep('66010-000').atende, false));
teste('frete: Palmas/TO não atende', () => assert.strictEqual(o.freteDoCep('77001-000').atende, false));
teste('frete: CEP inválido', () => assert.strictEqual(o.freteDoCep('123').ok, false));

teste('orçamento: Clássica simples em BH', () => {
  const r = o.calcularOrcamento({ modelo: 'Clássica', massageador: 'nao', cep: '30140071' }, tabela);
  assert.ok(r.ok);
  assert.strictEqual(r.totalPix, 2090 + 300);
  assert.strictEqual(r.totalCartao, 2290 + 300);
});

teste('orçamento: Master com base dourada, mocho dourado e carrinho em SP', () => {
  const r = o.calcularOrcamento({ modelo: 'master', massageador: 'sim', base_dourada: 'sim', mocho: 'sim', mocho_base_dourada: 'sim', carrinho: 'sim', cep: '01310100' }, tabela);
  assert.ok(r.ok);
  // Sem linha "+ mocho" para essa combinação: maca + mocho avulso + R$ 50 + carrinho + frete
  assert.strictEqual(r.totalPix, 3890 + 590 + 50 + 99 + 600);
  assert.strictEqual(Math.round(r.totalCartao * 100) / 100, 4290 + 649 + 50 + 108.9 + 600);
});

teste('orçamento: usa a linha "+ mocho" quando existe', () => {
  const r = o.calcularOrcamento({ modelo: 'luxo', mocho: 'sim', cep: '30140071' }, tabela);
  assert.strictEqual(r.itens.length, 1);
  assert.strictEqual(r.totalPix, 3290 + 300);
});

teste('orçamento: base dourada é ignorada fora da Master', () => {
  const r = o.calcularOrcamento({ modelo: 'luxo', base_dourada: 'sim', mocho: 'sim', mocho_base_dourada: 'sim', cep: '30140071' }, tabela);
  assert.strictEqual(r.baseDourada, false);
  assert.strictEqual(r.mochoBaseDourada, false);
});

teste('orçamento: quantidade multiplica os itens, frete uma vez', () => {
  const r = o.calcularOrcamento({ modelo: 'classica', quantidade: '2', cep: '80010000' }, tabela);
  assert.strictEqual(r.totalPix, 2 * 2090 + 800);
});

teste('orçamento: região Norte recusa', () => {
  const r = o.calcularOrcamento({ modelo: 'classica', cep: '66010000' }, tabela);
  assert.strictEqual(r.erro, 'regiao_nao_atendida');
});

teste('orçamento: combinação sem preço na planilha', () => {
  const vazio = o.parsePrecos([]);
  assert.strictEqual(o.calcularOrcamento({ modelo: 'classica', cep: '30140071' }, vazio).erro, 'preco_indisponivel');
});

teste('texto do orçamento em reais', () => {
  const r = o.calcularOrcamento({ modelo: 'master', carrinho: 'sim', cep: '01310100' }, tabela);
  const t = o.orcamentoParaTexto(r);
  assert.ok(t.includes('R$ 2.990,00'), t);
  assert.ok(t.includes('Total no PIX: R$ 3.689,00'), t);
  assert.ok(t.includes('R$ 108,90'), t);
});

teste('CPF válido e inválido', () => {
  assert.strictEqual(o.cpfValido('529.982.247-25'), true);
  assert.strictEqual(o.cpfValido('529.982.247-24'), false);
  assert.strictEqual(o.cpfValido('111.111.111-11'), false);
});

teste('CRC16 do PIX (vetor padrão CCITT-FALSE)', () => assert.strictEqual(o.crc16('123456789'), '29B1'));

teste('PIX copia e cola tem os campos certos', () => {
  const p = o.gerarPix({ valor: 2390, txid: 'MM-0001' });
  assert.ok(p.startsWith('000201'), p);
  assert.ok(p.includes('0014br.gov.bcb.pix0114' + '62768656000106'), p);
  assert.ok(p.includes('54072390.00'), p);
  assert.ok(p.includes('5802BR'), p);
  assert.ok(p.includes('6014BELO HORIZONTE'), p);
  assert.ok(p.includes('62100506MM0001'), p);
  assert.strictEqual(p.slice(-8, -4), '6304');
  assert.strictEqual(o.crc16(p.slice(0, -4)), p.slice(-4));
});

console.log(falhas ? `\n${falhas} falha(s)` : '\nTodos os testes passaram');
process.exit(falhas ? 1 : 0);
