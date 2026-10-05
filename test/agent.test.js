import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgent } from '../src/agent.js';

test('agent executes a tool call and returns the final response', async () => {
  const replies = [
    { message: { role: 'assistant', content: '', tool_calls: [{ id: '1', function: { name: 'list_files', arguments: '{}' } }] } },
    { message: { role: 'assistant', content: 'Workspace inspected.' } }
  ];
  const requests = [];
  const agent = createAgent({
    workspace: { listFiles: async () => [{ name: 'README.md' }] },
    baseUrl: 'http://model.local', model: 'test-model',
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => replies.shift() };
    }
  });
  const result = await agent.run('demo', 'Inspect this');
  assert.equal(result.answer, 'Workspace inspected.');
  assert.deepEqual(result.events, [{ tool: 'list_files', ok: true }]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].messages.at(-1).role, 'tool');
});
