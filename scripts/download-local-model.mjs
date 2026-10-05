// Official registry artifact download for restricted networks where the Ollama
// downloader does not use the platform HTTPS proxy. Every blob is verified.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const exec = promisify(execFile);
const registry = 'https://registry.ollama.ai/v2/library/qwen3';
const dir = path.resolve(process.env.OLLAMA_MODELS || '/workspace/tools/models');
const manifestResponse = await exec('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '30', `${registry}/manifests/1.7b`]);
const manifest = JSON.parse(manifestResponse.stdout);
await mkdir(path.join(dir, 'blobs'), { recursive: true });
const checksum = async (file) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
};
for (const entry of [manifest.config, ...manifest.layers]) {
  if (!/^sha256:[a-f0-9]{64}$/.test(entry.digest)) throw new Error('Invalid registry digest');
  const expected = entry.digest.slice(7);
  const target = path.join(dir, 'blobs', `sha256-${expected}`);
  try { if (await checksum(target) === expected) continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  console.log(`Downloading and verifying ${entry.size} byte model layer`);
  await exec('curl', ['--fail', '--silent', '--show-error', '--location', '--retry', '2', '--max-time', '600', '--output', `${target}.download`, `${registry}/blobs/${entry.digest}`], { timeout: 650_000 });
  if (await checksum(`${target}.download`) !== expected) throw new Error('Model layer integrity verification failed');
  await rename(`${target}.download`, target);
}
const manifestDir = path.join(dir, 'manifests/registry.ollama.ai/library/qwen3');
await mkdir(manifestDir, { recursive: true });
await writeFile(path.join(manifestDir, '1.7b'), JSON.stringify(manifest));
console.log('Verified qwen3:1.7b model installed');
