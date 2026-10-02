import { seedNoise, simplex2 } from "./noise.js";

// Cada recorte es un vehículo (Reynolds / Nature of Code).
// Percibe poco, calcula una fuerza y no hay un líder.
//
// Campo: lee solo el ángulo de la celda bajo sus pies.
// Pegamento: el recorte huele tres puntos del rastro y gira hacia el más fuerte.
// Grupo: solo cuenta recortes dentro de su radio.
// Mano: no es un jefe. Dobla el campo cerca del cursor.
//       Sin clic, alimenta el moho. Con clic, abre la mancha y el campo apunta hacia afuera.
//
// El moho es otra población. No usa el campo ni el grupo.
// Jeff Jones: tres sensores, gira al más fuerte, avanza, deja olor.
// El olor se difumina y se apaga, para que un estado nuevo pueda nacer.
// Lo que se ve no es ese olor: es el trazo de las partículas, fino y quieto,
// hasta que cambias de estado. Los números de cada estado son de esta pieza.

// Polvo, ladrillo, zinc, nicotina, grasa. El rosa y el violeta de fotocopia son escasos.
export const PALETTE = [
  [0.48, 0.28, 0.2],
  [0.55, 0.46, 0.26],
  [0.58, 0.34, 0.38],
  [0.66, 0.6, 0.46],
  [0.42, 0.14, 0.13],
  [0.32, 0.28, 0.48],
  [0.14, 0.12, 0.1],
  [0.34, 0.38, 0.28],
  [0.4, 0.38, 0.35],
];

const DIRT = [0, 0, 1, 1, 3, 3, 6, 6, 7, 8, 8, 8, 4, 2, 5];

// Distancias en pixeles del mapa. Ángulos en radianes.
// sd/sa/ra/md = base + ganancia * (tinta ^ curva).
export const MOLD_POINTS = [
  {
    name: "red",
    sd0: 8, sd1: 3, sdP: 1,
    sa0: 0.55, sa1: 0.2, saP: 1,
    ra0: 0.4, ra1: 0.1, raP: 1,
    md0: 1, md1: 0, mdP: 1,
    ahead: 1, ink: 0.16, life: 0,
  },
  {
    name: "nudos",
    sd0: 6, sd1: -2.5, sdP: 1,
    sa0: 1.05, sa1: 0.15, saP: 1,
    ra0: 0.85, ra1: 0.1, raP: 1,
    md0: 0.62, md1: 0, mdP: 1,
    ahead: 1, ink: 0.14, life: 0,
  },
  {
    name: "cordones",
    sd0: 20, sd1: -3, sdP: 1,
    sa0: 0.34, sa1: 0.1, saP: 1,
    ra0: 0.16, ra1: 0.04, raP: 1,
    md0: 1.7, md1: 0.15, mdP: 1,
    ahead: 4, ink: 0.12, life: 0,
  },
  {
    name: "ramas",
    sd0: 30, sd1: 2, sdP: 1,
    sa0: 0.14, sa1: 0.05, saP: 1,
    ra0: 0.09, ra1: 0.03, raP: 1,
    md0: 2.1, md1: 0, mdP: 1,
    ahead: 6, ink: 0.1, life: 0,
  },
];

export function createSim(options = {}) {
  const seed = options.seed ?? 20250310;
  const sim = {
    w: 16,
    h: 9,
    cols: 480,
    rows: 270,
    fCols: 80,
    fRows: 45,
    count: options.count ?? 90,
    moldCount: options.moldCount ?? (options.count == null ? 42000 : 0),
    moldPoint: options.moldPoint ?? 0,
    spread: 0.35,
    figureKeep: 0.975,
    flowWeight: 0.9,
    physWeight: 0.65,
    flockWeight: 0.45,
    noiseScale: 0.07,
    decay: 0.84,
    perception: 0.92,
    sensorDist: 0.78,
    sensorAngle: 0.62,
    rotationSpeed: 3.6,
    deposit: 0.03,
    agrio: false,
    listen: false,
    pulse: 0,
    highs: 0,
    fieldSeed: seed >>> 0,
    rng: seed >>> 0,
    hand: { on: false, x: 8, y: 4.5, repel: false, radius: 1.75 },
    agents: [],
    inspect: null,
  };
  sim.invW = 1 / sim.w;
  sim.invH = 1 / sim.h;
  sim.trail = new Float32Array(sim.cols * sim.rows);
  sim.trailBuf = new Float32Array(sim.cols * sim.rows);
  sim.figure = new Float32Array(sim.cols * sim.rows);
  sim.field = new Float32Array(sim.fCols * sim.fRows);
  rebuildField(sim);
  sim.moldX = new Float32Array(sim.moldCount);
  sim.moldY = new Float32Array(sim.moldCount);
  sim.moldH = new Float32Array(sim.moldCount);
  for (let i = 0; i < sim.count; i++) sim.agents.push(makeAgent(sim));
  for (let i = 0; i < sim.moldCount; i++) {
    sim.moldX[i] = rand(sim) * sim.w;
    sim.moldY[i] = rand(sim) * sim.h;
    sim.moldH[i] = rand(sim) * Math.PI * 2;
  }
  return sim;
}

export function setMoldPoint(sim, index) {
  const count = MOLD_POINTS.length;
  sim.moldPoint = ((index % count) + count) % count;
  sim.trail.fill(0);
  const figure = sim.figure;
  for (let i = 0; i < figure.length; i++) figure[i] *= 0.08;
  const headings = sim.moldH;
  for (let i = 0; i < headings.length; i++) headings[i] = rand(sim) * Math.PI * 2;
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
    sx = size * lerp(1.4, 2.4, rand(sim));
    sy = size * lerp(0.22, 0.55, rand(sim));
  } else if (kind === 2) {
    sx = size * lerp(0.7, 1.3, rand(sim));
    sy = size * lerp(0.65, 1.25, rand(sim));
  } else if (kind === 3) {
    sx = size * lerp(1.1, 1.8, rand(sim));
    sy = size * lerp(0.7, 1.3, rand(sim));
  } else {
    sx *= lerp(0.7, 1.5, rand(sim));
    sy *= lerp(0.55, 1.4, rand(sim));
  }

  const colorIndex = DIRT[Math.floor(rand(sim) * DIRT.length)];
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
    spin: (rand(sim) - 0.5) * 0.85,
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
  sim.figure.fill(0);
}

export function step(sim, dt) {
  const agents = sim.agents;
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    senseTrail(sim, agent, dt, sim.rotationSpeed);
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

  stepMold(sim, dt);
  const stamp = sim.deposit * dt * 60;
  for (let i = 0; i < agents.length; i++) {
    deposit(sim, agents[i].x, agents[i].y, stamp);
  }
  if (sim.hand.on && !sim.hand.repel) {
    depositDisk(sim, sim.hand.x, sim.hand.y, 0.22, 0.7);
    paintDisk(sim, sim.hand.x, sim.hand.y, 0.16, (index) => {
      sim.figure[index] = Math.min(1.6, sim.figure[index] + 0.9);
    });
  }
  if (sim.hand.on && sim.hand.repel) {
    eraseDisk(sim, sim.hand.x, sim.hand.y, 0.5);
  }
  diffuse(sim, dt);
  fadeFigure(sim, dt);
  sim.inspect = inspectClosest(sim);
}

// La tinta bajo el agente cambia sensor, giro y paso. Luego huele tres puntos.
export function moldGlance(sim, index, point = MOLD_POINTS[sim.moldPoint] || MOLD_POINTS[0]) {
  const px = sim.w / sim.cols;
  const heading = sim.moldH[index];
  const ahead = point.ahead * px;
  const stain = Math.min(
    1,
    sampleTrail(sim, sim.moldX[index] + Math.cos(heading) * ahead, sim.moldY[index] + Math.sin(heading) * ahead),
  );
  const sd = Math.max(px, (point.sd0 + point.sd1 * Math.pow(stain, point.sdP)) * px);
  const sa = Math.max(0.05, point.sa0 + point.sa1 * Math.pow(stain, point.saP));
  const ra = Math.max(0.02, point.ra0 + point.ra1 * Math.pow(stain, point.raP));
  const md = Math.max(px * 0.25, (point.md0 + point.md1 * Math.pow(stain, point.mdP)) * px);
  return { stain, sd, sa, ra, md };
}

function stepMold(sim, dt) {
  const n = sim.moldCount;
  if (!n) return;
  const frames = dt * 60;
  const point = MOLD_POINTS[sim.moldPoint] || MOLD_POINTS[0];
  const xs = sim.moldX;
  const ys = sim.moldY;
  const hs = sim.moldH;
  const trail = sim.trail;
  const figure = sim.figure;
  const cols = sim.cols;
  const rows = sim.rows;
  const invW = sim.invW;
  const invH = sim.invH;
  const px = sim.w / cols;
  const loud = sim.listen ? Math.min(1, Math.max(0, sim.pulse || 0)) : 0;
  const cry = sim.listen ? Math.min(1, Math.max(0, sim.highs || 0)) : 0;
  const ink = point.ink * frames * (sim.listen ? 0.7 + loud * 0.9 : 1);
  const drawAdd = 0.72 + loud * 0.85;
  const shiver = cry * 1.45 * frames;
  const wobbleReach = cry * px * 7;
  const repel = sim.hand.on && sim.hand.repel;
  const handX = sim.hand.x;
  const handY = sim.hand.y;
  const radius = sim.hand.radius;
  const worldW = sim.w;
  const worldH = sim.h;
  const sd0 = point.sd0;
  const sd1 = point.sd1;
  const sdP = point.sdP;
  const sa0 = point.sa0;
  const sa1 = point.sa1;
  const saP = point.saP;
  const ra0 = point.ra0;
  const ra1 = point.ra1;
  const raP = point.raP;
  const md0 = point.md0;
  const md1 = point.md1;
  const mdP = point.mdP;
  const aheadPx = point.ahead * px;

  for (let i = 0; i < n; i++) {
    let x = xs[i];
    let y = ys[i];
    let heading = hs[i];
    const cosH = Math.cos(heading);
    const sinH = Math.sin(heading);
    const stain = Math.min(1, trail[cellOf(x + cosH * aheadPx, y + sinH * aheadPx)]);
    const sd = Math.max(px, (sd0 + sd1 * Math.pow(stain, sdP)) * px);
    const sa = Math.max(0.05, sa0 + sa1 * Math.pow(stain, saP)) * (1 + cry * 1.15);
    const ra = Math.max(0.02, ra0 + ra1 * Math.pow(stain, raP));
    const md = Math.max(px * 0.25, (md0 + md1 * Math.pow(stain, mdP)) * px);
    const center = trail[cellOf(x + cosH * sd, y + sinH * sd)];
    const left = trail[cellOf(x + Math.cos(heading + sa) * sd, y + Math.sin(heading + sa) * sd)];
    const right = trail[cellOf(x + Math.cos(heading - sa) * sd, y + Math.sin(heading - sa) * sd)];
    let turn = 0;
    if (center < left && center < right) turn = rand(sim) < 0.5 ? 1 : -1;
    else if (left > center && left >= right) turn = 1;
    else if (right > center && right > left) turn = -1;
    heading += turn * ra * frames;
    if (shiver > 0) heading += (rand(sim) - 0.5) * shiver;
    if (repel) {
      let dx = x - handX;
      let dy = y - handY;
      if (dx > worldW * 0.5) dx -= worldW;
      else if (dx < -worldW * 0.5) dx += worldW;
      if (dy > worldH * 0.5) dy -= worldH;
      else if (dy < -worldH * 0.5) dy += worldH;
      const dist = Math.hypot(dx, dy);
      if (dist < radius && dist > 0.0001) heading = Math.atan2(dy, dx);
    }
    x += Math.cos(heading) * md * frames;
    y += Math.sin(heading) * md * frames;
    x %= worldW;
    if (x < 0) x += worldW;
    y %= worldH;
    if (y < 0) y += worldH;
    const gasp = cry > 0.28 && rand(sim) < cry * 0.4;
    if (!gasp) {
      const cell = cellOf(x, y);
      const scent = trail[cell] + ink;
      trail[cell] = scent > 1.4 ? 1.4 : scent;
      const drawn = figure[cell] + drawAdd;
      figure[cell] = drawn > 1.6 ? 1.6 : drawn;
      if (wobbleReach > px) {
        const side = (rand(sim) - 0.5) * wobbleReach;
        const wx = x + Math.cos(heading + 1.5708) * side;
        const wy = y + Math.sin(heading + 1.5708) * side;
        const mark = cellOf(wx, wy);
        const shaken = figure[mark] + drawAdd * 0.85;
        figure[mark] = shaken > 1.6 ? 1.6 : shaken;
      }
    }
    xs[i] = x;
    ys[i] = y;
    hs[i] = heading;
  }

  function cellOf(x, y) {
    let u = x * invW;
    let v = y * invH;
    u -= Math.floor(u);
    v -= Math.floor(v);
    const col = u * cols;
    const row = v * rows;
    return ((row < rows ? row : rows - 1) | 0) * cols + ((col < cols ? col : cols - 1) | 0);
  }
}

function fadeFigure(sim, dt) {
  const keep = Math.pow(sim.figureKeep, dt * 60);
  const figure = sim.figure;
  for (let i = 0; i < figure.length; i++) figure[i] *= keep;
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

function senseTrail(sim, agent, dt, turnSpeed) {
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
  agent.heading += turn * turnSpeed * dt;
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
  if (!sim.agents.length) return null;
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
  paintDisk(sim, x, y, radius, (index) => {
    sim.trail[index] = Math.min(1.6, sim.trail[index] + amount);
  });
}

function eraseDisk(sim, x, y, radius) {
  paintDisk(sim, x, y, radius, (index) => {
    sim.trail[index] *= 0.08;
    sim.figure[index] *= 0.05;
  });
}

function paintDisk(sim, x, y, radius, apply) {
  const reach = Math.max(1, Math.ceil((radius / sim.w) * sim.cols));
  const center = trailIndex(sim, x, y);
  const col0 = center % sim.cols;
  const row0 = Math.floor(center / sim.cols);
  const reachSq = reach * reach;
  for (let oy = -reach; oy <= reach; oy++) {
    for (let ox = -reach; ox <= reach; ox++) {
      if (ox * ox + oy * oy > reachSq) continue;
      const col = (col0 + ox + sim.cols) % sim.cols;
      const row = (row0 + oy + sim.rows) % sim.rows;
      apply(row * sim.cols + col);
    }
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
      const blurred = sum / 9;
      const center = src[y1 + x];
      dst[y1 + x] = (center + (blurred - center) * sim.spread) * keep;
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
