// Marca d'água "MACAS PRO / MIRIAM MOTA" desenhada como texto (fica nítida em qualquer resolução).
// Usada pelo nó "Aplicar marca d'água" do n8n (o código é copiado para o nó pelo build-v3.js)
// e pelo teste local: node workflow/marca-dagua.js <entrada.jpg> <saida.jpg>
//
// Layout igual ao logo: "MACAS PRO" em Bodoni condensada e, na linha de baixo, centralizado,
// "MIRIAM MOTA" espaçado. Branco semitransparente com sombra, no rodapé centralizado.
async function aplicarMarcaDagua(buffer, canvasLib) {
  const { createCanvas, loadImage } = canvasLib;
  const img = await loadImage(buffer);
  const W = img.width;
  const H = img.height;
  const canvas = createCanvas(W, H);
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0, W, H);

  // Tamanho proporcional ao lado menor da foto
  const base = Math.min(W, H);
  const tituloPx = Math.round(base * 0.075);
  const subPx = Math.round(tituloPx * 0.36);
  const gap = Math.round(tituloPx * 0.18);
  const margemBaixo = Math.round(base * 0.045);
  const cx = W / 2;
  const ySub = H - margemBaixo;
  const yTitulo = ySub - subPx - gap;

  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(255,255,255,0.82)';
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = Math.round(tituloPx * 0.12);
  g.shadowOffsetY = Math.max(1, Math.round(tituloPx * 0.03));

  g.font = `condensed bold ${tituloPx}px "Bodoni MT", Georgia, serif`;
  g.fillText('MACAS PRO', cx, yTitulo);

  // "MIRIAM MOTA" com espaçamento entre letras, com a mesma largura do título
  const larguraTitulo = g.measureText('MACAS PRO').width;
  g.font = `${subPx}px "Gill Sans MT", "Century Gothic", Arial, sans-serif`;
  const letras = 'MIRIAM MOTA'.split('');
  const larguraLetras = letras.reduce((s, l) => s + g.measureText(l).width, 0);
  const espaco = Math.max(0, (larguraTitulo - larguraLetras) / (letras.length - 1));
  let x = cx - larguraTitulo / 2;
  g.textAlign = 'left';
  for (const l of letras) {
    g.fillText(l, x, ySub);
    x += g.measureText(l).width + espaco;
  }
  g.restore();

  return canvas.encode('jpeg', 90);
}

if (require.main === module) {
  const fs = require('fs');
  const [, , entrada, saida] = process.argv;
  aplicarMarcaDagua(fs.readFileSync(entrada), require('@napi-rs/canvas'))
    .then((out) => { fs.writeFileSync(saida, out); console.log('ok', saida, out.length, 'bytes'); });
}

module.exports = { aplicarMarcaDagua };
