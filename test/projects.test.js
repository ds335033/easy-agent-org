import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, symlink, truncate, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createProjectStore } from '../src/projects.js';

async function fixture() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'easy-projects-'));
  const calls = [];
  const executor = {
    async run(root, command, options) {
      calls.push({ root, command, options });
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    }
  };
  const store = createProjectStore({ dataDir, executor });
  await store.init();
  return { calls, dataDir, store };
}

test('projects are persistent and isolated by owner without exposing server paths', async () => {
  const { dataDir, store } = await fixture();
  const alpha = await store.create('owner-a', { name: 'Alpha' });
  const beta = await store.create('owner-b', { name: 'Beta' });

  assert.match(alpha.id, /^[0-9a-f-]{36}$/);
  assert.equal(alpha.name, 'Alpha');
  assert.equal(alpha.root, undefined);
  assert.equal(alpha.checkpoints.length, 0);
  assert.deepEqual((await store.list('owner-a')).map((item) => item.id), [alpha.id]);
  assert.deepEqual((await store.list('owner-b')).map((item) => item.id), [beta.id]);
  await assert.rejects(store.get('owner-b', alpha.id), (error) => error.statusCode === 404);
  await assert.rejects(store.readFile('owner-b', alpha.id, 'index.html'), (error) => error.statusCode === 404);
  await assert.rejects(store.get('owner-a', 'not-real'), (error) => error.statusCode === 404);

  const reloaded = createProjectStore({ dataDir, executor: { run: async () => ({ exitCode: 0 }) } });
  await reloaded.init();
  assert.equal((await reloaded.get('owner-a', alpha.id)).name, 'Alpha');
});

test('seed is runnable and executor receives only the private project root', async () => {
  const { calls, dataDir, store } = await fixture();
  const project = await store.create('founder', { name: 'Starter' });
  assert.match(await store.readFile('founder', project.id, 'index.html'), /It works/);
  assert.equal(JSON.parse(await store.readFile('founder', project.id, 'package.json')).scripts.test, 'node --test');
  const result = await store.test('founder', project.id, { timeout: 1000 });
  assert.equal(result.exitCode, 0);
  assert.equal(calls[0].command, 'npm test');
  assert.equal(calls[0].root, path.join(dataDir, 'projects', project.id, 'workspace'));
});

test('file API rejects traversal, git internals, roots, symlinks, dangling links, and oversized writes', async () => {
  const { dataDir, store } = await fixture();
  const project = await store.create('owner', { name: 'Safe' });
  const root = path.join(dataDir, 'projects', project.id, 'workspace');
  const outside = path.join(dataDir, 'outside.txt');
  await writeFile(outside, 'secret');
  await symlink(outside, path.join(root, 'escape'));
  await symlink(path.join(dataDir, 'missing'), path.join(root, 'dangling'));

  for (const unsafe of ['../outside.txt', '.git/config', 'escape', 'dangling', '']) {
    await assert.rejects(store.readFile('owner', project.id, unsafe));
    await assert.rejects(store.writeFile('owner', project.id, unsafe, 'changed'));
  }
  await assert.rejects(store.writeFile('owner', project.id, 'large.txt', 'x'.repeat(1_000_001)), (error) => error.statusCode === 413);
  assert.equal(await readFile(outside, 'utf8'), 'secret');
  await assert.rejects(store.files('owner', project.id), /Symbolic links/);
});

test('diff includes tracked and untracked changes and checkpoint restore is explicit', async () => {
  const { store } = await fixture();
  const project = await store.create('owner', { name: 'History' });
  await store.writeFile('owner', project.id, 'index.html', '<h1>First</h1>\n');
  await store.writeFile('owner', project.id, 'new.txt', 'new file\n');
  const changes = await store.diff('owner', project.id);
  assert.match(changes, /First/);
  assert.match(changes, /new\.txt/);

  const saved = await store.checkpoint('owner', project.id, 'Known good');
  assert.match(saved.id, /^[0-9a-f]{40,64}$/);
  assert.equal((await store.get('owner', project.id)).checkpoints.at(-1).id, saved.id);
  await store.writeFile('owner', project.id, 'index.html', '<h1>Broken</h1>\n');
  await store.writeFile('owner', project.id, 'temporary.txt', 'remove me');
  await assert.rejects(store.restoreCheckpoint('owner', project.id, 'unknown'), (error) => error.statusCode === 404);
  await store.restoreCheckpoint('owner', project.id, saved.id);
  assert.equal(await store.readFile('owner', project.id, 'index.html'), '<h1>First</h1>\n');
  await assert.rejects(store.readFile('owner', project.id, 'temporary.txt'), (error) => error.statusCode === 404);
});

test('preview and artifact return bounded transport metadata', async () => {
  const { store } = await fixture();
  const project = await store.create('owner', { name: 'Output' });
  const preview = await store.preview('owner', project.id);
  assert.equal(preview.contentType, 'text/html; charset=utf-8');
  assert.match(preview.content, /Easy Agent Project/);
  const artifact = await store.artifact('owner', project.id);
  assert.equal(artifact.contentType, 'application/gzip');
  assert.match(artifact.filename, /\.tar\.gz$/);
  assert.equal(Buffer.isBuffer(artifact.buffer), true);
  assert.equal(artifact.buffer[0], 0x1f);
  assert.equal(artifact.buffer[1], 0x8b);
});

test('Git broker neutralizes repository executable configuration and hooks', async () => {
  const { dataDir, store } = await fixture();
  const project = await store.create('owner', { name: 'Broker' });
  const root = path.join(dataDir, 'projects', project.id, 'workspace');
  const marker = path.join(dataDir, 'executed');
  await mkdir(path.join(root, '.git', 'hooks'), { recursive: true });
  await writeFile(path.join(root, '.git', 'config'), `[core]\nrepositoryformatversion = 0\n[diff]\nexternal = touch ${marker}\n`);
  await writeFile(path.join(root, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o700 });
  await store.writeFile('owner', project.id, 'index.html', 'changed');
  await store.diff('owner', project.id);
  await store.checkpoint('owner', project.id, 'Safe broker');
  await assert.rejects(readFile(marker), (error) => error.code === 'ENOENT');
});

test('oversized project trees are rejected before host diff, checkpoint, or archive processing', async () => {
  const { dataDir, store } = await fixture();
  const project = await store.create('owner', { name: 'Bounded' });
  const large = path.join(dataDir, 'projects', project.id, 'workspace', 'large.bin');
  await writeFile(large, '');
  await truncate(large, 50_000_001);
  for (const method of ['diff', 'checkpoint', 'artifact']) await assert.rejects(store[method]('owner', project.id), (error) => error.statusCode === 413);
});
