import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve('dist');
try {
  await readFile(path.join(output, '.easy-agent-build'));
  await rm(output, { recursive: true });
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
for (const source of ['src', 'public', 'config', 'package.json']) await cp(source, path.join(output, source), { recursive: true, force: false, errorOnExist: true });
await writeFile(path.join(output, '.easy-agent-build'), 'Generated Easy Agent runtime distribution\n');
console.log('Built dist/ (runtime source, UI, configuration; no credentials or project data)');
