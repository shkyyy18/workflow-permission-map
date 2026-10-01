import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['src/app.mjs'], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true, loader: { '.yml': 'text' }, legalComments: 'inline' });
const shell = await readFile('src/shell.html', 'utf8');
const notice = await readFile('THIRD_PARTY_NOTICES.txt', 'utf8');
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', shell.replace('<!-- APP -->', () => `<!-- ${notice.replaceAll('--', '—')} --><script>${script}</script>`));
console.log('Built dist/index.html (standalone, no network dependencies).');


