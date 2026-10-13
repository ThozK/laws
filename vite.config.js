import {defineConfig} from 'vite';
export default defineConfig({define:{global:'globalThis'},build:{rollupOptions:{output:{manualChunks:{lawtext:['lawtext/dist/src/renderer/rules/law.js','lawtext/dist/src/renderer/rules/htmlCSS.js','lawtext/dist/src/node/el/xmlToEL.js']}}}}});
