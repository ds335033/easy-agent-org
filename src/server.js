import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgent } from './agent.js';
import { createMcpManager, loadIntegrationRegistry } from './mcp.js';
import { createWorkspaceManager } from './workspace.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(here, '../data/workspaces'));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const adminToken = process.env.ADMIN_TOKEN || '';
const model = process.env.MODEL_NAME || 'qwen3-coder';
const baseUrl = process.env.MODEL_BASE_URL || 'http://127.0.0.1:11434';
const workspace = createWorkspaceManager(dataDir, { commandTimeout: Number(process.env.COMMAND_TIMEOUT_MS || 30_000) });
const integrations = await loadIntegrationRegistry(path.resolve(here, '../config/integrations.json'));
const mcp = createMcpManager({ integrations, enabled: (process.env.MCP_ENABLE || '').split(',').map((value) => value.trim()).filter(Boolean) });
const agent = createAgent({
  workspace, mcp, baseUrl, model, apiKey: process.env.MODEL_API_KEY || '',
  maxSteps: Number(process.env.MAX_AGENT_STEPS || 8)
});

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'x-content-type-options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function bodyOf(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function authorized(req) {
  if (!adminToken) return true;
  const supplied = req.headers.authorization || '';
  const expected = `Bearer ${adminToken}`;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function serveStatic(reqPath, res) {
  const requested = reqPath === '/' ? 'index.html' : reqPath.slice(1);
  const target = path.resolve(publicDir, requested);
  if (!target.startsWith(`${publicDir}${path.sep}`)) return send(res, 404, { error: 'Not found' });
  try {
    const metadata = await stat(target);
    if (!metadata.isFile()) throw new Error('Not a file');
    const ext = path.extname(target);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    createReadStream(target).pipe(res);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/') && !authorized(req)) return send(res, 401, { error: 'Unauthorized' });
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return send(res, 200, { ok: true, model });
      }
      if (req.method === 'GET' && url.pathname === '/api/integrations') return send(res, 200, { integrations: mcp.status() });
      if (req.method === 'POST' && url.pathname === '/api/sessions') {
        const body = await bodyOf(req);
        await workspace.ensureSession(body.session);
        return send(res, 201, { session: body.session });
      }
      if (req.method === 'GET' && url.pathname === '/api/files') {
        return send(res, 200, { files: await workspace.listFiles(url.searchParams.get('session'), url.searchParams.get('path') || '.') });
      }
      if (req.method === 'GET' && url.pathname === '/api/file') {
        return send(res, 200, { content: await workspace.readText(url.searchParams.get('session'), url.searchParams.get('path')) });
      }
      if (req.method === 'PUT' && url.pathname === '/api/file') {
        const body = await bodyOf(req);
        return send(res, 200, await workspace.writeText(body.session, body.path, body.content));
      }
      if (req.method === 'POST' && url.pathname === '/api/terminal') {
        const body = await bodyOf(req);
        return send(res, 200, await workspace.runCommand(body.session, body.command));
      }
      if (req.method === 'GET' && url.pathname === '/api/git') {
        return send(res, 200, await workspace.gitSummary(url.searchParams.get('session')));
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const body = await bodyOf(req);
        await workspace.ensureSession(body.session);
        return send(res, 200, await agent.run(body.session, body.prompt, body.history));
      }
      if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, res);
      return send(res, 404, { error: 'Not found' });
    } catch (error) {
      const status = /Invalid|escapes|required|too large/.test(error.message) ? 400 : 500;
      return send(res, status, { error: error.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!adminToken && !['127.0.0.1', 'localhost', '::1'].includes(host) && process.env.LOCAL_DEV !== 'true') {
    throw new Error('ADMIN_TOKEN is required for a non-loopback listener unless LOCAL_DEV=true is explicitly set');
  }
  createServer().listen(port, host, () => {
    console.log(`Easy Agent GPT listening on http://${host}:${port}`);
  });
}
