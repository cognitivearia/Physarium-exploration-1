import * as THREE from "three";
import { MOLD_POINTS, PALETTE, clearTrail, createSim, rebuildField, reseedField, step } from "./sim.js";

const sim = createSim();
linkPerformance(sim);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0c0b0a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById("app").appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 30);
camera.position.z = 10;

const page = new THREE.Mesh(
  new THREE.PlaneGeometry(14.5, 8.1),
  new THREE.MeshBasicMaterial({ map: makePageTexture(), alphaTest: 0.4 }),
);
page.position.z = -0.12;
scene.add(page);

const trailData = new Uint8Array(sim.cols * sim.rows * 4);
const trailTexture = new THREE.DataTexture(trailData, sim.cols, sim.rows, THREE.RGBAFormat);
trailTexture.colorSpace = THREE.SRGBColorSpace;
trailTexture.magFilter = THREE.NearestFilter;
trailTexture.minFilter = THREE.NearestFilter;
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
  current.decay = 0.9 + glue * 0.08;
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
  if ("1234".includes(key) && !event.repeat) sim.moldPoint = Number(key) - 1;
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
  const cold = [58, 28, 78];
  const t = agrioMix;
  for (let i = 0; i < sim.trail.length; i++) {
    const value = Math.min(1, sim.trail[i]);
    const shown = value < 0.04 ? 0 : Math.pow((value - 0.04) / 0.96, 0.85);
    const pixel = i * 4;
    const grease = 10 + (1 - shown) * 14;
    const r = grease * 1.25;
    const g = grease * 0.82;
    const b = grease * 0.48;
    trailData[pixel] = r + (cold[0] - r) * t;
    trailData[pixel + 1] = g + (cold[1] - g) * t;
    trailData[pixel + 2] = b + (cold[2] - b) * t;
    trailData[pixel + 3] = Math.floor(Math.min(1, shown * 1.25) * 250);
  }
  trailTexture.needsUpdate = true;
}

function updatePieces() {
  const cyan = [0.42, 0.22, 0.55];
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
  grain.style.opacity = String(0.42 + agrioMix * 0.2);
}

function drawGrain() {
  const data = grainImage.data;
  for (let i = 0; i < data.length; i += 4) {
    const roll = Math.random();
    let n = 70 + Math.random() * 50;
    if (roll > 0.982) n = 12;
    else if (roll > 0.965) n = 210;
    data[i] = n;
    data[i + 1] = n * 0.92;
    data[i + 2] = n * 0.84;
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
    <p>Moho ${MOLD_POINTS[sim.moldPoint].name} — 1 red · 2 nudos · 3 cordones · 4 ramas</p>
    <p>La mano hace crecer el moho. El clic lo aparta.</p>
    <p>Campo ${word(sim.flowWeight)} (${sim.flowWeight.toFixed(2)}) — las curvas del recuerdo</p>
    <p>Escala ${scaleWord} (${sim.noiseScale.toFixed(2)})</p>
    <p>Pegamento ${word(sim.physWeight)} (${sim.physWeight.toFixed(2)}) — ${memory}</p>
    <p>Grupo ${word(sim.flockWeight)} (${sim.flockWeight.toFixed(2)}) — radio ${sim.perception.toFixed(2)}</p>
    <p>Agrio ${sim.agrio ? "sí: la copia se quiebra y se pone violeta" : "no: sigue el polvo y el ladrillo"}</p>
    <p class="see">${look ? describe(look) : ""}</p>
    <p class="keys">Mantén: Q/A campo · T/G escala · W/S pegamento · E/D grupo<br>Toques: 1–4 moho · Z agrio · R otro campo · C borrar mancha · clic aparta · F pantalla · H ocultar</p>
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
  g.fillStyle = "#7d7364";
  g.fillRect(0, 0, canvas.width, canvas.height);
  const stains = [
    ["rgba(48, 32, 22, 0.42)", 110, 210, 150, 86],
    ["rgba(28, 26, 24, 0.38)", 430, 80, 170, 96],
    ["rgba(62, 44, 30, 0.3)", 300, 250, 210, 64],
    ["rgba(20, 18, 16, 0.28)", 70, 48, 96, 46],
    ["rgba(55, 48, 36, 0.34)", 520, 240, 120, 70],
  ];
  for (const stain of stains) {
    g.fillStyle = stain[0];
    g.beginPath();
    g.ellipse(stain[1], stain[2], stain[3], stain[4], 0.5, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(28, 22, 16, 0.45)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 148);
  g.bezierCurveTo(180, 132, 420, 188, 640, 156);
  g.stroke();
  g.strokeStyle = "rgba(36, 24, 64, 0.55)";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(36, 36);
  g.quadraticCurveTo(110, 8, 78, 92);
  g.quadraticCurveTo(48, 150, 140, 110);
  g.stroke();
  const image = g.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const pixel = (y * canvas.width + x) * 4;
      const n = (hash(x, y) - 0.5) * 48;
      image.data[pixel] = clampByte(image.data[pixel] + n);
      image.data[pixel + 1] = clampByte(image.data[pixel + 1] + n * 0.85);
      image.data[pixel + 2] = clampByte(image.data[pixel + 2] + n * 0.65);
      const u = x / (canvas.width - 1);
      const v = y / (canvas.height - 1);
      const edge = Math.min(u, 1 - u, v, 1 - v) + (hash(x * 3, y) - 0.5) * 0.09;
      image.data[pixel + 3] = edge < 0.03 ? 0 : 255;
    }
  }
  g.putImageData(image, 0, 0);
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
  g.fillStyle = "#c4b8a4";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(40, 28, 20, 0.18)";
  g.beginPath();
  g.ellipse(70 + kind * 18, 180 - kind * 12, 80, 46, 0.4, 0, Math.PI * 2);
  g.fill();
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
      const fiber = (hash(x, y) - 0.5) * 36;
      image.data[pixel] = clampByte(image.data[pixel] + fiber);
      image.data[pixel + 1] = clampByte(image.data[pixel + 1] + fiber * 0.8);
      image.data[pixel + 2] = clampByte(image.data[pixel + 2] + fiber * 0.55);
      if (x < 14) {
        image.data[pixel + 2] = clampByte(image.data[pixel + 2] + 40);
        image.data[pixel] = clampByte(image.data[pixel] - 18);
      }
      let alpha = 255;
      const edge = Math.min(u, 1 - u, v, 1 - v) + (hash(x * 2, y * 3) - 0.5) * 0.14;
      if (edge < 0.08) alpha = 0;
      if (hash(x * 9, y * 4) > 0.985 && edge < 0.22) alpha = 0;
      if (kind === 2) {
        const dx = u - 0.5;
        const dy = v - 0.5;
        const angle = Math.atan2(dy, dx);
        const rim = 0.4 + Math.sin(angle * 5) * 0.07 + (hash(x, y) - 0.5) * 0.08;
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
  g.fillStyle = "#5c5040";
  g.fillRect(0, 0, 256, 256);
  g.save();
  g.translate(128, 128);
  g.rotate(-0.08);
  for (let y = -220; y < 220; y += 34) {
    g.fillStyle = Math.abs(y) % 68 < 20 ? "rgba(24, 18, 12, 0.72)" : "rgba(150, 132, 86, 0.28)";
    g.fillRect(-240, y, 480, 14);
  }
  g.restore();
}

function paintHalftone(g) {
  for (let y = 8; y < 256; y += 14) {
    for (let x = 8; x < 256; x += 14) {
      if (hash(x, y) > 0.28) {
        g.fillStyle = "rgba(20, 14, 12, 0.62)";
        g.beginPath();
        g.arc(x + (hash(y, x) - 0.5) * 4, y, 3.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.strokeStyle = "rgba(20, 14, 12, 0.7)";
  g.lineWidth = 6;
  g.strokeRect(28, 36, 180, 150);
}

function paintNewsprint(g) {
  g.fillStyle = "rgba(16, 12, 10, 0.9)";
  g.fillRect(12, 18, 168, 34);
  g.fillStyle = "rgba(16, 12, 10, 0.72)";
  for (let y = 64; y < 240; y += 9) {
    const inset = 8 + Math.floor(hash(0, y) * 36);
    const width = 70 + Math.floor(hash(y, 3) * 150);
    g.fillRect(inset, y, width, hash(y, 8) > 0.7 ? 5 : 2);
  }
  g.fillStyle = "rgba(48, 28, 78, 0.45)";
  g.fillRect(150, 150, 80, 48);
}

function paintPhoto(g) {
  g.fillStyle = "#1c1916";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#b7b1a6";
  g.fillRect(16, 22, 214, 148);
  g.fillStyle = "rgba(255, 252, 246, 0.72)";
  g.fillRect(48, 40, 96, 78);
  g.fillStyle = "rgba(12, 10, 9, 0.78)";
  g.fillRect(10, 168, 236, 78);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, value));
}
