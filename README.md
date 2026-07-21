# 🧊 Voider 3D Studio

**Real Text-to-3D aur Image-to-3D generator** — NVIDIA ke **Microsoft TRELLIS**
model se. Apne game ke liye real 3D assets banao aur har popular format me
export karo. Koi fake nahi — asli NVIDIA API, asli GLB models. 🎮

## ✨ Features

- 📝 **Text → 3D** — prompt likho, 3D model pao
- 🧠 **AI Prompt Analysis** — Hindi/Hinglish/English kuch bhi likho, NVIDIA ka
  Llama LLM pehle analyse karta hai ki tum asal me kya banwana chahte ho aur
  perfect 3D-asset prompt banata hai — isse models bahut behtar bante hain
- 🖼️ **Image → 3D** — koi bhi image (PNG/JPG/WebP) se 3D model
- ⬇️ **Real export** har format me: **GLB, GLTF, OBJ, STL, PLY, USDZ**
- 🕘 **History** — har generation save rehti hai, kabhi bhi dekho/download karo
- 🚀 **Background generation** — Generate dabao aur page band kar do,
  generation server pe chalti rahegi. History me result mil jayega.
- 🌀 Live 3D viewer (rotate / zoom / pan) — three.js

## ⚠️ Pehle ye padho

Ye app **GitHub Pages pe NAHI chalega** — isme Node.js server hai jo
background generation aur history sambhalta hai, aur GitHub Pages sirf
static files dikhata hai. Chalane ke 2 tarike hain (dono neeche):

## 🚀 Tarika 1: Apne computer pe (sabse easy)

1. **Node.js** install karo — [nodejs.org](https://nodejs.org) se **LTS**
   version (agar pehle se nahi hai).
2. Ye repo download karo: GitHub pe green **Code** button → **Download ZIP**
   → ZIP extract karo.
3. Folder me:
   - **Windows**: `start-windows.bat` pe double-click karo
   - **Mac/Linux**: terminal me `./start-mac-linux.sh`
4. Browser khud khul jayega (**http://localhost:3000**). Pehli baar ek
   dialog aayega — usme apni **NVIDIA API key** (`nvapi-...`) paste karo.
   Key free me [build.nvidia.com](https://build.nvidia.com) se milti hai
   aur sirf tumhare computer ki `.env` file me save hoti hai.

Bas! Ab prompt likho ya image daalo aur **⚡ 3D Model Banao** dabao.
Kuch fail ho to Settings (⚙️) me **🔍 Connection Test** dabao — wo exact
problem bata dega.

## 🌐 Tarika 2: Internet pe free hosting (Render.com)

Agar website ki tarah kahin se bhi kholna hai:

1. [render.com](https://render.com) pe free account banao (GitHub se login)
2. **New → Blueprint** → apna `Voider` repo select karo
   (branch: `claude/nvidia-trellis-3d-generation-7o332r`)
3. Deploy hone do (~2 min) — Render tumhe ek URL dega
   (jaise `voider-3d-studio.onrender.com`)
4. Us URL pe app kholke Settings me apni NVIDIA key daalo

> Note: Free plan pe server kuch der idle rehne par so jaata hai (pehli
> request me ~30 sec lagte hain) aur restart par purani history mit
> sakti hai. Railway/Fly.io ke liye `Dockerfile` bhi included hai.

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
- **Text → 3D**: 3-step AI pipeline —
  1. **Analyse**: NVIDIA ka Llama LLM tumhara prompt (kisi bhi language me)
     samajh ke ek detailed single-object English prompt banata hai.
  2. Pehle TRELLIS ko direct prompt bheja jaata hai; agar hosted TRELLIS
     sirf image input leta hai to Stable Diffusion 3 se image banti hai.
  3. TRELLIS us se real textured 3D model banata hai.
  History me dikhta hai ki AI ne tumhare prompt ko kaise samjha.
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
