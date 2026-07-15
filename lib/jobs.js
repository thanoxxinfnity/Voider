// Background job queue + history persistence.
// Jobs run server-side, isliye browser band karne ke baad bhi generation
// complete hoti hai aur history me save rehti hai.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { imageTo3D, textTo3D } from './nvidia.js';

const DATA_DIR = path.resolve('data');
const MODELS_DIR = path.join(DATA_DIR, 'models');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

fs.mkdirSync(MODELS_DIR, { recursive: true });

let jobs = [];
try {
  jobs = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
} catch {
  jobs = [];
}
// Server restart ke waqt jo jobs beech me atki thi unhe failed mark karo.
for (const j of jobs) {
  if (j.status === 'queued' || j.status === 'generating') {
    j.status = 'failed';
    j.error = 'Server restart ho gaya tha — dobara try karo.';
  }
}

function save() {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}
save();

const publicJob = (j) => ({
  id: j.id,
  type: j.type,
  prompt: j.prompt,
  status: j.status,
  error: j.error || null,
  createdAt: j.createdAt,
  finishedAt: j.finishedAt || null,
  hasModel: !!j.modelFile,
  hasInput: !!j.inputFile,
  hasThumb: !!j.thumbFile,
  viaImage: !!j.viaImageFile,
});

export function listJobs() {
  return [...jobs].sort((a, b) => b.createdAt - a.createdAt).map(publicJob);
}

export function getJob(id) {
  const j = jobs.find((x) => x.id === id);
  return j ? publicJob(j) : null;
}

export function getJobRaw(id) {
  return jobs.find((x) => x.id === id) || null;
}

export function deleteJob(id) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return false;
  for (const f of [j.modelFile, j.inputFile, j.thumbFile, j.viaImageFile]) {
    if (f) fs.rmSync(path.join(MODELS_DIR, f), { force: true });
  }
  jobs = jobs.filter((x) => x.id !== id);
  save();
  return true;
}

export function setThumb(id, pngBuffer) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return false;
  j.thumbFile = `${j.id}_thumb.png`;
  fs.writeFileSync(path.join(MODELS_DIR, j.thumbFile), pngBuffer);
  save();
  return true;
}

export function fileFor(id, kind) {
  const j = jobs.find((x) => x.id === id);
  if (!j) return null;
  const name = { model: j.modelFile, input: j.inputFile, thumb: j.thumbFile, via: j.viaImageFile }[kind];
  return name ? path.join(MODELS_DIR, name) : null;
}

// --- Queue --------------------------------------------------------------

let running = false;

export function createJob({ type, prompt, imageDataUrl, params }) {
  const id = crypto.randomBytes(8).toString('hex');
  const job = {
    id,
    type, // 'text' | 'image'
    prompt: prompt || '',
    params: params || {},
    status: 'queued',
    createdAt: Date.now(),
  };
  if (type === 'image' && imageDataUrl) {
    const m = /^data:image\/(png|jpe?g|webp);base64,(.*)$/s.exec(imageDataUrl);
    if (!m) throw new Error('Sirf PNG/JPEG/WebP image chalegi');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    job.inputFile = `${id}_input.${ext}`;
    fs.writeFileSync(path.join(MODELS_DIR, job.inputFile), Buffer.from(m[2], 'base64'));
    job.imageDataUrl = imageDataUrl; // used once by the worker, then dropped
  }
  jobs.push(job);
  save();
  pump();
  return publicJob(job);
}

async function pump() {
  if (running) return;
  const job = jobs.find((j) => j.status === 'queued');
  if (!job) return;
  running = true;
  job.status = 'generating';
  save();
  try {
    let glb;
    if (job.type === 'image') {
      glb = await imageTo3D(job.imageDataUrl, job.params);
    } else {
      const out = await textTo3D(job.prompt, job.params);
      glb = out.glb;
      if (out.viaImage) {
        job.viaImageFile = `${job.id}_via.png`;
        fs.writeFileSync(path.join(MODELS_DIR, job.viaImageFile), out.viaImage);
      }
    }
    job.modelFile = `${job.id}.glb`;
    fs.writeFileSync(path.join(MODELS_DIR, job.modelFile), glb);
    job.status = 'done';
  } catch (e) {
    job.status = 'failed';
    job.error = e.message;
    console.error(`[job ${job.id}] failed:`, e.message);
  } finally {
    delete job.imageDataUrl;
    job.finishedAt = Date.now();
    save();
    running = false;
    setImmediate(pump); // agli queued job uthao
  }
}
