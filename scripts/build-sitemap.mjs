import fs from 'node:fs/promises';
const configs=JSON.parse(await fs.readFile(new URL('./sample-configs.json',import.meta.url),'utf8'));
const urls=['',...Object.values(configs).map(c=>c.path+'/')];await fs.writeFile('public/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(p=>` <url><loc>https://thozk.github.io/laws/${p}</loc></url>`).join('\n')+'\n</urlset>\n');
