import assert from 'node:assert/strict';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createWorkspaceManager } from '../src/workspace.js';

test('workspace reads, writes, lists, and runs commands', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-'));
  const workspace = createWorkspaceManager(base);
  await workspace.ensureSession('demo');
  await workspace.writeText('demo', 'src/hello.txt', 'hello');
  assert.equal(await workspace.readText('demo', 'src/hello.txt'), 'hello');
  assert.deepEqual((await workspace.listFiles('demo')).map((item) => item.name), ['src']);
  const result = await workspace.runCommand('demo', 'pwd; test -f src/hello.txt');
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /demo/);
});

test('workspace rejects path traversal and invalid sessions', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-'));
  const workspace = createWorkspaceManager(base);
  assert.throws(() => workspace.safePath('demo', '../../outside'), /escapes workspace/);
  await assert.rejects(workspace.ensureSession('../bad'), /Invalid session/);
});

test('workspace rejects symbolic-link escapes', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-'));
  const outside = path.join(base, 'secret.txt');
  await writeFile(outside, 'secret');
  const workspace = createWorkspaceManager(path.join(base, 'sessions'));
  const root = await workspace.ensureSession('demo');
  await symlink(outside, path.join(root, 'link.txt'));
  await assert.rejects(workspace.readText('demo', 'link.txt'), /Symbolic links/);
  await assert.rejects(workspace.writeText('demo', 'link.txt', 'changed'), /Symbolic links/);
});

test('commands do not inherit application secrets', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-'));
  const workspace = createWorkspaceManager(base);
  process.env.MODEL_API_KEY = 'must-not-leak';
  const result = await workspace.runCommand('demo', 'test -z "$MODEL_API_KEY"');
  delete process.env.MODEL_API_KEY;
  assert.equal(result.exitCode, 0);
});
