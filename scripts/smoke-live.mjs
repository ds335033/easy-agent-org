import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const base = process.env.TEST_APP_URL || 'http://127.0.0.1:3000';
const credentials = JSON.parse(await readFile('.runtime/local-credentials.json', 'utf8'));
const request = async (route, body) => {
  const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${credentials.adminToken}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`Application request failed (${response.status})`);
  return response.json();
};
const wait = async (id) => {
  for (let i = 0; i < 240; i += 1) {
    const { task } = await request(`/api/tasks/${id}`);
    if (['completed', 'failed', 'cancelled', 'interrupted'].includes(task.status)) return task;
    await delay(1000);
  }
  throw new Error('Live task validation exceeded four minutes');
};
const { project } = await request('/api/projects', { name: 'Live gateway validation' });
const connection = await request('/api/status');
const created = await request(`/api/projects/${project.id}/tasks`, { prompt: 'Use read_file to inspect index.html. Then use write_file to change its h1 heading to exactly Easy Agent Live. Keep a nonempty title and valid HTML. Finish after saving the file. Do not run commands; checks will run separately.' });
console.log('Submitted live model coding task');
const task = await wait(created.task.id);
assert.equal(task.status, 'completed', task.error);
const diff = await request(`/api/projects/${project.id}/diff`);
assert.match(diff.diff, /Easy Agent Live/);
const check = await request(`/api/projects/${project.id}/checks`, { command: 'npm test' });
console.log('Model edit verified; running project checks in Docker');
let result = await wait(check.task.id);
let recovered = false;
if (result.status === 'failed') {
  console.log('Checks found a regression; requesting a real model repair');
  const repair = await request(`/api/projects/${project.id}/tasks`, { prompt: 'The check failed because your previous edit removed the title. Use write_file to replace index.html with this COMPLETE content exactly: <!doctype html><html><head><title>Easy Agent</title></head><body><h1>Easy Agent Live</h1></body></html>. Do not write only the heading. Finish after saving.' });
  assert.equal((await wait(repair.task.id)).status, 'completed');
  const retry = await request(`/api/projects/${project.id}/checks`, { command: 'npm test' });
  result = await wait(retry.task.id);
  recovered = true;
}
assert.equal(result.status, 'completed', result.error || result.answer);
assert.equal(result.result.exitCode, 0);
const preview = await fetch(`${base}/api/projects/${project.id}/preview`, { headers: { authorization: `Bearer ${credentials.adminToken}` } });
assert.equal(preview.status, 200);
assert.match(await preview.text(), /Easy Agent Live/);
assert.match((await request(`/api/projects/${project.id}/diff`)).diff, /Easy Agent Live/);
const evidence = { at: new Date().toISOString(), projectId: project.id, taskId: task.id, checkId: result.id, model: connection.model.model, transport: connection.model.protocol, taskStatus: task.status, checksExitCode: result.result.exitCode, preview: 'passed', diffPreserved: true, recovered, usage: task.usage };
await writeFile('.runtime/live-validation.json', JSON.stringify(evidence, null, 2), { mode: 0o600 });
console.log(JSON.stringify(evidence));
