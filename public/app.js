// Voider 3D Studio frontend — viewer, exports, history, background polling.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { PLYExporter } from 'three/addons/exporters/PLYExporter.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';

const $ = (id) => document.getElementById(id);

// ---------- Toast ----------
let toastTimer;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.className = isError ? 'error' : '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4500);
}

// ---------- Settings / API key ----------
async function refreshKeyStatus() {
  const cfg = await fetch('/api/config').then((r) => r.json());
  const el = $('keyStatus');
  if (cfg.hasKey) {
    el.textContent = `🔑 Key set hai: ${cfg.maskedKey} ✅`;
    el.classList.add('ok');
  } else {
    el.textContent = '🔑 Koi API key set nahi hai — neeche paste karo';
    el.classList.remove('ok');
  }
  return cfg.hasKey;
}
async function checkKey() {
  if (!(await refreshKeyStatus())) $('setupDialog').showModal();
}
$('settingsBtn').onclick = async () => {
  await refreshKeyStatus();
  $('setupDialog').showModal();
};
$('closeSetupBtn').onclick = () => $('setupDialog').close();
$('saveKeyBtn').onclick = async () => {
  const key = $('apiKeyInput').value.trim();
  const res = await fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: key }),
  });
  const data = await res.json();
  if (!res.ok) return toast(data.error, true);
  $('apiKeyInput').value = '';
  await refreshKeyStatus();
  $('setupDialog').close();
  toast('✅ API key save ho gayi!');
};

$('testBtn').onclick = async () => {
  const box = $('testResult');
  box.hidden = false;
  box.innerHTML = '⏳ NVIDIA services test ho rahi hain...';
  try {
    const res = await fetch('/api/test', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Test fail');
    const line = (name, r) => {
      if (r.ok) return `✅ <b>${name}</b>: chal raha hai (HTTP ${r.status})`;
      let hint = '';
      if (r.status === 401 || r.status === 403) hint = ' — key galat/expired hai, nayi key daalo';
      else if (r.status === 429) hint = ' — rate limit/credits khatam';
      else if (r.status === 404) hint = ' — endpoint nahi mila (mujhe batao, main URL fix karunga)';
      else if (r.status === 0) hint = ' — network problem (internet/firewall check karo)';
      return `❌ <b>${name}</b>: HTTP ${r.status}${hint}<br><span class="mono">${escapeHtml((r.detail || '').slice(0, 200))}</span>`;
    };
    box.innerHTML = [
      line('LLM (prompt analysis)', data.llm),
      line('TRELLIS (3D generation)', data.trellis),
    ].join('<br>');
  } catch (e) {
    box.innerHTML = `❌ Test nahi chala: ${escapeHtml(e.message)}`;
  }
};

// ---------- Tabs ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    $('tab-text').hidden = btn.dataset.tab !== 'text';
    $('tab-image').hidden = btn.dataset.tab !== 'image';
  };
});

// ---------- Image upload ----------
let uploadedDataUrl = null;
const dropZone = $('dropZone');
dropZone.onclick = () => $('imgInput').click();
dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('drag'); };
dropZone.ondragleave = () => dropZone.classList.remove('drag');
dropZone.ondrop = (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag');
  if (e.dataTransfer.files[0]) readImage(e.dataTransfer.files[0]);
};
$('imgInput').onchange = (e) => e.target.files[0] && readImage(e.target.files[0]);

function readImage(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('Sirf PNG / JPG / WebP chalega', true);
  if (file.size > 25 * 1024 * 1024) return toast('Image 25MB se choti honi chahiye', true);
  const img = new Image();
  img.onload = () => {
    // 1024px tak downscale — NVIDIA API ke liye fast aur reliable.
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    // PNG rakhta hai transparency (3D ke liye best); baaki JPEG me chhota.
    uploadedDataUrl = file.type === 'image/png'
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', 0.92);
    URL.revokeObjectURL(img.src);
    $('imgPreview').src = uploadedDataUrl;
    $('imgPreview').hidden = false;
    $('dropHint').hidden = true;
  };
  img.onerror = () => toast('Image read nahi hui, koi aur file try karo', true);
  img.src = URL.createObjectURL(file);
}

// ---------- Generate ----------
async function generate(type) {
  const body = { type };
  if (type === 'text') {
    body.prompt = $('promptInput').value.trim();
    if (!body.prompt) return toast('Pehle prompt likho bro!', true);
  } else {
    if (!uploadedDataUrl) return toast('Pehle image upload karo bro!', true);
    body.image = uploadedDataUrl;
  }
  const btn = type === 'text' ? $('genTextBtn') : $('genImageBtn');
  btn.disabled = true;
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation start nahi hui');
    toast('🚀 Generation background me start ho gayi! History me dikhegi.');
    refreshHistory();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
}
$('genTextBtn').onclick = () => generate('text');
$('genImageBtn').onclick = () => generate('image');

// ---------- 3D Viewer ----------
const viewerEl = $('viewer');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
viewerEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d16);
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(1.6, 1.2, 1.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// PBR environment lighting — real textured TRELLIS models iske bina dark dikhte hain.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 0.6));
const dir = new THREE.DirectionalLight(0xffffff, 1.6);
dir.position.set(3, 5, 2);
scene.add(dir);
const grid = new THREE.GridHelper(4, 20, 0x2a3352, 0x1b2236);
scene.add(grid);

let currentModel = null;
let currentJob = null;

function resize() {
  const w = viewerEl.clientWidth, h = viewerEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  if (currentModel) currentModel.rotation.y += 0.002;
  renderer.render(scene, camera);
});

const loader = new GLTFLoader();

async function viewJob(job) {
  currentJob = job;
  document.querySelectorAll('.hcard').forEach((c) =>
    c.classList.toggle('selected', c.dataset.id === job.id));
  $('viewerMsg').textContent = '⏳ Model load ho raha hai...';
  $('viewerMsg').style.display = 'flex';
  loader.load(
    `/api/jobs/${job.id}/model`,
    (gltf) => {
      if (currentModel) scene.remove(currentModel);
      currentModel = gltf.scene;
      // model ko center + normalize karo
      const box = new THREE.Box3().setFromObject(currentModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 1.4 / Math.max(size.x, size.y, size.z, 0.0001);
      currentModel.scale.setScalar(scale);
      currentModel.position.sub(center.multiplyScalar(scale));
      const box2 = new THREE.Box3().setFromObject(currentModel);
      currentModel.position.y -= box2.min.y;
      scene.add(currentModel);
      // camera ko model pe fit karo
      const h = box2.max.y - box2.min.y;
      controls.target.set(0, h / 2, 0);
      camera.position.set(1.9, h / 2 + 0.9, 1.9);
      controls.update();
      $('viewerMsg').style.display = 'none';
      $('viewerBar').hidden = false;
      $('viewerTitle').textContent =
        job.assetName || (job.prompt ? `"${job.prompt.slice(0, 60)}"` : `Image job ${job.id}`);
      const info = $('aiInfo');
      if (job.enhancedPrompt) {
        info.innerHTML = `<b>🧠 AI ne samjha:</b> ${escapeHtml(job.enhancedPrompt)}`;
        info.hidden = false;
      } else {
        info.hidden = true;
      }
      if (!job.hasThumb) captureThumb(job.id);
    },
    undefined,
    () => {
      $('viewerMsg').textContent = '❌ Model load nahi hua';
    }
  );
}

function captureThumb(id) {
  setTimeout(() => {
    try {
      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');
      fetch(`/api/jobs/${id}/thumb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      }).then(() => refreshHistory());
    } catch {}
  }, 400);
}

// ---------- Export / Download ----------
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

$('downloadBtn').onclick = async () => {
  if (!currentJob || !currentModel) return toast('Pehle koi model kholo', true);
  const fmt = $('fmtSelect').value;
  const base = `voider_${currentJob.id}`;
  try {
    if (fmt === 'glb') {
      window.location.href = `/api/jobs/${currentJob.id}/model?download=1`;
      return;
    }
    toast(`⏳ ${fmt.toUpperCase()} me convert ho raha hai...`);
    const obj = currentModel;
    if (fmt === 'gltf') {
      const exporter = new GLTFExporter();
      const json = await exporter.parseAsync(obj, { binary: false });
      saveBlob(new Blob([JSON.stringify(json)], { type: 'model/gltf+json' }), `${base}.gltf`);
    } else if (fmt === 'obj') {
      const text = new OBJExporter().parse(obj);
      saveBlob(new Blob([text], { type: 'text/plain' }), `${base}.obj`);
    } else if (fmt === 'stl') {
      const data = new STLExporter().parse(obj, { binary: true });
      saveBlob(new Blob([data], { type: 'model/stl' }), `${base}.stl`);
    } else if (fmt === 'ply') {
      await new Promise((resolve, reject) => {
        try {
          new PLYExporter().parse(obj, (result) => {
            saveBlob(new Blob([result], { type: 'model/ply' }), `${base}.ply`);
            resolve();
          }, { binary: false });
        } catch (e) { reject(e); }
      });
    } else if (fmt === 'usdz') {
      const exporter = new USDZExporter();
      const data = await exporter.parseAsync(obj);
      saveBlob(new Blob([data], { type: 'model/vnd.usdz+zip' }), `${base}.usdz`);
    }
    toast(`✅ ${fmt.toUpperCase()} download ho gaya!`);
  } catch (e) {
    console.error(e);
    toast(`Export fail: ${e.message}`, true);
  }
};

// ---------- History ----------
const STATUS_LABEL = {
  queued: '🟡 Queue me hai...',
  analyzing: '<span class="spin">🧠</span> AI prompt analyse kar raha hai...',
  generating: '<span class="spin">⚙️</span> 3D model ban raha hai...',
  done: '✅ Ready',
  failed: '❌ Fail',
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'abhi';
  if (s < 3600) return `${Math.floor(s / 60)} min pehle`;
  if (s < 86400) return `${Math.floor(s / 3600)} ghante pehle`;
  return new Date(ts).toLocaleDateString();
}

let lastJobsJson = '';
async function refreshHistory() {
  let jobs;
  try {
    jobs = await fetch('/api/jobs').then((r) => r.json());
  } catch { return; }
  const json = JSON.stringify(jobs);
  if (json === lastJobsJson) return;
  lastJobsJson = json;

  const list = $('historyList');
  list.innerHTML = '';
  if (!jobs.length) {
    list.innerHTML = '<p class="hint">Abhi tak koi generation nahi hui.</p>';
    return;
  }
  for (const job of jobs) {
    const card = document.createElement('div');
    card.className = 'hcard' + (currentJob?.id === job.id ? ' selected' : '');
    card.dataset.id = job.id;

    const thumbSrc = job.hasThumb
      ? `/api/jobs/${job.id}/thumb`
      : job.hasInput ? `/api/jobs/${job.id}/input`
      : job.viaImage ? `/api/jobs/${job.id}/via`
      : null;
    const icon = job.type === 'text' ? '📝' : '🖼️';

    card.innerHTML = `
      ${thumbSrc
        ? `<img class="hthumb" src="${thumbSrc}" alt="" />`
        : `<div class="hthumb">${icon}</div>`}
      <div class="hinfo">
        <div class="hprompt" title="${escapeHtml(job.enhancedPrompt || job.prompt || '')}">${icon} ${escapeHtml(job.assetName || job.prompt || 'Image se 3D')}</div>
        <div class="hmeta">${timeAgo(job.createdAt)}</div>
        <div class="hstatus ${job.status}">${STATUS_LABEL[job.status]}${
          job.status === 'failed' && job.error ? ` — ${escapeHtml(job.error.slice(0, 160))}` : ''}</div>
      </div>
      <div class="hactions">
        ${job.status === 'done' ? `<button class="dl" title="GLB download">⬇️</button>` : ''}
        <button class="del ghost" title="Delete">🗑️</button>
      </div>`;

    card.onclick = (e) => {
      if (e.target.closest('button')) return;
      if (job.status === 'done') viewJob(job);
      else if (job.status === 'failed') toast(job.error || 'Ye generation fail ho gayi thi', true);
      else toast('Abhi ban raha hai, thoda ruko...');
    };
    card.querySelector('.dl')?.addEventListener('click', () => {
      window.location.href = `/api/jobs/${job.id}/model?download=1`;
    });
    card.querySelector('.del').addEventListener('click', async () => {
      await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' });
      lastJobsJson = '';
      refreshHistory();
    });
    list.appendChild(card);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('refreshBtn').onclick = () => { lastJobsJson = ''; refreshHistory(); };

// Background polling — jobs server pe chalti hain, hum bas status dekhte hain.
setInterval(refreshHistory, 3000);
refreshHistory();
checkKey();
