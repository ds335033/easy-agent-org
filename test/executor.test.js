import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createExecutor } from '../src/executor.js';

test('executor validates project roots before starting Docker', async () => {
  const executor = createExecutor({ dockerCommand: 'definitely-not-a-command' });
  await assert.rejects(executor.run('relative', 'true'), /absolute path/);
  const root = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-executor-'));
  const link = `${root}-link`;
  await symlink(root, link);
  await assert.rejects(executor.run(link, 'true'), /symbolic link/);
});

test('executor fails closed when Docker is unavailable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-executor-'));
  const executor = createExecutor({ dockerCommand: 'definitely-not-a-command' });
  const status = await executor.status();
  assert.equal(status.available, false);
  const result = await executor.run(root, 'printf unsafe');
  assert.equal(result.exitCode, 127);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /definitely-not-a-command|ENOENT/);
});

test('executor reports Docker and image status when Docker is installed', async (t) => {
  const executor = createExecutor();
  const status = await executor.status();
  if (!status.available) return t.skip('Docker daemon is unavailable');
  assert.equal(typeof status.imageAvailable, 'boolean');
});

test('executor runs in a hardened container when the default image is available', async (t) => {
  const executor = createExecutor({ timeoutMs: 10_000 });
  const status = await executor.status();
  if (!status.imageAvailable) return t.skip('Default Docker image is unavailable');
  const storage = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-executor-'));
  const root = path.join(storage, 'project');
  const sibling = path.join(storage, 'controller-secret');
  await mkdir(root);
  await writeFile(sibling, 'must-not-be-mounted');
  process.env.CONTROLLER_ONLY_SECRET = 'must-not-leak';
  const output = [];
  const result = await executor.run(root, `set -e; printf okay; test "$(id -u)" != 0; test -z "$CONTROLLER_ONLY_SECRET"; test "$HOME" = /tmp; test ! -e /var/run/docker.sock; test ! -e ${JSON.stringify(sibling)}; test ! -w /etc; test "$(awk '/NoNewPrivs/ {print $2}' /proc/self/status)" = 1`, {
    onOutput: (stream, content) => output.push([stream, content])
  });
  delete process.env.CONTROLLER_ONLY_SECRET;
  assert.equal(result.exitCode, 0, result.stderr);
  assert.equal(result.stdout, 'okay');
  assert.deepEqual(output, [['stdout', 'okay']]);
  assert.equal(result.cancelled, false);
  assert.equal(result.timedOut, false);
});

test('executor bounds emitted output and terminates a noisy container', async (t) => {
  const executor = createExecutor({ timeoutMs: 10_000, maxOutputBytes: 2 });
  const status = await executor.status();
  if (!status.imageAvailable) return t.skip('Default Docker image is unavailable');
  const root = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-executor-'));
  const output = [];
  const result = await executor.run(root, 'printf excessive', {
    onOutput: (_stream, content) => output.push(content)
  });
  assert.equal(result.stdout, 'ex');
  assert.equal(output.join(''), 'ex');
  assert.equal(result.outputLimitExceeded, true);
  assert.notEqual(result.exitCode, 0);
});

test('executor times out and removes its container', async (t) => {
  const executor = createExecutor({ timeoutMs: 100 });
  const status = await executor.status();
  if (!status.imageAvailable) return t.skip('Default Docker image is unavailable');
  const root = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-executor-'));
  const result = await executor.run(root, 'sleep 30');
  assert.equal(result.timedOut, true);
  assert.equal(result.cancelled, false);
  assert.notEqual(result.exitCode, 0);
});
