import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { createAgent } from './agent.js';
import { createModelProvider } from './model-provider.js';
import { createExecutor } from './executor.js';
import { createProjectStore } from './projects.js';
import { createTaskStore } from './tasks.js';
import { loadIntegrationRegistry } from './mcp.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public');
const fault = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const positive = (value, fallback, max) => {
  const result = Number(value || fallback);
  if (!Number.isInteger(result) || result < 1 || result > max) throw new Error('Invalid configured limit');
  return result;
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'content-type': type, 'x-content-type-options': 'nosniff',
    'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-src blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function bodyOf(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw fault('Use application/json', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw fault('Request body too large', 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch { throw fault('Invalid JSON object', 400); }
}

export async function createApplication(options = {}) {
  const env = options.env || process.env;
  const host = env.HOST || '127.0.0.1';
  const localDev = env.LOCAL_DEV === 'true';
  if (localDev && !['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('LOCAL_DEV is only supported on a loopback listener');
  const auth = await createAuth({ adminToken: env.ADMIN_TOKEN, usersFile: env.AUTH_USERS_FILE, localDev });
  const dataDir = path.resolve(env.DATA_DIR || path.join(here, '../data'));
  const limits = {
    steps: positive(env.MAX_AGENT_STEPS, 8, 40),
    concurrent: positive(env.MAX_CONCURRENT_TASKS, 2, 40),
    dailyTasks: positive(env.MAX_TASKS_PER_DAY, 100, 100_000),
    taskTimeoutMs: positive(env.TASK_TIMEOUT_MS, 300_000, 3_600_000)
  };
  const provider = options.provider || createModelProvider({
    protocol: env.MODEL_PROTOCOL || 'ollama',
    baseUrl: env.MODEL_BASE_URL || 'http://127.0.0.1:11434',
    model: env.MODEL_NAME || 'qwen3:1.7b', apiKey: env.MODEL_API_KEY || '',
    timeoutMs: positive(env.MODEL_TIMEOUT_MS, 120_000, 900_000),
    maxOutputTokens: positive(env.MAX_OUTPUT_TOKENS, 4096, 32768),
    think: env.MODEL_THINK === undefined || env.MODEL_THINK === '' ? undefined : env.MODEL_THINK === 'true' ? true : env.MODEL_THINK === 'false' ? false : env.MODEL_THINK
  });
  const executor = options.executor || createExecutor({
    image: env.EXECUTOR_IMAGE || 'node:24-bookworm',
    timeoutMs: positive(env.COMMAND_TIMEOUT_MS, 30_000, 600_000)
  });
  const projects = createProjectStore({ dataDir, executor });
  await projects.init();
  const integrations = await loadIntegrationRegistry(path.resolve(here, '../config/integrations.json'));
  const tasks = await createTaskStore({
    dataDir, projects, maxConcurrent: limits.concurrent, maxTasksPerDay: limits.dailyTasks, taskTimeoutMs: limits.taskTimeoutMs,
    agentFor: (owner) => createAgent({ provider, maxSteps: limits.steps, workspace: {
      listFiles: (id, file) => projects.files(owner, id, file),
      readText: (id, file) => projects.readFile(owner, id, file),
      writeText: (id, file, content) => projects.writeFile(owner, id, file, content),
      runCommand: (id, command, opts) => projects.run(owner, id, command, opts),
      gitSummary: (id) => projects.diff(owner, id)
    } })
  });
  let modelProbe = null;
  let executorProbe = null;
  let checkedAt = 0;
  async function status(user) {
    if (Date.now() - checkedAt > 15_000) {
      const [modelResult, executionResult] = await Promise.allSettled([provider.probe(), executor.probe()]);
      modelProbe = modelResult.status === 'fulfilled' ? { ...modelResult.value, state: modelResult.value.modelAvailable ? 'connected' : 'reachable_model_unlisted' } : { state: 'unavailable', error: 'Model connection failed' };
      executorProbe = executionResult.status === 'fulfilled' ? executionResult.value : { available: false, error: 'Docker executor unavailable' };
      checkedAt = Date.now();
    }
    return {
      user, model: { ...provider.status(), ...modelProbe }, executor: executorProbe, limits,
      integrations: integrations.map((entry) => ({ id: entry.id, label: entry.label, kind: entry.kind, state: entry.auth === 'public' ? 'available' : 'needs_setup', connected: false })),
      checkedAt: new Date(checkedAt).toISOString(),
      publishing: { available: false, reason: 'Existing Sites source and publishing authorization are not available in this environment.' },
      payments: { available: false, reason: 'Existing payment source and verified Stripe sandbox account are required.' }
    };
  }
  const server = http.createServer(async (req, res) => {
    try {
      const authority = req.headers.host || 'localhost';
      const url = new URL(req.url, `http://${authority}`);
      const hostname = authority.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
      if (localDev && !['localhost', '127.0.0.1', '::1'].includes(hostname)) throw fault('Invalid local host', 403);
      if (req.headers.origin) {
        const origin = new URL(req.headers.origin);
        if (origin.host !== authority && origin.origin !== env.PUBLIC_ORIGIN) throw fault('Origin not allowed', 403);
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true });
      if (!url.pathname.startsWith('/api/')) {
        const staticFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'] };
        const target = staticFiles[url.pathname];
        if (req.method !== 'GET' || !target) return send(res, 404, { error: 'Not found' });
        return send(res, 200, await readFile(path.join(publicDir, target[0])), target[1]);
      }
      const user = auth.authenticate(req);
      if (!user) return send(res, 401, { error: 'Sign in with your workspace access token.' });
      if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, await status(user));
      if (req.method === 'GET' && url.pathname === '/api/integrations') return send(res, 200, { integrations: (await status(user)).integrations });
      if (url.pathname === '/api/projects') {
        if (req.method === 'GET') return send(res, 200, { projects: await projects.list(user.id) });
        if (req.method === 'POST') return send(res, 201, { project: await projects.create(user.id, await bodyOf(req)) });
      }
      const taskRoute = /^\/api\/tasks\/([a-f0-9-]{36})(?:\/(events|cancel))?$/.exec(url.pathname);
      if (taskRoute) {
        const [, id, operation] = taskRoute;
        const task = tasks.get(user.id, id);
        if (req.method === 'POST' && operation === 'cancel') return send(res, 200, { task: await tasks.cancel(user.id, id) });
        if (req.method === 'GET' && !operation) return send(res, 200, { task });
        if (req.method === 'GET' && operation === 'events') {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff' });
          const write = (snapshot) => {
            if (!res.destroyed) res.write(`data: ${JSON.stringify({ task: snapshot })}\n\n`);
            if (['completed', 'failed', 'cancelled', 'interrupted'].includes(snapshot.status)) res.end();
          };
          const unsubscribe = tasks.subscribe(user.id, id, write);
          const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': heartbeat\n\n'); }, 15_000);
          res.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
          write(task);
          return;
        }
      }
      const projectRoute = /^\/api\/projects\/([a-f0-9-]{36})(?:\/(files|file|diff|checkpoint|restore|tasks|checks|preview|artifact))?$/.exec(url.pathname);
      if (projectRoute) {
        const [, id, operation] = projectRoute;
        await projects.get(user.id, id);
        const file = url.searchParams.get('path') || '.';
        if (req.method === 'GET') {
          if (!operation) return send(res, 200, { project: await projects.get(user.id, id) });
          if (operation === 'files') return send(res, 200, { files: await projects.files(user.id, id, file) });
          if (operation === 'file') return send(res, 200, { content: await projects.readFile(user.id, id, file) });
          if (operation === 'diff') return send(res, 200, { diff: await projects.diff(user.id, id) });
          if (operation === 'tasks') return send(res, 200, { tasks: await tasks.list(user.id, id) });
          if (operation === 'preview') {
            const preview = await projects.preview(user.id, id, url.searchParams.get('path') || 'index.html');
            res.writeHead(200, { 'content-type': preview.contentType, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'" });
            return res.end(preview.content);
          }
          if (operation === 'artifact') {
            const artifact = await projects.artifact(user.id, id);
            res.setHeader('content-disposition', `attachment; filename="${artifact.filename}"`);
            return send(res, 200, artifact.buffer, artifact.contentType);
          }
        }
        if (['PUT', 'POST'].includes(req.method)) {
          const body = await bodyOf(req);
          if (req.method === 'POST' && operation === 'tasks') return send(res, 202, { task: await tasks.create(user.id, id, { prompt: body.prompt }) });
          if (req.method === 'POST' && operation === 'checks') return send(res, 202, { task: await tasks.create(user.id, id, { command: body.command, kind: 'check' }) });
          if (tasks.busy(id)) throw fault('Wait for the current task to finish before editing or restoring this project', 409);
          if (req.method === 'PUT' && operation === 'file') return send(res, 200, await projects.writeFile(user.id, id, body.path, body.content));
          if (operation === 'checkpoint') return send(res, 201, { checkpoint: await projects.checkpoint(user.id, id) });
          if (operation === 'restore') {
            const record = await projects.get(user.id, id);
            return send(res, 200, { checkpoint: await projects.restoreCheckpoint(user.id, id, body.checkpointId || record.checkpoints.at(-1)?.id) });
          }
        }
      }
      return send(res, 404, { error: 'Not found' });
    } catch (error) {
      const code = error.statusCode || (/Invalid|invalid|required|escapes|Symbolic/.test(error.message) ? 400 : 500);
      send(res, code, { error: code === 500 ? 'Operation failed. Check configuration and retry.' : error.message });
    }
  });
  server.requestTimeout = 30_000;
  return { server, projects, tasks, provider, executor, async close() { await tasks.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

export async function createServer(options) { return (await createApplication(options)).server; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createApplication();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => console.log(`Easy Agent Codex listening on ${host}:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void app.close().finally(() => process.exit(0)); });
}
