import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
const configs=JSON.parse(await fs.readFile(new URL('./sample-configs.json',import.meta.url),'utf8'));
for(const slug of Object.keys(configs)){const result=spawnSync(process.execPath,['scripts/build-sample-page.mjs',slug,...process.argv.slice(2)],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
await import('./build-sample-index.mjs');
