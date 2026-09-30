// Ruido simplex 2D. Devuelve un valor continuo entre -1 y 1.
// El campo de flujo guarda un ángulo por celda a partir de este ruido.
// El agente no ve la función: solo lee el ángulo de la celda donde está.

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const perm = new Uint8Array(512);

export function seedNoise(seed) {
  let s = seed >>> 0;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

function contribute(x, y, gi) {
  let t = 0.5 - x * x - y * y;
  if (t < 0) return 0;
  t *= t;
  const g = GRAD[gi & 7];
  return t * t * (g[0] * x + g[1] * y);
}

export function simplex2(x, y) {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  const n0 = contribute(x0, y0, perm[ii + perm[jj]]);
  const n1 = contribute(x1, y1, perm[ii + i1 + perm[jj + j1]]);
  const n2 = contribute(x2, y2, perm[ii + 1 + perm[jj + 1]]);
  return 70 * (n0 + n1 + n2);
}
