import { readFile } from 'node:fs/promises';

const nameFor = (serverId, tool) => `mcp__${serverId.replaceAll('-', '_')}__${tool}`;

export async function loadIntegrationRegistry(file) {
  const entries = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(entries)) throw new Error('Integration registry must be an array');
  return entries;
}

export function createMcpManager({ integrations, enabled = [], fetchImpl = fetch }) {
  const active = integrations.filter((item) => item.kind === 'mcp' && enabled.includes(item.id));
  const sessions = new Map();
  const discovered = new Map();

  async function rpc(server, method, params = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
    const token = server.tokenEnv ? process.env[server.tokenEnv] : '';
    if (token) headers.authorization = `Bearer ${token}`;
    if (sessions.has(server.id)) headers['mcp-session-id'] = sessions.get(server.id);
    try {
      const response = await fetchImpl(server.url, {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params })
      });
      if (!response.ok) throw new Error(`${server.label} MCP returned ${response.status}`);
      const session = response.headers.get('mcp-session-id');
      if (session) sessions.set(server.id, session);
      if ((response.headers.get('content-type') || '').includes('text/event-stream')) {
        const data = (await response.text()).split('\n').findLast((line) => line.startsWith('data:'))?.slice(5).trim();
        if (!data) throw new Error(`${server.label} MCP returned no event data`);
        return JSON.parse(data);
      }
      return response.json();
    } finally { clearTimeout(timer); }
  }

  async function tools() {
    const definitions = [];
    for (const server of active) {
      try {
        await rpc(server, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'easy-agent-gpt', version: '0.1.0' } });
        const response = await rpc(server, 'tools/list');
        for (const tool of response.result?.tools ?? []) {
          const name = nameFor(server.id, tool.name);
          discovered.set(name, { server, tool: tool.name });
          definitions.push({ type: 'function', function: { name, description: `[${server.label}] ${tool.description || tool.name}`, parameters: tool.inputSchema || { type: 'object' } } });
        }
      } catch (error) { discovered.set(`error:${server.id}`, error.message); }
    }
    return definitions;
  }

  async function call(name, args) {
    const target = discovered.get(name);
    if (!target) throw new Error('Unknown or unavailable MCP tool');
    const response = await rpc(target.server, 'tools/call', { name: target.tool, arguments: args });
    if (response.error) throw new Error(response.error.message || 'MCP tool failed');
    return response.result;
  }

  const status = () => integrations.map((item) => ({
    id: item.id, label: item.label, kind: item.kind, auth: item.auth,
    enabled: enabled.includes(item.id),
    configured: item.auth === 'public' || Boolean(item.tokenEnv && process.env[item.tokenEnv])
  }));
  return { call, status, tools };
}
