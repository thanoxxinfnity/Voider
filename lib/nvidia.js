// NVIDIA NIM API client — Microsoft TRELLIS (3D) + text-to-image models.
// Handles every response shape the genai NIMs are known to return:
// direct binary GLB, JSON with base64 artifacts, and ZIP bundles.
// Long-running requests (HTTP 202 + NVCF-REQID) are polled until done.

import { unzipSync } from 'fflate';

const TRELLIS_URL =
  process.env.TRELLIS_URL || 'https://ai.api.nvidia.com/v1/genai/microsoft/trellis';
const NVCF_STATUS_URL =
  process.env.NVCF_STATUS_URL || 'https://ai.api.nvidia.com/v1/status/';
const TEXT2IMG_URL =
  process.env.TEXT2IMG_URL ||
  'https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium';
const LLM_URL =
  process.env.LLM_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'meta/llama-3.3-70b-instruct';
const NVCF_ASSETS_URL =
  process.env.NVCF_ASSETS_URL || 'https://api.nvcf.nvidia.com/v2/nvcf/assets';
// NVCF inline request body limit ~250KB — isse badi image asset-upload se jaati hai.
const INLINE_LIMIT = 180 * 1024;

function apiKey() {
  const key = process.env.NVIDIA_API_KEY;
  if (!key) {
    throw new Error(
      'NVIDIA_API_KEY set nahi hai. App ke Settings me apni nvapi- key paste karo.'
    );
  }
  return key;
}

const STATUS_HINT = {
  401: 'API key galat ya expired hai — Settings me nayi key daalo',
  402: 'NVIDIA credits khatam ho gaye — build.nvidia.com pe check karo',
  403: 'API key ko is model ki permission nahi hai — build.nvidia.com pe nayi key banao',
  404: 'NVIDIA endpoint nahi mila — model ka URL badal gaya hai',
  413: 'Input bahut bada hai',
  429: 'Rate limit — thodi der ruk ke dobara try karo',
  500: 'NVIDIA server problem — dobara try karo',
  502: 'NVIDIA server problem — dobara try karo',
  503: 'NVIDIA service busy hai — dobara try karo',
};

class NvidiaApiError extends Error {
  constructor(status, body) {
    const hint = STATUS_HINT[status] ? ` (${STATUS_HINT[status]})` : '';
    super(`NVIDIA API error ${status}${hint}: ${body?.slice?.(0, 400) || body}`);
    this.status = status;
    this.body = body;
  }
}

// POST to a NIM invoke URL; if the function is long-running (202) poll the
// NVCF status endpoint until it completes. Resolves to { buffer, contentType }.
async function invokeNim(url, payload, { timeoutMs = 15 * 60 * 1000, extraHeaders = {} } = {}) {
  const headers = {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'NVCF-POLL-SECONDS': '300',
    ...extraHeaders,
  };

  let res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const started = Date.now();
  while (res.status === 202) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('NVIDIA API timeout: generation bahut der tak pending rahi.');
    }
    const reqId = res.headers.get('NVCF-REQID');
    if (!reqId) throw new NvidiaApiError(202, 'Got 202 but no NVCF-REQID header');
    await new Promise((r) => setTimeout(r, 2000));
    res = await fetch(NVCF_STATUS_URL + reqId, {
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        Accept: 'application/json',
        'NVCF-POLL-SECONDS': '300',
      },
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new NvidiaApiError(res.status, text);
  }

  const contentType = res.headers.get('content-type') || '';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

// Find a base64 payload inside the many JSON shapes NIMs return.
function extractBase64(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj.artifacts) && obj.artifacts[0]) {
    const a = obj.artifacts[0];
    return a.base64 || a.data || a.glb || a.image || null;
  }
  for (const key of ['glb', 'model', 'mesh', 'data', 'b64_json', 'image', 'asset']) {
    if (typeof obj[key] === 'string' && obj[key].length > 40) return obj[key];
  }
  // one level deep (e.g. { output: { glb: ... } })
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = extractBase64(v);
      if (found) return found;
    }
  }
  return null;
}

function stripDataUrl(s) {
  const m = /^data:[^;]+;base64,(.*)$/s.exec(s);
  return m ? m[1] : s;
}

const isGlb = (buf) => buf.length > 4 && buf.toString('ascii', 0, 4) === 'glTF';
const isZip = (buf) => buf.length > 2 && buf[0] === 0x50 && buf[1] === 0x4b;
const isPng = (buf) => buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50;
const isJpg = (buf) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;

// Normalize any NIM response into a GLB buffer.
function toGlbBuffer(buffer, contentType) {
  let buf = buffer;
  if (contentType.includes('application/json') || (!isGlb(buf) && !isZip(buf))) {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      const b64 = extractBase64(json);
      if (!b64) throw new Error('response me koi model data nahi mila');
      buf = Buffer.from(stripDataUrl(b64), 'base64');
    } catch (e) {
      if (isGlb(buf) || isZip(buf)) {
        // fall through — binary despite the content-type header
      } else {
        throw new Error(`NVIDIA response parse nahi hua: ${e.message}`);
      }
    }
  }
  if (isZip(buf)) {
    const files = unzipSync(new Uint8Array(buf));
    const glbName = Object.keys(files).find((n) => n.toLowerCase().endsWith('.glb'));
    if (!glbName) throw new Error('ZIP response me .glb file nahi mili');
    buf = Buffer.from(files[glbName]);
  }
  if (!isGlb(buf)) throw new Error('Result valid GLB model nahi hai');
  return buf;
}

// Normalize a text-to-image NIM response into a PNG/JPEG buffer.
function toImageBuffer(buffer, contentType) {
  let buf = buffer;
  if (contentType.includes('application/json') || (!isPng(buf) && !isJpg(buf))) {
    const json = JSON.parse(buf.toString('utf8'));
    const b64 = extractBase64(json);
    if (!b64) throw new Error('image response me koi image data nahi mila');
    buf = Buffer.from(stripDataUrl(b64), 'base64');
  }
  if (!isPng(buf) && !isJpg(buf)) throw new Error('Result valid image nahi hai');
  return buf;
}

// NVCF asset upload — badi images ke liye NVIDIA ka official tarika:
// pehle asset banao, binary ko diye gaye URL pe PUT karo, phir invoke me
// asset id reference bhejo. Resolves to assetId string.
async function uploadAsset(buffer, contentType) {
  const res = await fetch(NVCF_ASSETS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ contentType, description: 'voider input image' }),
  });
  if (!res.ok) throw new NvidiaApiError(res.status, await res.text());
  const { assetId, uploadUrl } = await res.json();
  if (!assetId || !uploadUrl) throw new Error('NVCF asset response me assetId/uploadUrl nahi mila');
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-meta-nvcf-asset-description': 'voider input image',
    },
    body: buffer,
  });
  if (!put.ok) throw new NvidiaApiError(put.status, 'asset upload fail: ' + (await put.text()));
  return assetId;
}

// Image ko TRELLIS payload me daalne layak banao: chhoti image inline data URL
// se, badi image NVCF asset reference se. Returns { imageField, extraHeaders }.
async function prepareImageInput(imageDataUrl) {
  const m = /^data:(image\/\w+);base64,(.*)$/s.exec(imageDataUrl);
  if (!m) throw new Error('Invalid image data URL');
  const [, mime, b64] = m;
  if (b64.length <= INLINE_LIMIT) {
    return { imageField: imageDataUrl, extraHeaders: {} };
  }
  const assetId = await uploadAsset(Buffer.from(b64, 'base64'), mime);
  return {
    imageField: `data:${mime};asset_id,${assetId}`,
    extraHeaders: { 'NVCF-INPUT-ASSET-REFERENCES': assetId },
  };
}

// --- Public API ---------------------------------------------------------

// Connection self-test: har NVIDIA service ko ping karke batata hai kya chal
// raha hai aur kya nahi — taaki user ko exact problem dikhe.
export async function selfTest() {
  const out = {};
  // 1. LLM (chat completions) — sasta real call
  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5,
      }),
    });
    out.llm = { ok: res.ok, status: res.status };
    if (!res.ok) out.llm.detail = (await res.text()).slice(0, 300);
  } catch (e) {
    out.llm = { ok: false, status: 0, detail: e.message };
  }
  // 2. TRELLIS — khaali request bhejte hain: 4xx validation error ka matlab
  // hai ki key sahi hai aur service reachable hai (bina credit kharch kiye).
  try {
    const res = await fetch(TRELLIS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({}),
    });
    const reachableAuthOk = res.ok || res.status === 400 || res.status === 422;
    out.trellis = { ok: reachableAuthOk, status: res.status };
    if (!reachableAuthOk) out.trellis.detail = (await res.text()).slice(0, 300);
  } catch (e) {
    out.trellis = { ok: false, status: 0, detail: e.message };
  }
  return out;
}

// User ke prompt ko NVIDIA-hosted LLM se analyse karo — kisi bhi language me
// likha ho (Hindi/Hinglish bhi), LLM samajh ke ek perfect single-object
// English prompt banata hai jo TRELLIS ke liye best 3D asset deta hai.
// LLM fail ho to original prompt use hota hai — generation kabhi nahi rukti.
export async function analyzePrompt(userPrompt) {
  const sys = [
    'You are a 3D game asset specialist. The user describes an object they want',
    'as a 3D model, possibly in Hindi, Hinglish, or broken English.',
    'Understand what they REALLY want and reply ONLY with a JSON object:',
    '{"name": "<short English asset name, max 5 words>",',
    ' "prompt": "<detailed English text-to-image prompt for exactly ONE object:',
    'describe its shape, materials, colors and style precisely. It must be a',
    'single centered object on a plain white background, 3d game asset render',
    'style, no scene, no people unless the object IS a character>"}',
    'No markdown, no extra text — JSON only.',
  ].join(' ');
  try {
    const res = await fetch(LLM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 400,
      }),
    });
    if (!res.ok) throw new NvidiaApiError(res.status, await res.text());
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) throw new Error('LLM ne JSON nahi diya');
    const parsed = JSON.parse(m[0]);
    if (!parsed.prompt) throw new Error('LLM response me prompt nahi hai');
    return {
      name: String(parsed.name || '').slice(0, 60) || null,
      prompt: String(parsed.prompt).slice(0, 1500),
    };
  } catch (e) {
    console.warn('[analyze] LLM analysis fail, original prompt use hoga:', e.message);
    return { name: null, prompt: userPrompt };
  }
}

// Image (data URL) -> GLB buffer via TRELLIS.
export async function imageTo3D(imageDataUrl, params = {}) {
  const { imageField, extraHeaders } = await prepareImageInput(imageDataUrl);
  const payload = {
    image: imageField,
    seed: params.seed ?? Math.floor(Math.random() * 1000000),
    ss_guidance_strength: params.ss_guidance_strength ?? 7.5,
    ss_sampling_steps: params.ss_sampling_steps ?? 12,
    slat_guidance_strength: params.slat_guidance_strength ?? 3,
    slat_sampling_steps: params.slat_sampling_steps ?? 12,
    mesh_simplify: params.mesh_simplify ?? 0.95,
    texture_size: params.texture_size ?? 1024,
    output_format: 'glb',
  };
  let result;
  try {
    result = await invokeNim(TRELLIS_URL, payload, { extraHeaders });
  } catch (e) {
    // Some deployments reject the tuning fields — retry with the bare minimum.
    if (e instanceof NvidiaApiError && (e.status === 400 || e.status === 422)) {
      result = await invokeNim(TRELLIS_URL, { image: imageField }, { extraHeaders });
    } else {
      throw e;
    }
  }
  return toGlbBuffer(result.buffer, result.contentType);
}

// Text prompt -> image buffer via the configured text-to-image NIM.
export async function textToImage(prompt, params = {}) {
  // SD3 / SDXL style payload; extra fields are tolerated by most genai NIMs
  // and we retry with the minimal payload if not.
  const payload = {
    prompt,
    cfg_scale: params.cfg_scale ?? 5,
    aspect_ratio: '1:1',
    seed: params.seed ?? Math.floor(Math.random() * 1000000),
    steps: params.steps ?? 30,
    negative_prompt: params.negative_prompt ?? 'blurry, low quality, cropped, multiple objects',
  };
  let result;
  try {
    result = await invokeNim(TEXT2IMG_URL, payload);
  } catch (e) {
    if (e instanceof NvidiaApiError && (e.status === 400 || e.status === 422)) {
      result = await invokeNim(TEXT2IMG_URL, { prompt });
    } else {
      throw e;
    }
  }
  return toImageBuffer(result.buffer, result.contentType);
}

// Text -> GLB. Pehle TRELLIS ko direct text bhejte hain; agar wo text accept
// nahi karta to text->image->3D pipeline chalti hai (result phir bhi real
// TRELLIS 3D model hota hai).
export async function textTo3D(prompt, params = {}) {
  try {
    const result = await invokeNim(TRELLIS_URL, {
      prompt,
      seed: params.seed ?? Math.floor(Math.random() * 1000000),
      output_format: 'glb',
    });
    return { glb: toGlbBuffer(result.buffer, result.contentType), viaImage: null };
  } catch (e) {
    const status = e instanceof NvidiaApiError ? e.status : 0;
    if (status !== 400 && status !== 422 && status !== 0) throw e;
    if (!(e instanceof NvidiaApiError) && !/model data|parse|GLB/.test(e.message)) throw e;
  }
  // Fallback pipeline: text -> image -> 3D
  const imgPrompt = params.analyzed
    ? prompt // LLM ne pehle se hi perfect prompt bana diya hai
    : `${prompt}, single object, centered, 3d asset style, plain white background, full view`;
  const img = await textToImage(imgPrompt, params);
  const mime = isPng(img) ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${img.toString('base64')}`;
  const glb = await imageTo3D(dataUrl, params);
  return { glb, viaImage: img };
}
