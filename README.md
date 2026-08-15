# Mattekit

Original in-tab subject cutout. Hair-ok mattes, studio backdrops, before/after. Files never leave this tab.

Live: https://asherweisberger.github.io/mattekit/

Mattekit is an original tool and is not affiliated with Photoroom, remove.bg, or Canva.

## Why

Photoroom and remove.bg meter credits and upload your photos. Mattekit runs the model in this tab. No account, no watermark, no API key.

## First load

The cutout model is not in the page on first paint. The first photo you drop downloads Open Remove Background (ormbg), quantized, about 44 MB, from Hugging Face. After that it is stored in IndexedDB and later visits skip the download.

Honest progress shows megabytes while the model downloads, then Cutting the subject.

## Model and license

- Model: onnx-community/ormbg-ONNX (q8 / model_quantized.onnx, about 44 MB)
- Architecture: IS-Net CNN (Open Remove Background, Apache-2.0)
- Runtime: ONNX via Transformers.js in a Web Worker, WASM, one thread
- App license: MIT
- Not used: imgly background-removal (AGPL), BRIA RMBG-1.4 / RMBG-2.0 (non-commercial)

## Use

1. Drop, paste, or open a photo. On a phone, use Camera.
2. Wait for the model on the first image (cached after that).
3. Drag the before/after handle. Tune feather and threshold.
4. Pick a backdrop: transparent PNG, solid, studio gradient, custom image, or blur the original.
5. Download PNG or WebP. Up to 8 photos, then ZIP.

## Develop

Install dependencies, then run the Vite dev server. Production build writes docs/ for GitHub Pages (legacy, /docs on main).

## Stack

Vite + React + TypeScript. Canvas 2D. onnxruntime-web via Transformers.js. fflate for ZIP. No upload, no paid APIs.

## License

MIT. Copyright 2026 Asher Weisberger.
The ormbg weights are Apache-2.0 (see the model card).
