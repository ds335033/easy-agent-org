import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createModelProvider } from '../src/model-provider.js';

async function mockServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('Ollama completion and probe use native endpoints and normalize calls', async (t) => {
  const requests = [];
  const mock = await mockServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, method: req.method, body: chunks.length ? JSON.parse(Buffer.concat(chunks)) : null });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'coder' }] }));
    res.end(JSON.stringify({ message: { content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'a.js' } } }] } }));
  });
  t.after(mock.close);
  const provider = createModelProvider({ protocol: 'ollama', baseUrl: mock.baseUrl, model: 'coder', maxOutputTokens: 123, think: false });
  const message = await provider.complete([{ role: 'user', content: 'inspect' }], []);
  assert.equal(requests[0].url, '/api/chat');
  assert.equal(requests[0].body.options.num_predict, 123);
  assert.equal(requests[0].body.think, false);
  assert.equal(message.tool_calls[0].function.arguments.path, 'a.js');
  assert.match(message.tool_calls[0].id, /^call_/);
  assert.deepEqual(await provider.probe(), { ok: true, modelAvailable: true, models: ['coder'] });
});

test('OpenAI completion uses v1 paths, auth, limits, and normalizes string arguments', async (t) => {
  const requests = [];
  const mock = await mockServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, authorization: req.headers.authorization, body: chunks.length ? JSON.parse(Buffer.concat(chunks)) : null });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'omni' }] }));
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'abc', type: 'function', function: { name: 'write_file', arguments: '{"path":"x"}' } }] } }] }));
  });
  t.after(mock.close);
  const provider = createModelProvider({ protocol: 'openai', baseUrl: `${mock.baseUrl}/v1`, model: 'omni', apiKey: 'secret', maxOutputTokens: 456 });
  const message = await provider.complete([], []);
  assert.equal(requests[0].url, '/v1/chat/completions');
  assert.equal(requests[0].authorization, 'Bearer secret');
  assert.equal(requests[0].body.max_tokens, 456);
  assert.deepEqual(message.tool_calls[0].function.arguments, { path: 'x' });
  assert.deepEqual(await provider.probe(), { ok: true, modelAvailable: true, models: ['omni'] });
  assert.equal(JSON.stringify(provider.status()).includes('secret'), false);
  assert.equal(JSON.stringify(provider.status()).includes(mock.baseUrl), false);
});

test('rejects unsafe provider URLs and reports sanitized HTTP failures', async () => {
  assert.throws(() => createModelProvider({ baseUrl: 'http://models.example.com', model: 'x' }), /HTTPS/);
  assert.throws(() => createModelProvider({ baseUrl: 'https://user:pass@example.com/v1', model: 'x' }), /credentials/);
  assert.throws(() => createModelProvider({ baseUrl: 'https://example.com/v1?key=secret', model: 'x' }), /query/);
  const provider = createModelProvider({
    baseUrl: 'https://example.com/v1', model: 'x', apiKey: 'top-secret',
    fetchImpl: async () => new Response('provider leaked top-secret', { status: 401 })
  });
  await assert.rejects(provider.complete([], []), (error) => error.message === 'Model provider request failed (401)');
});

test('timeout remains active while the response body is read', async () => {
  const provider = createModelProvider({
    baseUrl: 'https://example.com/v1', model: 'x', timeoutMs: 10,
    fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      }
    }))
  });
  await assert.rejects(provider.complete([], []), /timed out/);
});

test('OpenAI SSE streaming assembles content, tool fragments, and usage', async () => {
  const encoder = new TextEncoder();
  const events = [
    { choices: [{ delta: { content: 'Hello ' } }] },
    { choices: [{ delta: { content: 'world', tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_', arguments: '{"path":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'file', arguments: '"a.js"}' } }] } }], usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 } }
  ];
  const provider = createModelProvider({
    protocol: 'openai', baseUrl: 'https://example.com/v1', model: 'x',
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    }), { headers: { 'content-type': 'text/event-stream' } })
  });
  const deltas = [];
  const result = await provider.complete([], [], { onDelta: (delta) => deltas.push(delta) });
  assert.equal(result.content, 'Hello world');
  assert.deepEqual(deltas, ['Hello ', 'world']);
  assert.equal(result.tool_calls[0].id, 'call_1');
  assert.equal(result.tool_calls[0].function.name, 'read_file');
  assert.deepEqual(result.tool_calls[0].function.arguments, { path: 'a.js' });
  assert.deepEqual(result.usage, { inputTokens: 2, outputTokens: 3, totalTokens: 5 });
});

test('streaming completion honors caller cancellation', async () => {
  const controller = new AbortController();
  const provider = createModelProvider({
    protocol: 'ollama', baseUrl: 'https://example.com', model: 'x',
    fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
      start(stream) {
        signal.addEventListener('abort', () => stream.error(new DOMException('aborted', 'AbortError')));
      }
    }))
  });
  const pending = provider.complete([], [], { signal: controller.signal, onDelta() {} });
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});

test('an already-cancelled call does not contact the provider', async () => {
  let contacted = false;
  const provider = createModelProvider({ protocol: 'openai', baseUrl: 'https://example.com/v1', model: 'x', fetchImpl: async () => { contacted = true; throw new Error(); } });
  await assert.rejects(provider.complete([], [], { signal: AbortSignal.abort(), onDelta() {} }), /cancelled/);
  assert.equal(contacted, false);
});

test('a truncated stream is a failure, not a completed answer', async () => {
  const provider = createModelProvider({ protocol: 'openai', baseUrl: 'https://example.com/v1', model: 'x', fetchImpl: async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\r\n\r\n', { headers: { 'content-type': 'text/event-stream' } }) });
  await assert.rejects(provider.complete([], [], { onDelta() {} }), /before completion/);
});

test('OpenAI follow-up messages serialize tool arguments using its schema', async () => {
  let body;
  const provider = createModelProvider({ protocol: 'openai', baseUrl: 'https://example.com/v1', model: 'x', fetchImpl: async (_url, options) => {
    body = JSON.parse(options.body);
    return Response.json({ choices: [{ message: { content: 'saved' } }] });
  } });
  await provider.complete([{ role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'write_file', arguments: { path: 'a.js', content: 'okay' } } }] }], []);
  assert.equal(typeof body.messages[0].tool_calls[0].function.arguments, 'string');
  assert.equal(JSON.parse(body.messages[0].tool_calls[0].function.arguments).path, 'a.js');
});

test('Ollama streamed independent tool calls do not concatenate their names', async () => {
  const chunks = [
    { message: { tool_calls: [{ function: { name: 'read_file', arguments: { path: 'index.html' } } }] } },
    { message: { tool_calls: [{ function: { name: 'write_file', arguments: { path: 'index.html', content: 'hello' } } }] } },
    { done: true }
  ];
  const provider = createModelProvider({ protocol: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'x', fetchImpl: async () => new Response(chunks.map(c => JSON.stringify(c)).join('\n')) });
  const result = await provider.complete([], [], { onDelta() {} });
  assert.deepEqual(result.tool_calls.map(c => c.function.name), ['read_file', 'write_file']);
  assert.equal(result.tool_calls[1].function.arguments.content, 'hello');
});
