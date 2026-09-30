import { seedNoise, simplex2 } from "./noise.js";

// Cada recorte es un vehículo (Reynolds / Nature of Code).
// Percibe poco, calcula una fuerza y no hay un líder.
//
// Campo: lee solo el ángulo de la celda bajo sus pies.
// Pegamento (Physarum, Jeff Jones): huele tres puntos del rastro
//   — adelante, izquierda y derecha — y gira hacia el más fuerte.
// Grupo: solo cuenta recortes dentro de su radio.
// Mano: no es un jefe. Dobla el campo cerca del cursor.
//       Sin clic, deja pegamento. Con clic, el campo apunta hacia afuera.

export const PALETTE = [
  [0.93, 0.58, 0.18],
  [0.96, 0.76, 0.28],
  [0.91, 0.52, 0.56],
  [0.97, 0.92, 0.84],
  [0.76, 0.2, 0.22],
  [0.27, 0.6, 0.62],
  [0.2, 0.14, 0.12],
  [0.48, 0.62, 0.4],
];

const WARM = [0, 0, 1, 1, 2, 2, 3, 3, 4, 7, 7];

export function createSim(options = {}) {
  const seed = options.seed ?? 20250310;
  const sim = {
    w: 16,
    h: 9,
    cols: 160,
    rows: 90,
    fCols: 80,
    fRows: 45,
    count: options.count ?? 280,
    flowWeight: 0.9,
    physWeight: 0.65,
    flockWeight: 0.45,
    noiseScale: 0.07,
    decay: 0.84,
    perception: 0.92,
    sensorDist: 0.78,
    sensorAngle: 0.62,
    rotationSpeed: 3.6,
    deposit: 0.85,
    agrio: false,
    fieldSeed: seed >>> 0,
    rng: seed >>> 0,
    hand: { on: false, x: 8, y: 4.5, repel: false, radius: 1.75 },
    agents: [],
    inspect: null,
  };
  sim.trail = new Float32Array(sim.cols * sim.rows);
  sim.trailBuf = new Float32Array(sim.cols * sim.rows);
  sim.field = new Float32Array(sim.fCols * sim.fRows);
  rebuildField(sim);
  for (let i = 0; i < sim.count; i++) sim.agents.push(makeAgent(sim));
  return sim;
}

function makeAgent(sim) {
  const roll = rand(sim);
  let kind;
  if (roll < 0.22) kind = 0;
  else if (roll < 0.42) kind = 1;
  else if (roll < 0.6) kind = 2;
  else if (roll < 0.8) kind = 3;
  else kind = 4;

  const wantLarge = kind === 0 || kind === 4;
  const sizeRoll = rand(sim);
  let size;
  if (wantLarge && sizeRoll < 0.5) size = lerp(0.72, 1.28, rand(sim));
  else if (sizeRoll < 0.42) size = lerp(0.28, 0.52, rand(sim));
  else size = lerp(0.08, 0.2, rand(sim));

  const sizeNorm = clamp((size - 0.08) / 1.2, 0, 1);
  const heading = rand(sim) * Math.PI * 2;
  const maxSpeed = lerp(1.85, 0.62, sizeNorm);
  let sx = size;
  let sy = size * lerp(0.72, 1.15, rand(sim));
  if (kind === 1) {
    sx = size * 1.9;
    sy = size * 0.34;
  } else if (kind === 2) {
    sx = size;
    sy = size;
  } else if (kind === 3) {
    sx = size * 1.35;
    sy = size * 0.9;
  }

  const colorIndex = rand(sim) < 0.14 ? 5 : WARM[Math.floor(rand(sim) * WARM.length)];
  return {
    x: rand(sim) * sim.w,
    y: rand(sim) * sim.h,
    vx: Math.cos(heading) * maxSpeed * 0.2,
    vy: Math.sin(heading) * maxSpeed * 0.2,
    heading,
    maxSpeed,
    maxForce: lerp(4.4, 1.15, sizeNorm),
    sx,
    sy,
    z: 0.02 + rand(sim) * 0.38,
    rot: rand(sim) * Math.PI * 2,
    spin: (rand(sim) - 0.5) * 0.35,
    kind,
    colorIndex,
    neighbors: 0,
    trailL: 0,
    trailC: 0,
    trailR: 0,
    flowAngle: 0,
  };
}

export function rebuildField(sim) {
  seedNoise(sim.fieldSeed);
  for (let row = 0; row < sim.fRows; row++) {
    for (let col = 0; col < sim.fCols; col++) {
      const n = simplex2(col * sim.noiseScale + 2.2, row * sim.noiseScale + 1.1);
      sim.field[row * sim.fCols + col] = n * Math.PI;
    }
  }
}

export function reseedField(sim) {
  sim.fieldSeed = (Math.imul(sim.fieldSeed, 1664525) + 1013904223) >>> 0;
  rebuildField(sim);
}

export function clearTrail(sim) {
  sim.trail.fill(0);
}

export function step(sim, dt) {
  const agents = sim.agents;
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    senseTrail(sim, agent, dt);
    let fx = 0;
    let fy = 0;

    agent.flowAngle = angleAt(sim, agent.x, agent.y);
    if (sim.flowWeight > 0) {
      const desiredX = Math.cos(agent.flowAngle) * agent.maxSpeed;
      const desiredY = Math.sin(agent.flowAngle) * agent.maxSpeed;
      const steer = steerTo(agent, desiredX, desiredY);
      fx += steer[0] * sim.flowWeight;
      fy += steer[1] * sim.flowWeight;
    }

    if (sim.physWeight > 0) {
      const desiredX = Math.cos(agent.heading) * agent.maxSpeed;
      const desiredY = Math.sin(agent.heading) * agent.maxSpeed;
      const steer = steerTo(agent, desiredX, desiredY);
      fx += steer[0] * sim.physWeight;
      fy += steer[1] * sim.physWeight;
    }

    if (sim.flockWeight > 0) {
      const flock = flockForce(sim, i);
      fx += flock[0] * sim.flockWeight;
      fy += flock[1] * sim.flockWeight;
    } else {
      agent.neighbors = countNeighbors(sim, i);
    }

    const cap = agent.maxForce * 2.2;
    const mag = Math.hypot(fx, fy);
    if (mag > cap) {
      fx = (fx / mag) * cap;
      fy = (fy / mag) * cap;
    }

    agent.vx += fx * dt;
    agent.vy += fy * dt;
    const speed = Math.hypot(agent.vx, agent.vy);
    if (speed > agent.maxSpeed) {
      agent.vx = (agent.vx / speed) * agent.maxSpeed;
      agent.vy = (agent.vy / speed) * agent.maxSpeed;
    }
    const drag = Math.exp(-0.28 * dt);
    agent.vx *= drag;
    agent.vy *= drag;
    agent.x = wrap(agent.x + agent.vx * dt, sim.w);
    agent.y = wrap(agent.y + agent.vy * dt, sim.h);
    agent.rot += agent.spin * dt;
  }

  const stamp = sim.deposit * dt * 60;
  for (let i = 0; i < agents.length; i++) {
    deposit(sim, agents[i].x, agents[i].y, stamp);
  }
  if (sim.hand.on && !sim.hand.repel) {
    depositDisk(sim, sim.hand.x, sim.hand.y, 0.34, stamp * 1.8);
  }
  diffuse(sim, dt);
  sim.inspect = inspectClosest(sim);
}

export function angleAt(sim, x, y) {
  const col = fieldCol(sim, x);
  const row = fieldRow(sim, y);
  let angle = sim.field[row * sim.fCols + col];
  if (sim.hand.on) {
    const dx = toroidal(x - sim.hand.x, sim.w);
    const dy = toroidal(y - sim.hand.y, sim.h);
    const dist = Math.hypot(dx, dy);
    if (dist < sim.hand.radius && dist > 0.0001) {
      const influence = 1 - dist / sim.hand.radius;
      const outward = Math.atan2(dy, dx);
      const target = sim.hand.repel ? outward : outward + Math.PI / 2;
      angle = lerpAngle(angle, target, influence * 0.92);
    }
  }
  if (sim.agrio) {
    const stepAngle = Math.PI / 4;
    const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
    angle = Math.round(wrapped / stepAngle) * stepAngle;
  }
  return angle;
}

function senseTrail(sim, agent, dt) {
  const ahead = sim.sensorDist;
  const side = sim.sensorAngle;
  agent.trailC = sampleTrail(sim, agent.x + Math.cos(agent.heading) * ahead, agent.y + Math.sin(agent.heading) * ahead);
  agent.trailL = sampleTrail(
    sim,
    agent.x + Math.cos(agent.heading + side) * ahead,
    agent.y + Math.sin(agent.heading + side) * ahead,
  );
  agent.trailR = sampleTrail(
    sim,
    agent.x + Math.cos(agent.heading - side) * ahead,
    agent.y + Math.sin(agent.heading - side) * ahead,
  );
  const center = agent.trailC;
  const left = agent.trailL;
  const right = agent.trailR;
  let turn = 0;
  if (center < left && center < right) turn = rand(sim) < 0.5 ? 1 : -1;
  else if (left > center && left >= right) turn = 1;
  else if (right > center && right > left) turn = -1;
  agent.heading += turn * sim.rotationSpeed * dt;
}

function flockForce(sim, index) {
  const agent = sim.agents[index];
  const radius = sim.perception;
  const radiusSq = radius * radius;
  let sepX = 0;
  let sepY = 0;
  let aliX = 0;
  let aliY = 0;
  let cohX = 0;
  let cohY = 0;
  let count = 0;
  for (let j = 0; j < sim.agents.length; j++) {
    if (j === index) continue;
    const other = sim.agents[j];
    const dx = toroidal(other.x - agent.x, sim.w);
    const dy = toroidal(other.y - agent.y, sim.h);
    const distSq = dx * dx + dy * dy;
    if (distSq > radiusSq || distSq < 1e-8) continue;
    const dist = Math.sqrt(distSq);
    count += 1;
    sepX -= dx / dist / dist;
    sepY -= dy / dist / dist;
    aliX += other.vx;
    aliY += other.vy;
    cohX += dx;
    cohY += dy;
  }
  agent.neighbors = count;
  if (!count) return [0, 0];
  // La separación crece cuando el otro recorte está encima.
  // No se normaliza: la distancia tiene que notarse.
  sepX /= count;
  sepY /= count;
  let fx = sepX * 0.45;
  let fy = sepY * 0.45;
  const ali = setMag(aliX, aliY, agent.maxSpeed);
  fx += (ali[0] - agent.vx) * 0.75;
  fy += (ali[1] - agent.vy) * 0.75;
  const coh = setMag(cohX, cohY, agent.maxSpeed);
  fx += (coh[0] - agent.vx) * 0.5;
  fy += (coh[1] - agent.vy) * 0.5;
  return clampVec(fx, fy, agent.maxForce);
}

export function countNeighbors(sim, index) {
  const agent = sim.agents[index];
  const radiusSq = sim.perception * sim.perception;
  let count = 0;
  for (let j = 0; j < sim.agents.length; j++) {
    if (j === index) continue;
    const other = sim.agents[j];
    const dx = toroidal(other.x - agent.x, sim.w);
    const dy = toroidal(other.y - agent.y, sim.h);
    if (dx * dx + dy * dy <= radiusSq) count += 1;
  }
  return count;
}

function inspectClosest(sim) {
  let index = 0;
  if (sim.hand.on) {
    let best = Infinity;
    for (let i = 0; i < sim.agents.length; i++) {
      const agent = sim.agents[i];
      const dx = toroidal(agent.x - sim.hand.x, sim.w);
      const dy = toroidal(agent.y - sim.hand.y, sim.h);
      const dist = dx * dx + dy * dy;
      if (dist < best) {
        best = dist;
        index = i;
      }
    }
  }
  const agent = sim.agents[index];
  const handDist = sim.hand.on
    ? Math.hypot(toroidal(agent.x - sim.hand.x, sim.w), toroidal(agent.y - sim.hand.y, sim.h))
    : Infinity;
  return {
    index,
    flowAngle: agent.flowAngle,
    trailL: agent.trailL,
    trailC: agent.trailC,
    trailR: agent.trailR,
    neighbors: agent.neighbors,
    seesHand: handDist < sim.hand.radius,
  };
}

function depositDisk(sim, x, y, radius, amount) {
  deposit(sim, x, y, amount);
  for (let k = 0; k < 8; k++) {
    const angle = (k / 8) * Math.PI * 2;
    deposit(sim, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, amount * 0.45);
  }
}

function deposit(sim, x, y, amount) {
  const index = trailIndex(sim, x, y);
  sim.trail[index] = Math.min(1.4, sim.trail[index] + amount);
}

export function sampleTrail(sim, x, y) {
  return sim.trail[trailIndex(sim, x, y)];
}

function trailIndex(sim, x, y) {
  let u = x / sim.w;
  let v = y / sim.h;
  u -= Math.floor(u);
  v -= Math.floor(v);
  const col = Math.min(sim.cols - 1, Math.floor(u * sim.cols));
  const row = Math.min(sim.rows - 1, Math.floor(v * sim.rows));
  return row * sim.cols + col;
}

function diffuse(sim, dt) {
  const src = sim.trail;
  const dst = sim.trailBuf;
  const w = sim.cols;
  const h = sim.rows;
  const keep = Math.pow(sim.decay, dt * 60);
  for (let y = 0; y < h; y++) {
    const y0 = ((y - 1 + h) % h) * w;
    const y1 = y * w;
    const y2 = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const x0 = (x - 1 + w) % w;
      const x2 = (x + 1) % w;
      const sum =
        src[y0 + x0] + src[y0 + x] + src[y0 + x2] +
        src[y1 + x0] + src[y1 + x] + src[y1 + x2] +
        src[y2 + x0] + src[y2 + x] + src[y2 + x2];
      dst[y1 + x] = (sum / 9) * keep;
    }
  }
  sim.trail = dst;
  sim.trailBuf = src;
}

function fieldCol(sim, x) {
  let u = x / sim.w;
  u -= Math.floor(u);
  return Math.min(sim.fCols - 1, Math.floor(u * sim.fCols));
}

function fieldRow(sim, y) {
  let v = y / sim.h;
  v -= Math.floor(v);
  return Math.min(sim.fRows - 1, Math.floor(v * sim.fRows));
}

function steerTo(agent, desiredX, desiredY) {
  return clampVec(desiredX - agent.vx, desiredY - agent.vy, agent.maxForce);
}

function setMag(x, y, mag) {
  const len = Math.hypot(x, y);
  if (len < 1e-8) return [0, 0];
  return [(x / len) * mag, (y / len) * mag];
}

function clampVec(x, y, max) {
  const len = Math.hypot(x, y);
  if (len > max && len > 0) return [(x / len) * max, (y / len) * max];
  return [x, y];
}

export function toroidal(delta, size) {
  const half = size * 0.5;
  if (delta > half) return delta - size;
  if (delta < -half) return delta + size;
  return delta;
}

function wrap(value, size) {
  value %= size;
  if (value < 0) value += size;
  return value;
}

function lerpAngle(a, b, t) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

function rand(sim) {
  sim.rng = (Math.imul(sim.rng, 1664525) + 1013904223) >>> 0;
  return sim.rng / 4294967296;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
