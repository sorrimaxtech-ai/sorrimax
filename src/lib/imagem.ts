// ============================================================================
// Processamento de logo no navegador — sem servidor, sem API externa
// ----------------------------------------------------------------------------
// A clínica sobe a logo dela e a gente precisa (1) enxugar pra um tamanho são e
// (2) opcionalmente tirar o fundo branco pra ela assentar bonita sobre a cor da
// marca. A remoção é flood-fill a partir das 4 BORDAS: só some o branco que
// encosta na borda e vem de fora — o branco DENTRO da logo (miolo de letra,
// forma vazada) fica intacto. É o jeito honesto de "remover fundo" sem IA.
// Tudo vira PNG em data URL, pronto pra <img> e pra guardar no banco.
// ============================================================================

const LADO_MAX = 512; // maior lado — logo de documento não precisa de mais
const TOLERANCIA = 24; // quão longe do branco puro ainda conta como "fundo"

function carregarImagemUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, err) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => ok(img);
    img.onerror = () => err(new Error("Não consegui ler essa imagem."));
    img.src = src;
  });
}

async function carregarArquivo(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await carregarImagemUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Desenha a imagem já redimensionada pro teto, mantendo a proporção. */
function canvasRedimensionado(img: HTMLImageElement): HTMLCanvasElement {
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Navegador sem suporte a canvas.");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/** Zera o alfa do branco contíguo que entra pelas bordas (flood-fill). */
function aplicarRemocaoDeFundo(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const imagem = ctx.getImageData(0, 0, w, h);
  const d = imagem.data;
  const visitado = new Uint8Array(w * h);
  const pilha: number[] = [];

  const ehFundo = (i: number) =>
    255 - d[i] <= TOLERANCIA && 255 - d[i + 1] <= TOLERANCIA && 255 - d[i + 2] <= TOLERANCIA;

  const semear = (x: number, y: number) => pilha.push(y * w + x);
  for (let x = 0; x < w; x++) { semear(x, 0); semear(x, h - 1); }
  for (let y = 0; y < h; y++) { semear(0, y); semear(w - 1, y); }

  while (pilha.length) {
    const p = pilha.pop() as number;
    if (visitado[p]) continue;
    visitado[p] = 1;
    const i = p * 4;
    if (!ehFundo(i)) continue; // pixel não-branco barra o alastramento
    d[i + 3] = 0; // transparente
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) pilha.push(p - 1);
    if (x < w - 1) pilha.push(p + 1);
    if (y > 0) pilha.push(p - w);
    if (y < h - 1) pilha.push(p + w);
  }
  ctx.putImageData(imagem, 0, 0);
}

/** Redimensiona o arquivo e devolve PNG (data URL), sem mexer no fundo. */
export async function prepararLogo(file: File): Promise<string> {
  const img = await carregarArquivo(file);
  return canvasRedimensionado(img).toDataURL("image/png");
}

/** Recebe um data URL e devolve outro com o fundo branco removido. */
export async function removerFundoDataUrl(src: string): Promise<string> {
  const img = await carregarImagemUrl(src);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Navegador sem suporte a canvas.");
  ctx.drawImage(img, 0, 0);
  aplicarRemocaoDeFundo(canvas);
  return canvas.toDataURL("image/png");
}

/** Peso aproximado de um data URL, pra avisar quando a logo ficou pesada. */
export function pesoDataUrlKB(dataUrl: string): number {
  const idx = dataUrl.indexOf(",");
  const base64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  return Math.round((base64.length * 3) / 4 / 1024);
}
