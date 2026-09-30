import * as THREE from "three";
import { PALETTE, clearTrail, createSim, rebuildField, reseedField, step } from "./sim.js";

const sim = createSim();
linkPerformance(sim);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x1a1411, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 30);
camera.position.z = 10;

const page = new THREE.Mesh(
  new THREE.PlaneGeometry(14.5, 8.1),
  new THREE.MeshBasicMaterial({ map: makePageTexture() }),
);
page.position.z = -0.12;
scene.add(page);

const trailData = new Uint8Array(sim.cols * sim.rows * 4);
const trailTexture = new THREE.DataTexture(trailData, sim.cols, sim.rows, THREE.RGBAFormat);
trailTexture.colorSpace = THREE.SRGBColorSpace;
trailTexture.magFilter = THREE.LinearFilter;
trailTexture.minFilter = THREE.LinearFilter;
trailTexture.needsUpdate = true;

const trail = new THREE.Mesh(
  new THREE.PlaneGeometry(sim.w, sim.h),
  new THREE.MeshBasicMaterial({ map: trailTexture, transparent: true, depthWrite: false }),
);
trail.position.z = -0.05;
scene.add(trail);

const textures = [0, 1, 2, 3, 4].map((kind) => makeCutoutTexture(kind));
const buckets = [[], [], [], [], []];
for (const agent of sim.agents) buckets[agent.kind].push(agent);

const color = new THREE.Color();
const dummy = new THREE.Object3D();
const meshes = buckets.map((list, kind) => {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: textures[kind], alphaTest: 0.45 }),
    list.length,
  );
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  list.forEach((agent, index) => {
    const rgb = PALETTE[agent.colorIndex];
    mesh.setColorAt(index, color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace));
  });
  scene.add(mesh);
  return mesh;
});

const hud = document.getElementById("hud");
const grain = document.getElementById("grain");
const grainCtx = grain.getContext("2d", { alpha: true });
const grainImage = grainCtx.createImageData(grain.width, grain.height);
const held = new Set();
let agrioMix = 0;
let viewW = 16;
let viewH = 9;
let noiseDirty = false;

const clock = new THREE.Clock();
resize();
window.addEventListener("resize", resize);
window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", (event) => held.delete(event.key.toLowerCase()));
window.addEventListener("pointermove", onPointer);
window.addEventListener("pointerdown", (event) => {
  if (event.button === 0) sim.hand.repel = true;
});
window.addEventListener("pointerup", () => {
  sim.hand.repel = false;
});
window.addEventListener("pointerleave", () => {
  sim.hand.on = false;
  sim.hand.repel = false;
});
window.addEventListener("blur", () => held.clear());

requestAnimationFrame(frame);

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  applyHeld(dt);
  if (noiseDirty) {
    rebuildField(sim);
    noiseDirty = false;
  }
  step(sim, dt);
  agrioMix += ((sim.agrio ? 1 : 0) - agrioMix) * Math.min(1, dt * 3.5);
  writeTrail();
  updatePieces();
  renderer.render(scene, camera);
  drawGrain();
  if (!hud.classList.contains("hidden")) hud.innerHTML = hudHtml();
}

function applyHeld(dt) {
  const previousScale = sim.noiseScale;
  if (held.has("q")) sim.flowWeight = clamp(sim.flowWeight + 0.55 * dt, 0, 2);
  if (held.has("a")) sim.flowWeight = clamp(sim.flowWeight - 0.55 * dt, 0, 2);
  if (held.has("t")) sim.noiseScale = clamp(sim.noiseScale + 0.045 * dt, 0.02, 0.28);
  if (held.has("g")) sim.noiseScale = clamp(sim.noiseScale - 0.045 * dt, 0.02, 0.28);
  if (held.has("w")) sim.physWeight = clamp(sim.physWeight + 0.55 * dt, 0, 2);
  if (held.has("s")) sim.physWeight = clamp(sim.physWeight - 0.55 * dt, 0, 2);
  if (held.has("e")) sim.flockWeight = clamp(sim.flockWeight + 0.55 * dt, 0, 2);
  if (held.has("d")) sim.flockWeight = clamp(sim.flockWeight - 0.55 * dt, 0, 2);
  linkPerformance(sim);
  if (sim.noiseScale !== previousScale) noiseDirty = true;
}

function linkPerformance(current) {
  const glue = clamp(current.physWeight, 0, 2) / 2;
  const group = clamp(current.flockWeight, 0, 2) / 2;
  current.decay = 0.78 + glue * 0.19;
  current.perception = 0.4 + group * 2.3;
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if ("qatgwsed".includes(key)) event.preventDefault();
  if (event.repeat && !"qatgwsed".includes(key)) return;
  held.add(key);
  if (key === "z" && !event.repeat) sim.agrio = !sim.agrio;
  if (key === "r" && !event.repeat) reseedField(sim);
  if (key === "c" && !event.repeat) clearTrail(sim);
  if (key === "h" && !event.repeat) hud.classList.toggle("hidden");
  if (key === "f" && !event.repeat) toggleFullscreen();
}

function onPointer(event) {
  const x = (event.clientX / window.innerWidth) * viewW - viewW / 2 + sim.w / 2;
  const y = (1 - event.clientY / window.innerHeight) * viewH - viewH / 2 + sim.h / 2;
  const inside = x >= 0 && x <= sim.w && y >= 0 && y <= sim.h;
  sim.hand.on = inside;
  sim.hand.x = x;
  sim.hand.y = y;
}

function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  const worldAspect = sim.w / sim.h;
  if (aspect > worldAspect) {
    viewH = sim.h;
    viewW = sim.h * aspect;
  } else {
    viewW = sim.w;
    viewH = sim.w / aspect;
  }
  camera.left = -viewW / 2;
  camera.right = viewW / 2;
  camera.top = viewH / 2;
  camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function writeTrail() {
  const warm = [186, 96, 42];
  const cold = [46, 148, 156];
  const t = agrioMix;
  for (let i = 0; i < sim.trail.length; i++) {
    const value = Math.min(1, sim.trail[i]);
    const alpha = Math.pow(value, 0.58);
    const pixel = i * 4;
    trailData[pixel] = warm[0] + (cold[0] - warm[0]) * t;
    trailData[pixel + 1] = warm[1] + (cold[1] - warm[1]) * t;
    trailData[pixel + 2] = warm[2] + (cold[2] - warm[2]) * t;
    trailData[pixel + 3] = Math.floor(alpha * 220);
  }
  trailTexture.needsUpdate = true;
}

function updatePieces() {
  const cyan = [0.28, 0.7, 0.74];
  buckets.forEach((list, kind) => {
    const mesh = meshes[kind];
    if (!mesh) return;
    for (let i = 0; i < list.length; i++) {
      const agent = list[i];
      dummy.position.set(agent.x - sim.w / 2, agent.y - sim.h / 2, agent.z);
      dummy.rotation.set(0, 0, agent.rot);
      dummy.scale.set(agent.sx, agent.sy, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const base = PALETTE[agent.colorIndex];
      color.setRGB(
        base[0] + (cyan[0] - base[0]) * agrioMix,
        base[1] + (cyan[1] - base[1]) * agrioMix,
        base[2] + (cyan[2] - base[2]) * agrioMix,
        THREE.SRGBColorSpace,
      );
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
  grain.style.opacity = String(0.12 + agrioMix * 0.16);
}

function drawGrain() {
  const data = grainImage.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = 118 + Math.random() * 80;
    data[i] = n;
    data[i + 1] = n * 0.96;
    data[i + 2] = n * 0.9;
    data[i + 3] = 255;
  }
  grainCtx.putImageData(grainImage, 0, 0);
}

function hudHtml() {
  const look = sim.inspect;
  const scaleWord =
    sim.noiseScale < 0.05 ? "muy amplia" : sim.noiseScale < 0.09 ? "amplia" : sim.noiseScale < 0.16 ? "media" : "menuda";
  const memory =
    sim.decay > 0.93 ? "la mancha se queda" : sim.decay > 0.85 ? "la mancha dura un rato" : "la mancha se borra pronto";
  return `
    <p class="title">MALUCA — recortes</p>
    <p>La canción va en otra ventana. Este instrumento no la escucha.</p>
    <p>Campo ${word(sim.flowWeight)} (${sim.flowWeight.toFixed(2)}) — las curvas del recuerdo</p>
    <p>Escala ${scaleWord} (${sim.noiseScale.toFixed(2)})</p>
    <p>Pegamento ${word(sim.physWeight)} (${sim.physWeight.toFixed(2)}) — ${memory}</p>
    <p>Grupo ${word(sim.flockWeight)} (${sim.flockWeight.toFixed(2)}) — radio ${sim.perception.toFixed(2)}</p>
    <p>Agrio ${sim.agrio ? "sí: ángulos quebrados, copia fría" : "no: ángulos suaves, colores cálidos"}</p>
    <p class="see">${look ? describe(look) : ""}</p>
    <p class="keys">Mantén: Q/A campo · T/G escala · W/S pegamento · E/D grupo<br>Toques: Z agrio · R otro campo · C borrar mancha · clic aparta · F pantalla · H ocultar</p>
  `;
}

function describe(look) {
  const where = compass(look.flowAngle);
  let smell = "casi no hay pegamento cerca";
  if (look.trailL > look.trailC && look.trailL >= look.trailR) smell = "huele más pegamento a su izquierda";
  else if (look.trailR > look.trailC && look.trailR > look.trailL) smell = "huele más pegamento a su derecha";
  else if (look.trailC >= look.trailL && look.trailC >= look.trailR && look.trailC > 0.03) smell = "el pegamento sigue adelante";
  const others = look.neighbors === 0 ? "no ve a nadie cerca" : `ve ${look.neighbors} recortes cerca`;
  const hand = look.seesHand ? " Nota tu mano." : "";
  return `Este recorte lee el campo hacia ${where}, ${smell} y ${others}.${hand}`;
}

function compass(angle) {
  const dirs = [
    "la derecha",
    "arriba a la derecha",
    "arriba",
    "arriba a la izquierda",
    "la izquierda",
    "abajo a la izquierda",
    "abajo",
    "abajo a la derecha",
  ];
  const cycle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return dirs[Math.round(cycle / (Math.PI / 4)) % 8];
}

function word(value) {
  if (value < 0.35) return "bajo";
  if (value < 0.9) return "medio";
  if (value < 1.45) return "alto";
  return "muy alto";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

function makePageTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const g = canvas.getContext("2d");
  g.fillStyle = "#f3e6c8";
  g.fillRect(0, 0, canvas.width, canvas.height);
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    image.data[i] += n;
    image.data[i + 1] += n * 0.85;
    image.data[i + 2] += n * 0.5;
  }
  g.putImageData(image, 0, 0);
  g.fillStyle = "rgba(196, 140, 70, 0.16)";
  g.beginPath();
  g.ellipse(180, 210, 90, 54, -0.4, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(120, 90, 60, 0.08)";
  g.beginPath();
  g.ellipse(460, 120, 70, 40, 0.5, 0, Math.PI * 2);
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = false;
  return texture;
}

function makeCutoutTexture(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 256, 256);
  if (kind === 1) paintStripes(g);
  if (kind === 2) paintHalftone(g);
  if (kind === 3) paintNewsprint(g);
  if (kind === 4) paintPhoto(g);
  const image = g.getImageData(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const pixel = (y * 256 + x) * 4;
      const u = x / 255;
      const v = y / 255;
      const fiber = (hash(x, y) - 0.5) * 18;
      image.data[pixel] += fiber;
      image.data[pixel + 1] += fiber;
      image.data[pixel + 2] += fiber * 0.7;
      let alpha = 255;
      const edge = Math.min(u, 1 - u, v, 1 - v) + (hash(x * 2, y * 3) - 0.5) * 0.045;
      if (edge < 0.04) alpha = 0;
      if (kind === 2) {
        const dx = u - 0.5;
        const dy = v - 0.5;
        const rim = 0.46 + Math.sin(Math.atan2(dy, dx) * 14) * 0.016;
        if (Math.hypot(dx, dy) > rim) alpha = 0;
      }
      image.data[pixel + 3] = alpha;
    }
  }
  g.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.premultiplyAlpha = false;
  return texture;
}

function paintStripes(g) {
  g.save();
  g.translate(128, 128);
  g.rotate(-0.7);
  for (let x = -280; x < 280; x += 22) {
    g.fillStyle = (x / 22) % 2 === 0 ? "rgba(40, 24, 16, 0.38)" : "rgba(255, 248, 230, 0.55)";
    g.fillRect(x, -280, 11, 560);
  }
  g.restore();
}

function paintHalftone(g) {
  for (let y = 10; y < 256; y += 11) {
    for (let x = 10; x < 256; x += 11) {
      if (hash(x, y) > 0.42) {
        g.fillStyle = "rgba(30, 18, 12, 0.4)";
        g.beginPath();
        g.arc(x, y, 2.3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
}

function paintNewsprint(g) {
  g.fillStyle = "rgba(20, 12, 8, 0.82)";
  g.fillRect(22, 28, 150, 26);
  g.fillStyle = "rgba(20, 12, 8, 0.55)";
  for (let y = 70; y < 230; y += 10) {
    const inset = 22 + Math.floor(hash(0, y) * 18);
    g.fillRect(inset, y, 120 + Math.floor(hash(y, 3) * 70), 3);
  }
}

function paintPhoto(g) {
  g.fillStyle = "#6a635c";
  g.fillRect(28, 28, 200, 200);
  g.fillStyle = "rgba(255, 255, 255, 0.28)";
  g.beginPath();
  g.arc(96, 96, 36, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "rgba(40, 30, 28, 0.35)";
  g.fillRect(48, 150, 150, 46);
}
