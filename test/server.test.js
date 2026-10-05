import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../src/server.js';

const token = 'test-founder-token-that-is-long-enough';
const other = 'test-second-user-token-that-is-long-enough';
async function fixture(t, completion) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'easy-agent-http-'));
  const users = path.join(dir, 'users.json');
  await writeFile(users, JSON.stringify([{ id: 'other-user', tokenHash: createHash('sha256').update(other).digest('hex') }]));
  let call = 0;
  const provider = {
    status: () => ({ protocol: 'openai', model: 'contract-fixture' }),
    probe: async () => ({ ok: true, modelAvailable: true }),
    complete: completion || (async (_messages, _tools, { onDelta }) => {
      call += 1;
      if (call === 1) return { role: 'assistant', content: '', tool_calls: [{ id: 'edit', function: { name: 'write_file', arguments: { path: 'index.html', content: '<!doctype html><title>Changed</title><h1>Changed by task</h1>' } } }] };
      await onDelta('Updated the homepage.');
      return { role: 'assistant', content: 'Updated the homepage.', usage: { inputTokens: 10, outputTokens: 5 } };
    })
  };
  const executor = { probe: async () => ({ available: true }), run: async () => ({ exitCode: 0, stdout: 'fixture check passed', stderr: '' }) };
  const env = { ADMIN_TOKEN: token, AUTH_USERS_FILE: users, DATA_DIR: dir, HOST: '127.0.0.1', MAX_TASKS_PER_DAY: '10' };
  const app = await createApplication({ env, provider, executor });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const api = async (route, { auth = token, method = 'GET', body, ...options } = {}) => {
    const response = await fetch(base + route, { method, headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, ...options });
    return { status: response.status, body: await response.json() };
  };
  return { app, api, base, env, provider, executor };
}

test('authentication and ownership protect projects, files, previews and artifacts', async (t) => {
  const { api } = await fixture(t);
  assert.equal((await api('/api/projects', { auth: '' })).status, 401);
  const created = await api('/api/projects', { method: 'POST', body: { name: 'Private project' } });
  assert.equal(created.status, 201);
  const id = created.body.project.id;
  for (const suffix of ['', '/files', '/file?path=index.html', '/diff', '/tasks', '/preview', '/artifact']) {
    assert.equal((await api(`/api/projects/${id}${suffix}`, { auth: other })).status, 404);
  }
  assert.equal((await api('/api/projects', { auth: other })).body.projects.length, 0);
  const status = (await api('/api/status')).body;
  assert.equal(status.model.state, 'connected');
  assert.equal(JSON.stringify(status).includes(token), false);
});

test('project task journey persists history, streams events, creates diff and keeps it after checks', async (t) => {
  const { api, base, app, env, provider, executor } = await fixture(t);
  const { body } = await api('/api/projects', { method: 'POST', body: { name: 'Journey' } });
  const id = body.project.id;
  const submitted = await api(`/api/projects/${id}/tasks`, { method: 'POST', body: { prompt: 'Update homepage' } });
  assert.equal(submitted.status, 202);
  const taskId = submitted.body.task.id;
  const stream = await fetch(`${base}/api/tasks/${taskId}/events`, { headers: { authorization: `Bearer ${token}` } });
  const events = await stream.text();
  assert.match(events, /tool_start/);
  assert.match(events, /completed/);
  assert.equal((await api(`/api/tasks/${taskId}`, { auth: other })).status, 404);
  assert.match((await api(`/api/projects/${id}/diff`)).body.diff, /Changed by task/);
  const check = await api(`/api/projects/${id}/checks`, { method: 'POST', body: { command: 'npm test' } });
  for (let i = 0; i < 100; i += 1) {
    if ((await api(`/api/tasks/${check.body.task.id}`)).body.task.status === 'completed') break;
    await delay(10);
  }
  assert.equal((await api(`/api/tasks/${check.body.task.id}`)).body.task.status, 'completed');
  assert.match((await api(`/api/projects/${id}/diff`)).body.diff, /Changed by task/);
  const preview = await fetch(`${base}/api/projects/${id}/preview`, { headers: { authorization: `Bearer ${token}` } });
  assert.match(await preview.text(), /Changed by task/);
  assert.match(preview.headers.get('content-security-policy'), /sandbox/);
  const artifact = await fetch(`${base}/api/projects/${id}/artifact`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(artifact.status, 200);
  assert.equal(new Uint8Array(await artifact.arrayBuffer())[0], 0x1f);
  const reloaded = await createApplication({ env, provider, executor });
  assert.equal((await reloaded.tasks.list('founder', id)).length, 2);
  await reloaded.close();
});

test('cancellation reaches a terminal state and recovers capacity', async (t) => {
  const { api } = await fixture(t, async (_m, _t, { signal }) => {
    await delay(10_000, undefined, { signal });
    return { role: 'assistant', content: 'late' };
  });
  const project = (await api('/api/projects', { method: 'POST', body: { name: 'Cancel' } })).body.project;
  const task = (await api(`/api/projects/${project.id}/tasks`, { method: 'POST', body: { prompt: 'Long task' } })).body.task;
  assert.equal((await api(`/api/projects/${project.id}/tasks`, { method: 'POST', body: { prompt: 'Concurrent' } })).status, 409);
  await api(`/api/tasks/${task.id}/cancel`, { method: 'POST', body: {} });
  for (let i = 0; i < 100; i += 1) {
    if ((await api(`/api/tasks/${task.id}`)).body.task.status === 'cancelled') break;
    await delay(10);
  }
  assert.equal((await api(`/api/tasks/${task.id}`)).body.task.status, 'cancelled');
});

test('malformed JSON and foreign origins are rejected', async (t) => {
  const { base } = await fixture(t);
  const invalid = await fetch(`${base}/api/projects`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{' });
  assert.equal(invalid.status, 400);
  const cross = await fetch(`${base}/api/projects`, { headers: { authorization: `Bearer ${token}`, origin: 'https://example.invalid' } });
  assert.equal(cross.status, 403);
});
