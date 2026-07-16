// Voider 3D Studio — NVIDIA Microsoft TRELLIS se real Text-to-3D & Image-to-3D.
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  createJob, listJobs, getJob, deleteJob, setThumb, fileFor,
} from './lib/jobs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '40mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// three.js ko locally serve karo — koi CDN dependency nahi.
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules/three')));

// --- Config / API key setup ---------------------------------------------

app.get('/api/config', (_req, res) => {
  const key = process.env.NVIDIA_API_KEY || '';
  res.json({
    hasKey: !!key,
    // Sirf masked version bhejte hain — poori key kabhi frontend pe nahi jaati.
    maskedKey: key ? `${key.slice(0, 9)}...${key.slice(-4)}` : null,
  });
});

app.post('/api/setup', (req, res) => {
  const key = (req.body?.apiKey || '').trim();
  if (!/^nvapi-[\w-]{20,}$/.test(key)) {
    return res.status(400).json({ error: 'Ye valid NVIDIA key nahi lagti (nvapi- se shuru honi chahiye)' });
  }
  const envPath = path.join(__dirname, '.env');
  let env = '';
  try { env = fs.readFileSync(envPath, 'utf8'); } catch {}
  if (/^NVIDIA_API_KEY=.*$/m.test(env)) {
    env = env.replace(/^NVIDIA_API_KEY=.*$/m, `NVIDIA_API_KEY=${key}`);
  } else {
    env += (env && !env.endsWith('\n') ? '\n' : '') + `NVIDIA_API_KEY=${key}\n`;
  }
  fs.writeFileSync(envPath, env, { mode: 0o600 });
  process.env.NVIDIA_API_KEY = key;
  res.json({ ok: true });
});

// --- Generation + history -------------------------------------------------

app.post('/api/generate', (req, res) => {
  try {
    const { type, prompt, image, params } = req.body || {};
    if (type !== 'text' && type !== 'image') {
      return res.status(400).json({ error: 'type "text" ya "image" hona chahiye' });
    }
    if (!process.env.NVIDIA_API_KEY) {
      return res.status(400).json({ error: 'Pehle Settings me NVIDIA API key daalo' });
    }
    if (type === 'text' && !prompt?.trim()) {
      return res.status(400).json({ error: 'Prompt likho pehle' });
    }
    if (type === 'image' && !image) {
      return res.status(400).json({ error: 'Image upload karo pehle' });
    }
    const job = createJob({ type, prompt: prompt?.trim(), imageDataUrl: image, params });
    res.json(job);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/jobs', (_req, res) => res.json(listJobs()));

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job nahi mili' });
  res.json(job);
});

app.delete('/api/jobs/:id', (req, res) => {
  res.json({ ok: deleteJob(req.params.id) });
});

app.post('/api/jobs/:id/thumb', (req, res) => {
  const m = /^data:image\/png;base64,(.*)$/s.exec(req.body?.dataUrl || '');
  if (!m) return res.status(400).json({ error: 'PNG data URL chahiye' });
  res.json({ ok: setThumb(req.params.id, Buffer.from(m[1], 'base64')) });
});

function serveFile(kind, downloadName) {
  return (req, res) => {
    const file = fileFor(req.params.id, kind);
    if (!file || !fs.existsSync(file)) return res.status(404).json({ error: 'File nahi mili' });
    if (downloadName && req.query.download) {
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName(req.params.id)}"`);
    }
    if (file.endsWith('.glb')) res.setHeader('Content-Type', 'model/gltf-binary');
    res.sendFile(file);
  };
}

app.get('/api/jobs/:id/model', serveFile('model', (id) => `voider_${id}.glb`));
app.get('/api/jobs/:id/input', serveFile('input'));
app.get('/api/jobs/:id/thumb', serveFile('thumb'));
app.get('/api/jobs/:id/via', serveFile('via'));

app.listen(PORT, () => {
  console.log('');
  console.log('  🎮 Voider 3D Studio chal raha hai!');
  console.log(`  👉 Browser me kholo: http://localhost:${PORT}`);
  console.log('');
});
