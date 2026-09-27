// Regras de negócio da trilha de macas: preços (aba Resumo), frete por CEP, orçamento,
// validação de CPF e código PIX "copia e cola". As contas são feitas aqui, nunca pela IA.
//
// O build-v3.js copia estas funções para os nós de código do n8n (fonte única da regra).
// Testes: node workflow/orcamento.test.js

// ---------- configuração ----------
const CONFIG = {
  pix: {
    chave: '62768656000106', // CNPJ da POWER LASH CILIOS E CURSOS LTDA
    nome: 'POWER LASH CILIOS CURSOS', // até 25 caracteres, sem acento
    cidade: 'BELO HORIZONTE', // até 15 caracteres, sem acento
  },
  // Frete por pedido (não por unidade)
  frete: { bhCapital: 300, sudeste: 600, sul: 800, nordeste: 1000, centroOeste: 1000 },
  acrescimoMochoBaseDourada: 50,
};

// ---------- utilidades ----------
function semAcento(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function brl(v) {
  const [int, dec] = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + 'R$ ' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

function numero(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  // "2.990,00" -> 2990.00 ; "2990.0" -> 2990
  return s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
}

// ---------- preços (aba Resumo: A = variação, I = preço PIX, J = preço cartão) ----------
function chaveVariacao({ modelo, massageador, baseDourada, mocho }) {
  return [modelo, massageador ? 'mass' : 'sem-mass', baseDourada ? 'base' : 'sem-base', mocho ? 'mocho' : 'sem-mocho'].join('|');
}

function lerVariacao(nome) {
  const n = semAcento(nome).toLowerCase();
  if (/^mocho/.test(n.trim())) return { tipo: 'mocho' };
  if (/carrinho/.test(n)) return { tipo: 'carrinho' };
  const modelo = /master/.test(n) ? 'master' : /classica/.test(n) ? 'classica' : /luxo/.test(n) ? 'luxo' : null;
  if (!modelo) return null;
  return {
    tipo: 'maca',
    modelo,
    massageador: /com massageador/.test(n),
    baseDourada: /com base dourada/.test(n),
    mocho: /\+\s*mocho/.test(n),
  };
}

// values: matriz da API do Sheets (Resumo!A1:J60), com a linha de cabeçalho
function parsePrecos(values) {
  const tabela = { variacoes: {}, mocho: null, carrinho: null, linhas: [] };
  for (const row of values || []) {
    const nome = String(row[0] || '').trim();
    const pix = numero(row[8]);
    const cartao = numero(row[9]);
    if (!nome || !isFinite(pix) || !isFinite(cartao)) continue;
    const v = lerVariacao(nome);
    if (!v) continue;
    const preco = { nome, pix, cartao };
    tabela.linhas.push(preco);
    if (v.tipo === 'mocho') tabela.mocho = preco;
    else if (v.tipo === 'carrinho') tabela.carrinho = preco;
    else tabela.variacoes[chaveVariacao(v)] = preco;
  }
  return tabela;
}

// Texto da tabela para o prompt da IA (só preço de venda, nunca custo)
function tabelaParaTexto(tabela) {
  return tabela.linhas.map((l) => `- ${l.nome}: PIX ${brl(l.pix)} | Cartão ${brl(l.cartao)}`).join('\n');
}

// ---------- frete pelo CEP ----------
const FAIXAS_CEP = [
  [1000, 19999, 'SP'], [20000, 28999, 'RJ'], [29000, 29999, 'ES'], [30000, 39999, 'MG'],
  [40000, 48999, 'BA'], [49000, 49999, 'SE'], [50000, 56999, 'PE'], [57000, 57999, 'AL'],
  [58000, 58999, 'PB'], [59000, 59999, 'RN'], [60000, 63999, 'CE'], [64000, 64999, 'PI'],
  [65000, 65999, 'MA'], [66000, 68899, 'PA'], [68900, 68999, 'AP'], [69000, 69299, 'AM'],
  [69300, 69399, 'RR'], [69400, 69899, 'AM'], [69900, 69999, 'AC'], [70000, 72799, 'DF'],
  [72800, 72999, 'GO'], [73000, 73699, 'DF'], [73700, 76799, 'GO'], [76800, 76999, 'RO'],
  [77000, 77999, 'TO'], [78000, 78899, 'MT'], [79000, 79999, 'MS'], [80000, 87999, 'PR'],
  [88000, 89999, 'SC'], [90000, 99999, 'RS'],
];
const REGIAO_UF = {
  sudeste: ['SP', 'RJ', 'ES', 'MG'],
  sul: ['PR', 'SC', 'RS'],
  nordeste: ['BA', 'SE', 'PE', 'AL', 'PB', 'RN', 'CE', 'PI', 'MA'],
  centroOeste: ['DF', 'GO', 'MT', 'MS'],
  norte: ['PA', 'AP', 'AM', 'RR', 'AC', 'RO', 'TO'],
};
const NOME_REGIAO = { sudeste: 'Sudeste', sul: 'Sul', nordeste: 'Nordeste', centroOeste: 'Centro-Oeste', norte: 'Norte' };

function freteDoCep(cepTexto) {
  const cep = String(cepTexto || '').replace(/\D/g, '');
  if (cep.length !== 8) return { ok: false, motivo: 'cep_invalido' };
  const n5 = Number(cep.slice(0, 5));
  const faixa = FAIXAS_CEP.find(([a, b]) => n5 >= a && n5 <= b);
  if (!faixa) return { ok: false, motivo: 'cep_invalido' };
  const uf = faixa[2];
  const regiao = Object.keys(REGIAO_UF).find((r) => REGIAO_UF[r].includes(uf));
  const cepFmt = cep.slice(0, 5) + '-' + cep.slice(5);
  // Belo Horizonte capital: CEP 30000-000 a 31999-999
  const bhCapital = n5 >= 30000 && n5 <= 31999;
  if (regiao === 'norte') return { ok: true, atende: false, cep: cepFmt, uf, regiao: NOME_REGIAO.norte };
  const valor = bhCapital ? CONFIG.frete.bhCapital : CONFIG.frete[regiao];
  return {
    ok: true,
    atende: true,
    cep: cepFmt,
    uf,
    regiao: bhCapital ? 'Belo Horizonte (capital)' : NOME_REGIAO[regiao],
    valor,
  };
}

// ---------- orçamento ----------
const NOME_MODELO = { classica: 'MACA PRO Clássica', luxo: 'MACA PRO Luxo', master: 'MACA PRO Master' };

function sim(v) {
  return /^(s|sim|true|1|yes)$/i.test(String(v || '').trim());
}

// pedido: { modelo, massageador, base_dourada, mocho, mocho_base_dourada, carrinho, quantidade, cep }
function calcularOrcamento(pedido, tabela) {
  const modelo = semAcento(pedido.modelo).toLowerCase().trim();
  if (!NOME_MODELO[modelo]) return { ok: false, erro: 'modelo' };
  const quantidade = Math.max(1, parseInt(pedido.quantidade, 10) || 1);
  const massageador = sim(pedido.massageador);
  const baseDourada = modelo === 'master' && sim(pedido.base_dourada); // base dourada só na Master
  const mocho = sim(pedido.mocho);
  const mochoBaseDourada = mocho && modelo === 'master' && sim(pedido.mocho_base_dourada);
  const carrinho = sim(pedido.carrinho);

  const frete = freteDoCep(pedido.cep);
  if (!frete.ok) return { ok: false, erro: 'cep' };
  if (!frete.atende) return { ok: false, erro: 'regiao_nao_atendida', frete };

  const itens = [];
  const add = (descricao, precos, qtd) => itens.push({ descricao, qtd, pix: precos.pix * qtd, cartao: precos.cartao * qtd });

  const semMocho = tabela.variacoes[chaveVariacao({ modelo, massageador, baseDourada, mocho: false })];
  if (!semMocho) return { ok: false, erro: 'preco_indisponivel' };
  const comMocho = mocho && tabela.variacoes[chaveVariacao({ modelo, massageador, baseDourada, mocho: true })];

  const descMaca = [
    NOME_MODELO[modelo],
    massageador ? 'com massageador' : 'sem massageador',
    modelo === 'master' ? (baseDourada ? 'com base dourada' : 'sem base dourada') : null,
  ].filter(Boolean).join(', ');

  if (comMocho) {
    add(descMaca + ' + mocho na mesma cor (kit)', comMocho, quantidade);
  } else {
    add(descMaca, semMocho, quantidade);
    if (mocho) {
      if (!tabela.mocho) return { ok: false, erro: 'preco_indisponivel' };
      add('Mocho na mesma cor da maca', tabela.mocho, quantidade);
    }
  }
  if (mochoBaseDourada) {
    const a = CONFIG.acrescimoMochoBaseDourada;
    add('Base dourada no mocho', { pix: a, cartao: a }, quantidade);
  }
  if (carrinho) {
    if (!tabela.carrinho) return { ok: false, erro: 'preco_indisponivel' };
    add('Carrinho auxiliar preto', tabela.carrinho, quantidade);
  }

  const subtotalPix = itens.reduce((s, i) => s + i.pix, 0);
  const subtotalCartao = itens.reduce((s, i) => s + i.cartao, 0);
  return {
    ok: true,
    modelo,
    quantidade,
    massageador,
    baseDourada,
    mocho,
    mochoBaseDourada,
    carrinho,
    itens,
    frete,
    subtotalPix,
    subtotalCartao,
    totalPix: subtotalPix + frete.valor,
    totalCartao: subtotalCartao + frete.valor,
  };
}

function orcamentoParaTexto(o) {
  const linhas = ['*Orçamento MACAS PRO*', ''];
  for (const i of o.itens) {
    linhas.push(`• ${i.qtd}x ${i.descricao}`);
    linhas.push(`   PIX ${brl(i.pix)} | Cartão ${brl(i.cartao)}`);
  }
  linhas.push(`• Frete para ${o.frete.regiao} (CEP ${o.frete.cep}): ${brl(o.frete.valor)}`);
  linhas.push('');
  linhas.push(`*Total no PIX: ${brl(o.totalPix)}*`);
  linhas.push(`*Total no cartão: ${brl(o.totalCartao)}* (parcelado em até 12x)`);
  return linhas.join('\n');
}

function resumoOrcamento(o) {
  const itens = o.itens.map((i) => `${i.qtd}x ${i.descricao}`).join('; ');
  return `${itens}; frete ${brl(o.frete.valor)} (${o.frete.regiao}, CEP ${o.frete.cep}); total PIX ${brl(o.totalPix)}; total cartão ${brl(o.totalCartao)}`;
}

// ---------- CPF ----------
function cpfValido(cpfTexto) {
  const c = String(cpfTexto || '').replace(/\D/g, '');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dig = (n) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(c[9]) && dig(10) === Number(c[10]);
}

// ---------- PIX copia e cola (BR Code estático, padrão do Banco Central) ----------
function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function gerarPix({ valor, txid }) {
  const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const limpa = (s, max) => semAcento(s).toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, max);
  const conta = campo('00', 'br.gov.bcb.pix') + campo('01', CONFIG.pix.chave);
  const id = String(txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const payload =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', Number(valor).toFixed(2)) +
    campo('58', 'BR') +
    campo('59', limpa(CONFIG.pix.nome, 25)) +
    campo('60', limpa(CONFIG.pix.cidade, 15)) +
    campo('62', campo('05', id)) +
    '6304';
  return payload + crc16(payload);
}

module.exports = {
  CONFIG, brl, numero, parsePrecos, tabelaParaTexto, freteDoCep, calcularOrcamento,
  orcamentoParaTexto, resumoOrcamento, cpfValido, gerarPix, crc16, semAcento, sim,
  lerVariacao, chaveVariacao, NOME_MODELO, FAIXAS_CEP, REGIAO_UF, NOME_REGIAO,
};
