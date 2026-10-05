import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpManager } from '../src/mcp.js';

test('MCP manager discovers and invokes namespaced tools', async () => {
  const methods = [];
  const manager = createMcpManager({
    integrations: [{ id: 'docs', label: 'Docs', kind: 'mcp', url: 'https://example.test/mcp', auth: 'public' }],
    enabled: ['docs'],
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body); methods.push(request.method);
      const result = request.method === 'tools/list'
        ? { tools: [{ name: 'search', description: 'Search docs', inputSchema: { type: 'object' } }] }
        : request.method === 'tools/call' ? { content: [{ type: 'text', text: 'found' }] } : {};
      return { ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ jsonrpc: '2.0', id: request.id, result }) };
    }
  });
  const tools = await manager.tools();
  assert.equal(tools[0].function.name, 'mcp__docs__search');
  const result = await manager.call('mcp__docs__search', { query: 'workers' });
  assert.equal(result.content[0].text, 'found');
  assert.deepEqual(methods, ['initialize', 'tools/list', 'tools/call']);
});
