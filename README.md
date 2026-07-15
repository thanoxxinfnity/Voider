# 🧊 Voider 3D Studio

**Real Text-to-3D aur Image-to-3D generator** — NVIDIA ke **Microsoft TRELLIS**
model se. Apne game ke liye real 3D assets banao aur har popular format me
export karo. Koi fake nahi — asli NVIDIA API, asli GLB models. 🎮

## ✨ Features

- 📝 **Text → 3D** — prompt likho, 3D model pao
- 🖼️ **Image → 3D** — koi bhi image (PNG/JPG/WebP) se 3D model
- ⬇️ **Real export** har format me: **GLB, GLTF, OBJ, STL, PLY, USDZ**
- 🕘 **History** — har generation save rehti hai, kabhi bhi dekho/download karo
- 🚀 **Background generation** — Generate dabao aur page band kar do,
  generation server pe chalti rahegi. History me result mil jayega.
- 🌀 Live 3D viewer (rotate / zoom / pan) — three.js

## 🚀 Setup (2 minute)

1. **Node.js 18+** chahiye ([nodejs.org](https://nodejs.org) se install karo)

2. Project folder me terminal kholo aur:

   ```bash
   npm install
   npm start
   ```

3. Browser me kholo: **http://localhost:3000**

4. Pehli baar khulne par ek dialog aayega — usme apni **NVIDIA API key**
   (`nvapi-...`) paste karo. Key free me [build.nvidia.com](https://build.nvidia.com)
   se milti hai. Key tumhare computer par local `.env` file me save hoti
   hai — kahin upload nahi hoti.

Bas! Ab prompt likho ya image daalo aur **⚡ 3D Model Banao** dabao.

## 🔐 API key ke baare me (IMPORTANT)

- Apni `nvapi-` key **kabhi kisi ko mat do** aur kabhi GitHub/chat me paste
  mat karo — koi bhi use chura ke tumhara free quota khatam kar sakta hai.
- Agar key kahin leak ho gayi ho to [build.nvidia.com](https://build.nvidia.com)
  pe jaake **nayi key generate karo** aur purani delete kar do.
- Is project me `.env` file `.gitignore` me hai, to key git me kabhi commit
  nahi hogi.

## 🎮 Game me use kaise kare

| Engine | Format |
|--------|--------|
| Unity | GLB ya OBJ (GLB ke liye [glTFast](https://github.com/atteneder/glTFast) package) |
| Unreal Engine | GLB (built-in glTF importer) ya OBJ |
| Godot | GLB direct import — sabse easy |
| Blender | GLB / OBJ / STL / PLY sab chalta hai |
| iOS AR | USDZ |
| 3D Printing | STL |

## ⚙️ Kaise kaam karta hai

- **Image → 3D**: Tumhari image seedha NVIDIA ke Microsoft TRELLIS API ko
  jaati hai, jo real textured GLB 3D model banata hai.
- **Text → 3D**: Pehle TRELLIS ko direct prompt bheja jaata hai; agar hosted
  TRELLIS sirf image input leta hai to app automatically NVIDIA ke
  Stable Diffusion 3 se prompt ki image banata hai aur usse TRELLIS me
  bhejta hai — result phir bhi 100% real TRELLIS 3D model hota hai.
- **Background jobs**: Generation server par queue me chalti hai aur
  `data/` folder me save hoti hai, isliye browser band karne par bhi kuch
  nahi rukta.
- **Export**: GLB original file server se aati hai; baaki formats (GLTF,
  OBJ, STL, PLY, USDZ) browser me three.js exporters se real conversion
  hote hain.

## 🛠️ Config (optional)

`.env.example` ko `.env` bana ke ye settings badal sakte ho:

```env
NVIDIA_API_KEY=nvapi-...
PORT=3000
TRELLIS_URL=https://ai.api.nvidia.com/v1/genai/microsoft/trellis
TEXT2IMG_URL=https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium
```

## ❓ Problems?

- **"NVIDIA API error 401/403"** — key galat hai ya expire ho gayi.
  Settings (⚙️) me nayi key daalo.
- **"NVIDIA API error 429"** — quota/rate limit. Thodi der ruko ya
  build.nvidia.com pe credits check karo.
- **Model load nahi hua** — page refresh karke History se dobara kholo.
