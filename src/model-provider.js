import { randomUUID } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

function isLoopback(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function validateBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid model provider URL');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Model provider URL must not contain credentials, query parameters, or a fragment');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new Error('Model provider URL must use HTTPS unless it is loopback');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
}

function positiveInteger(value, name, fallback) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error(`${name} must be a positive integer`);
  return result;
}

async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('Model provider response is too large');
    return JSON.parse(text);
  }
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Model provider response is too large');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function normalizeArguments(value) {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Preserve malformed provider output for the tool layer to reject safely.
    }
    return value;
  }
  return value;
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') throw new Error('Model provider returned no assistant message');
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  return {
    role: 'assistant',
    content: typeof message.content === 'string' ? message.content : '',
    ...(calls.length ? {
      tool_calls: calls.map((call) => {
        const fn = call.function ?? call;
        if (typeof fn.name !== 'string' || !fn.name) throw new Error('Model provider returned an invalid tool call');
        return {
          id: typeof call.id === 'string' && call.id ? call.id : `call_${randomUUID()}`,
          type: 'function',
          function: { name: fn.name, arguments: normalizeArguments(fn.arguments) }
        };
      })
    } : {})
  };
}

export function createModelProvider(options) {
  const {
    protocol = 'ollama', baseUrl, model, apiKey = '', fetchImpl = fetch
  } = options ?? {};
  if (!['ollama', 'openai'].includes(protocol)) throw new Error('Unsupported model provider protocol');
  if (typeof model !== 'string' || !model.trim()) throw new Error('Model is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetchImpl must be a function');
  const url = validateBaseUrl(baseUrl);
  const timeoutMs = positiveInteger(options?.timeoutMs, 'timeoutMs', DEFAULT_TIMEOUT_MS);
  const maxOutputTokens = positiveInteger(options?.maxOutputTokens, 'maxOutputTokens', DEFAULT_MAX_OUTPUT_TOKENS);
  const think = options?.think;
  if (think !== undefined && typeof think !== 'boolean') throw new Error('think must be a boolean when configured');
  const thinking = think === undefined ? {} : { think };

  function endpoint(pathname) {
    const result = new URL(url);
    result.pathname = `${url.pathname}${pathname}`.replace(/\/{2,}/g, '/');
    return result.href;
  }

  async function requestRaw(pathname, init = {}, externalSignal) {
    if (externalSignal?.aborted) throw new Error('Model provider request cancelled');
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint(pathname), {
        ...init,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...init.headers
        }
      });
      if (!response.ok) throw new Error(`Model provider request failed (${response.status})`);
      return {
        response,
        signal: controller.signal,
        cleanup() {
          clearTimeout(timer);
          externalSignal?.removeEventListener('abort', abort);
        },
        wasCancelled: () => Boolean(externalSignal?.aborted)
      };
    } catch (error) {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abort);
      if (error.name === 'AbortError' || controller.signal.aborted) {
        throw new Error(externalSignal?.aborted ? 'Model provider request cancelled' : 'Model provider request timed out');
      }
      if (/^Model provider request failed/.test(error.message)) throw error;
      throw new Error('Model provider request failed');
    }
  }

  async function request(pathname, init = {}, externalSignal, deadlineMs = timeoutMs) {
    if (externalSignal?.aborted) throw new Error('Model provider request cancelled');
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    try {
      const response = await fetchImpl(endpoint(pathname), {
        ...init,
        redirect: 'error',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(init.body ? { 'content-type': 'application/json' } : {}),
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...init.headers
        }
      });
      if (!response.ok) throw new Error(`Model provider request failed (${response.status})`);
      try {
        return await boundedJson(response);
      } catch (error) {
        if (error.name === 'AbortError' || controller.signal.aborted) throw error;
        if (/too large/.test(error.message)) throw error;
        throw new Error('Model provider returned an invalid response');
      }
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) {
        throw new Error(externalSignal?.aborted ? 'Model provider request cancelled' : 'Model provider request timed out');
      }
      if (/^Model provider (?:request failed|returned|response is)/.test(error.message)) throw error;
      throw new Error('Model provider request failed');
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abort);
    }
  }

  async function readEventStream(streamRequest, kind, onDelta) {
    const { response, signal } = streamRequest;
    if (!response.body) throw new Error('Model provider returned an invalid response');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let bytes = 0;
    let content = '';
    let usage;
    let completed = false;
    const calls = new Map();
    const consume = async (payload) => {
      if (!payload) return;
      if (payload === '[DONE]') { completed = true; return; }
      let event;
      try { event = JSON.parse(payload); } catch { throw new Error('Model provider returned an invalid response'); }
      if (event.error) throw new Error('Model provider reported a stream error');
      if (event.done || event.choices?.some((choice) => choice.finish_reason)) completed = true;
      const delta = kind === 'ollama' ? event.message : event.choices?.[0]?.delta;
      const text = typeof delta?.content === 'string' ? delta.content : '';
      if (text) { content += text; await onDelta?.(text); }
      for (const [position, call] of (delta?.tool_calls ?? []).entries()) {
        const fn = call.function ?? call;
        // Ollama emits complete tool calls in separate NDJSON chunks, not
        // OpenAI argument/name fragments. Merging chunk position zero would
        // turn read_file + write_file into the invalid read_filewrite_file.
        if (kind === 'ollama') {
          calls.set(calls.size, { id: call.id || '', name: fn.name, arguments: fn.arguments });
          continue;
        }
        const index = call.index ?? position;
        const current = calls.get(index) ?? { id: '', name: '', arguments: '' };
        if (call.id) current.id += call.id;
        if (fn.name) current.name += fn.name;
        if (typeof fn.arguments === 'string') current.arguments += fn.arguments;
        else if (fn.arguments && typeof fn.arguments === 'object') current.arguments = fn.arguments;
        calls.set(index, current);
      }
      if (kind === 'ollama' && event.done) usage = { inputTokens: event.prompt_eval_count, outputTokens: event.eval_count };
      if (kind === 'openai' && event.usage) usage = { inputTokens: event.usage.prompt_tokens, outputTokens: event.usage.completion_tokens, totalTokens: event.usage.total_tokens };
    };
    try {
      while (true) {
      if (signal.aborted) {
        try { await reader.cancel(); } catch { /* The abort may already have errored the stream. */ }
        throw new Error(streamRequest.wasCancelled() ? 'Model provider request cancelled' : 'Model provider request timed out');
      }
      let item;
      try { item = await reader.read(); } catch (error) {
        if (signal.aborted || error.name === 'AbortError') throw new Error(streamRequest.wasCancelled() ? 'Model provider request cancelled' : 'Model provider request timed out');
        throw error;
      }
      const { done, value } = item;
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Model provider response is too large'); }
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      const separator = kind === 'ollama' ? '\n' : '\n\n';
      let boundary;
      while ((boundary = buffer.indexOf(separator)) !== -1) {
        const raw = buffer.slice(0, boundary); buffer = buffer.slice(boundary + separator.length);
        if (kind === 'openai') {
          for (const line of raw.split('\n')) if (line.startsWith('data:')) await consume(line.slice(5).trim());
        } else if (raw.trim()) await consume(raw.trim());
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      if (kind === 'openai') {
        for (const line of buffer.split('\n')) if (line.startsWith('data:')) await consume(line.slice(5).trim());
      } else await consume(buffer.trim());
    }
    if (!completed) throw new Error('Model provider stream ended before completion');
    const message = normalizeMessage({
      content,
      tool_calls: [...calls.values()].map((call) => ({ id: call.id, function: { name: call.name, arguments: call.arguments } }))
    });
    if (usage) message.usage = usage;
    return message;
    } finally {
      streamRequest.cleanup();
    }
  }

  async function complete(messages, tools = [], { signal, onDelta } = {}) {
    if (!Array.isArray(messages)) throw new Error('messages must be an array');
    if (!Array.isArray(tools)) throw new Error('tools must be an array');
    messages = messages.map((message) => ({
      ...message,
      ...(message.tool_calls ? { tool_calls: message.tool_calls.map((call) => ({
        ...call, function: { ...call.function, arguments: protocol === 'openai'
          ? (typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments))
          : normalizeArguments(call.function.arguments) }
      })) } : {})
    }));
    const streaming = typeof onDelta === 'function';
    if (protocol === 'ollama') {
      if (streaming) {
        const response = await requestRaw('/api/chat', {
          method: 'POST',
          body: JSON.stringify({ model, messages, tools, stream: true, ...thinking, options: { num_predict: maxOutputTokens } })
        }, signal);
        return readEventStream(response, 'ollama', onDelta);
      }
      const body = await request('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ model, messages, tools, stream: false, ...thinking, options: { num_predict: maxOutputTokens } })
      }, signal);
      const message = normalizeMessage(body.message);
      if (body.prompt_eval_count !== undefined || body.eval_count !== undefined) message.usage = { inputTokens: body.prompt_eval_count, outputTokens: body.eval_count };
      return message;
    }
    if (streaming) {
      const response = await requestRaw('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({ model, messages, tools, stream: true, stream_options: { include_usage: true }, max_tokens: maxOutputTokens })
      }, signal);
      return readEventStream(response, 'openai', onDelta);
    }
    const body = await request('/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model, messages, tools, stream: false, max_tokens: maxOutputTokens })
    }, signal);
    const message = normalizeMessage(body.choices?.[0]?.message);
    if (body.usage) message.usage = { inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens, totalTokens: body.usage.total_tokens };
    return message;
  }

  async function probe() {
    const body = await request(protocol === 'ollama' ? '/api/tags' : '/models', { method: 'GET' }, undefined, Math.min(timeoutMs, 5000));
    const entries = protocol === 'ollama' ? body.models : body.data;
    if (!Array.isArray(entries)) throw new Error('Model provider returned an invalid response');
    const models = entries.map((item) => item?.name ?? item?.id).filter((name) => typeof name === 'string');
    return { ok: true, modelAvailable: models.includes(model), models };
  }

  function status() {
    return {
      protocol,
      model,
      authenticationConfigured: Boolean(apiKey),
      transport: url.protocol === 'https:' ? 'https' : 'loopback-http',
      timeoutMs,
      maxOutputTokens,
      ...(protocol === 'ollama' && think !== undefined ? { think } : {})
    };
  }

  return { complete, probe, status };
}
