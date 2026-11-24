import fs from 'node:fs';
import {defineConfig} from 'vite';
const samples=JSON.parse(fs.readFileSync(new URL('./scripts/sample-configs.json',import.meta.url),'utf8'));
export default defineConfig({base:process.env.GITHUB_ACTIONS ? '/laws/' : '/',define:{global:'globalThis'},build:{rollupOptions:{input:{main:'index.html',...Object.fromEntries(Object.entries(samples).map(([slug,c])=>[slug,`${c.path}/index.html`]))},output:{manualChunks:{lawtext:['lawtext/dist/src/renderer/rules/law.js','lawtext/dist/src/renderer/rules/htmlCSS.js','lawtext/dist/src/node/el/xmlToEL.js']}}}}});
