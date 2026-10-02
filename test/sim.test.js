import assert from "node:assert/strict";
import { angleAt, countNeighbors, createSim, lowOnset, moldGlance, sampleTrail, setMoldPoint, step } from "../site/src/sim.js";

const dt = 1 / 60;

test("el campo empuja hacia el ángulo de la celda", () => {
  const sim = createSim({ count: 1, seed: 1 });
  sim.flowWeight = 1;
  sim.physWeight = 0;
  sim.flockWeight = 0;
  sim.field.fill(0);
  sim.hand.on = false;
  const agent = sim.agents[0];
  agent.x = 8;
  agent.y = 4.5;
  agent.vx = 0;
  agent.vy = 0;
  for (let i = 0; i < 180; i++) step(sim, dt);
  assert.ok(agent.vx > 0.35, `vx=${agent.vx}`);
  assert.ok(Math.abs(agent.vy) < 0.3, `vy=${agent.vy}`);
});

test("si el pegamento está apagado, el olfato no mueve al recorte", () => {
  const sim = createSim({ count: 1, seed: 4 });
  sim.flowWeight = 0;
  sim.physWeight = 0;
  sim.flockWeight = 0;
  const agent = sim.agents[0];
  agent.x = 8;
  agent.y = 4.5;
  agent.vx = 0.4;
  agent.vy = 0;
  agent.heading = Math.PI / 2;
  for (let i = 0; i < 30; i++) step(sim, dt);
  assert.ok(Math.abs(agent.vy) < 0.08, `vy=${agent.vy}`);
});

test("Physarum gira hacia el rastro más fuerte", () => {
  const sim = createSim({ count: 1, seed: 2 });
  sim.flowWeight = 0;
  sim.physWeight = 1;
  sim.flockWeight = 0;
  const agent = sim.agents[0];
  agent.x = 8;
  agent.y = 4.5;
  agent.vx = 0;
  agent.vy = 0;
  agent.heading = 0;
  const leftX = agent.x + Math.cos(sim.sensorAngle) * sim.sensorDist;
  const leftY = agent.y + Math.sin(sim.sensorAngle) * sim.sensorDist;
  paint(sim, leftX, leftY);
  assert.ok(sampleTrail(sim, leftX, leftY) > 0.5);
  const before = agent.heading;
  step(sim, dt);
  assert.ok(agent.heading > before, `heading ${before} -> ${agent.heading}`);
});

test("dos recortes muy cerca se separan", () => {
  const sim = createSim({ count: 2, seed: 3 });
  sim.flowWeight = 0;
  sim.physWeight = 0;
  sim.flockWeight = 1.6;
  sim.perception = 2;
  const a = sim.agents[0];
  const b = sim.agents[1];
  a.x = 8;
  a.y = 4.5;
  a.vx = 0;
  a.vy = 0;
  b.x = 8.22;
  b.y = 4.5;
  b.vx = 0;
  b.vy = 0;
  for (let i = 0; i < 90; i++) step(sim, dt);
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  assert.ok(dist > 0.4, `dist=${dist}`);
});

test("un recorte lejos del radio no se percibe", () => {
  const sim = createSim({ count: 2, seed: 5 });
  sim.perception = 0.6;
  sim.agents[0].x = 3;
  sim.agents[0].y = 4.5;
  sim.agents[1].x = 12;
  sim.agents[1].y = 4.5;
  assert.equal(countNeighbors(sim, 0), 0);
  sim.perception = 10;
  assert.equal(countNeighbors(sim, 0), 1);
});

test("agrio cuaja el ángulo del campo en pasos de 45 grados", () => {
  const sim = createSim({ count: 1, seed: 6 });
  sim.agrio = true;
  sim.hand.on = false;
  sim.field[0] = 0.7;
  const angle = angleAt(sim, 0.01, 0.01);
  assert.ok(Math.abs(angle - Math.PI / 4) < 0.001, `angle=${angle}`);
});

test("el moho gira hacia la mancha más fuerte", () => {
  const sim = createSim({ count: 0, moldCount: 1, seed: 9 });
  sim.moldX[0] = 8;
  sim.moldY[0] = 4.5;
  sim.moldH[0] = 0;
  const look = moldGlance(sim, 0);
  const leftX = 8 + Math.cos(look.sa) * look.sd;
  const leftY = 4.5 + Math.sin(look.sa) * look.sd;
  paint(sim, leftX, leftY);
  const before = sim.moldH[0];
  step(sim, dt);
  assert.ok(sim.moldH[0] > before, `heading ${before} -> ${sim.moldH[0]}`);
});

test("la tinta local acorta el sensor de los nudos", () => {
  const sim = createSim({ count: 0, moldCount: 1, moldPoint: 1, seed: 12 });
  sim.moldX[0] = 8;
  sim.moldY[0] = 4.5;
  sim.moldH[0] = 0;
  const bare = moldGlance(sim, 0).sd;
  const px = sim.w / sim.cols;
  paint(sim, 8 + px, 4.5);
  const fed = moldGlance(sim, 0).sd;
  assert.ok(fed < bare - px * 0.5, `bare ${bare} fed ${fed}`);
});

test("cambiar de estado borra el olor y deja el trazo casi vacío", () => {
  const sim = createSim({ count: 0, moldCount: 4, seed: 13 });
  sim.trail[10] = 1;
  sim.figure[10] = 1;
  const before = sim.moldH[0];
  setMoldPoint(sim, 2);
  assert.equal(sim.moldPoint, 2);
  assert.equal(sim.trail[10], 0);
  assert.ok(sim.figure[10] < 0.1);
  assert.notEqual(sim.moldH[0], before);
});

test("si el volumen está alto, el trazo del moho ocupa más", () => {
  function cover(pulse) {
    const sim = createSim({ count: 0, moldCount: 60, seed: 21 });
    sim.listen = true;
    sim.pulse = pulse;
    sim.figureKeep = 0.99;
    for (let i = 0; i < 30; i++) step(sim, dt);
    let cells = 0;
    for (const value of sim.figure) if (value >= 0.75) cells += 1;
    return cells;
  }
  const quiet = cover(0);
  const loud = cover(1);
  assert.ok(loud > quiet, `quiet ${quiet} loud ${loud}`);
});

test("los agudos hacen temblar el rumbo del moho", () => {
  const sim = createSim({ count: 0, moldCount: 1, seed: 3 });
  sim.listen = true;
  sim.highs = 1;
  sim.moldX[0] = 8;
  sim.moldY[0] = 4.5;
  sim.moldH[0] = 0;
  let wander = 0;
  for (let i = 0; i < 6; i++) {
    const before = sim.moldH[0];
    step(sim, dt);
    wander += Math.abs(sim.moldH[0] - before);
  }
  assert.ok(wander > 1.2, `wander ${wander}`);
});

test("un tono quieto no es golpe, una subida sí", () => {
  assert.equal(lowOnset(0.4, 0.4), 0);
  assert.equal(lowOnset(0.42, 0.4), 0);
  assert.ok(lowOnset(0.7, 0.2) > 0.9, `onset ${lowOnset(0.7, 0.2)}`);
});

test("el golpe empuja la vena más lejos que el reposo", () => {
  function travel(hit) {
    const sim = createSim({ count: 0, moldCount: 1, seed: 3 });
    sim.listen = true;
    sim.hit = hit;
    sim.moldX[0] = 8;
    sim.moldY[0] = 4.5;
    sim.moldH[0] = 0;
    let dist = 0;
    for (let i = 0; i < 8; i++) {
      const x0 = sim.moldX[0];
      const y0 = sim.moldY[0];
      step(sim, dt);
      dist += Math.hypot(sim.moldX[0] - x0, sim.moldY[0] - y0);
    }
    return dist;
  }
  const calm = travel(0);
  const punched = travel(1);
  assert.ok(punched > calm * 2, `calm ${calm} punched ${punched}`);
});

test("el clic abre un hueco en la mancha", () => {
  const sim = createSim({ count: 0, moldCount: 0, seed: 11 });
  sim.hand.on = true;
  sim.hand.repel = true;
  sim.hand.x = 8;
  sim.hand.y = 4.5;
  paint(sim, 8, 4.5);
  step(sim, dt);
  assert.ok(sampleTrail(sim, 8, 4.5) < 0.25, `trail=${sampleTrail(sim, 8, 4.5)}`);
});

function paint(sim, x, y) {
  const u = x / sim.w;
  const v = y / sim.h;
  const col = Math.min(sim.cols - 1, Math.floor((u - Math.floor(u)) * sim.cols));
  const row = Math.min(sim.rows - 1, Math.floor((v - Math.floor(v)) * sim.rows));
  sim.trail[row * sim.cols + col] = 1;
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    console.error(`falló  ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}
