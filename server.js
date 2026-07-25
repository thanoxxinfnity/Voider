// Voider 3D Studio — NVIDIA Microsoft TRELLIS se real Text-to-3D & Image-to-3D.
// ZERO dependencies: sirf Node.js chahiye, npm install ki zaroorat nahi.
import http from 'http';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- .env load (dotenv ki jagah) -----------------------------------------
const ENV_PATH = path.join(__dirname, '.env');
try {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

const { createJob, listJobs, getJob, deleteJob, setThumb, fileFor } = await import('./lib/jobs.js');
const { selfTest } = await import('./lib/nvidia.js');

// --- Helpers ---------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function sendFile(res, filePath, downloadName) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendJson(res, 404, { error: 'File nahi mili' });
    const headers = {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
    };
    if (downloadName) headers['Content-Disposition'] = `attachment; filename="${downloadName}"`;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req, limit = 40 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Request bahut badi hai'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function saveEnvKey(key) {
  let env = '';
  try { env = fs.readFileSync(ENV_PATH, 'utf8'); } catch {}
  if (/^NVIDIA_API_KEY=.*$/m.test(env)) {
    env = env.replace(/^NVIDIA_API_KEY=.*$/m, `NVIDIA_API_KEY=${key}`);
  } else {
    env += (env && !env.endsWith('\n') ? '\n' : '') + `NVIDIA_API_KEY=${key}\n`;
  }
  fs.writeFileSync(ENV_PATH, env, { mode: 0o600 });
  process.env.NVIDIA_API_KEY = key;
}

// --- Router ----------------------------------------------------------------
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && url.pathname === '/api/config') {
    const key = process.env.NVIDIA_API_KEY || '';
    return sendJson(res, 200, {
      hasKey: !!key,
      maskedKey: key ? `${key.slice(0, 9)}...${key.slice(-4)}` : null,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/setup') {
    const body = await readBody(req);
    const key = (body.apiKey || '').trim();
    if (!/^nvapi-[\w-]{20,}$/.test(key)) {
      return sendJson(res, 400, { error: 'Ye valid NVIDIA key nahi lagti (nvapi- se shuru honi chahiye)' });
    }
    saveEnvKey(key);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/test') {
    if (!process.env.NVIDIA_API_KEY) return sendJson(res, 400, { error: 'Pehle API key daalo' });
    try {
      return sendJson(res, 200, await selfTest());
    } catch (e) {
      return sendJson(res, 500, { error: e.message });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/generate') {
    const body = await readBody(req);
    const { type, prompt, image, params } = body;
    if (type !== 'text' && type !== 'image') {
      return sendJson(res, 400, { error: 'type "text" ya "image" hona chahiye' });
    }
    if (!process.env.NVIDIA_API_KEY) {
      return sendJson(res, 400, { error: 'Pehle Settings me NVIDIA API key daalo' });
    }
    if (type === 'text' && !prompt?.trim()) return sendJson(res, 400, { error: 'Prompt likho pehle' });
    if (type === 'image' && !image) return sendJson(res, 400, { error: 'Image upload karo pehle' });
    try {
      return sendJson(res, 200, createJob({ type, prompt: prompt?.trim(), imageDataUrl: image, params }));
    } catch (e) {
      return sendJson(res, 400, { error: e.message });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/jobs') {
    return sendJson(res, 200, listJobs());
  }

  // /api/jobs/:id[/...]
  if (parts[0] === 'api' && parts[1] === 'jobs' && parts[2]) {
    const id = parts[2];
    const sub = parts[3];

    if (req.method === 'GET' && !sub) {
      const job = getJob(id);
      return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: 'Job nahi mili' });
    }
    if (req.method === 'DELETE' && !sub) {
      return sendJson(res, 200, { ok: deleteJob(id) });
    }
    if (req.method === 'POST' && sub === 'thumb') {
      const body = await readBody(req);
      const m = /^data:image\/png;base64,(.*)$/s.exec(body.dataUrl || '');
      if (!m) return sendJson(res, 400, { error: 'PNG data URL chahiye' });
      return sendJson(res, 200, { ok: setThumb(id, Buffer.from(m[1], 'base64')) });
    }
    if (req.method === 'GET' && ['model', 'input', 'thumb', 'via'].includes(sub)) {
      const file = fileFor(id, sub);
      if (!file) return sendJson(res, 404, { error: 'File nahi mili' });
      const dl = sub === 'model' && url.searchParams.get('download') ? `voider_${id}.glb` : null;
      return sendFile(res, file, dl);
    }
  }

  sendJson(res, 404, { error: 'Route nahi mila' });
}

const PUBLIC_DIR = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => {
      if (!res.headersSent) sendJson(res, 400, { error: e.message });
    });
    return;
  }

  // Static files (path traversal se bachao)
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Nope' });
  sendFile(res, filePath);
});

// --- Start: port busy ho to agla try karo, phir browser kholo ---------------
const BASE_PORT = parseInt(process.env.PORT || '3000', 10);

function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log(`  Port ${port} busy hai, ${port + 1} try kar raha hoon...`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error('Server start nahi hua:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, () => {
    const link = `http://localhost:${port}`;
    console.log('');
    console.log('  🎮 Voider 3D Studio chal raha hai!');
    console.log(`  👉 Browser me kholo: ${link}`);
    console.log('');
    if (!process.env.NO_OPEN && !process.env.RENDER) {
      const cmd = process.platform === 'win32' ? `start "" "${link}"`
        : process.platform === 'darwin' ? `open "${link}"`
        : `xdg-open "${link}"`;
      exec(cmd, () => {});
    }
  });
}

listen(BASE_PORT, process.env.PORT ? 0 : 10);
