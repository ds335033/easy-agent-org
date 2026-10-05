import { createModelProvider } from './model-provider.js';

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files in the current coding workspace.',
      parameters: { type: 'object', properties: { path: { type: 'string' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a UTF-8 text file from the workspace.',
      parameters: { type: 'object', required: ['path'], properties: { path: { type: 'string' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or replace a UTF-8 text file in the workspace.',
      parameters: {
        type: 'object', required: ['path', 'content'],
        properties: { path: { type: 'string' }, content: { type: 'string' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace. Use it to inspect, build, and test code.',
      parameters: { type: 'object', required: ['command'], properties: { command: { type: 'string' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_summary',
      description: 'Show the current Git branch, changed files, and diff statistics.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

const SYSTEM_PROMPT = `You are Easy Agent GPT, a careful autonomous software engineer.
Work only inside the provided workspace. Inspect existing code before changing it. Prefer small, coherent edits.
write_file replaces the ENTIRE file: include all content that should remain, not just the changed snippet.
Run meaningful tests after implementation. Never claim a command passed unless its tool output says so.
Do not expose credentials. Explain the result and any limitations succinctly.`;

function parseArguments(call) {
  const value = call.function?.arguments ?? call.arguments ?? '{}';
  return typeof value === 'string' ? JSON.parse(value || '{}') : value;
}

export function createAgent({ workspace, mcp, provider, baseUrl, model, apiKey = '', maxSteps = 8, maxToolCalls = 30, fetchImpl = fetch }) {
  const modelProvider = provider || createModelProvider({ baseUrl, model, apiKey, fetchImpl });
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 40) throw new Error('Invalid agent step limit');
  async function invokeTool(session, call, options) {
    const args = parseArguments(call);
    const name = call.function?.name ?? call.name;
    switch (name) {
      case 'list_files': return workspace.listFiles(session, args.path ?? '.');
      case 'read_file': return { content: await workspace.readText(session, args.path) };
      case 'write_file': return workspace.writeText(session, args.path, args.content);
      case 'run_command': return workspace.runCommand(session, args.command, options);
      case 'git_summary': return workspace.gitSummary(session);
      default:
        if (typeof name === 'string' && name.startsWith('mcp__') && mcp) return mcp.call(name, args);
        throw new Error('Unknown tool');
    }
  }

  async function run(session, prompt, history = [], { signal, onEvent = async () => {} } = {}) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20_000) throw new Error('Prompt is required and must be under 20,000 characters');
    if (!Array.isArray(history)) throw new Error('Invalid conversation history');
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(-20).filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string').map(({ role, content }) => ({ role, content: content.slice(0, 20_000) })),
      { role: 'user', content: prompt }
    ];
    const events = [];
    const tools = [...TOOL_DEFINITIONS, ...(mcp ? await mcp.tools() : [])];
    let toolCalls = 0;
    const usage = { inputTokens: 0, outputTokens: 0, requests: 0 };

    for (let step = 0; step < maxSteps; step += 1) {
      signal?.throwIfAborted();
      await onEvent({ type: 'step', content: `Model step ${step + 1} of ${maxSteps}` });
      const response = await modelProvider.complete(messages, tools, { signal, onDelta: (content) => onEvent({ type: 'delta', content }) });
      const { usage: requestUsage, ...message } = response;
      usage.requests += 1;
      usage.inputTokens += requestUsage?.inputTokens || 0;
      usage.outputTokens += requestUsage?.outputTokens || 0;
      if (!message) throw new Error('Model returned no message');
      messages.push(message);
      const calls = message.tool_calls ?? [];
      if (!calls.length) return { answer: message.content ?? '', events, steps: step + 1, usage };

      for (const call of calls) {
        signal?.throwIfAborted();
        toolCalls += 1;
        if (toolCalls > maxToolCalls) throw new Error('Tool call limit reached. Inspect changes before continuing.');
        const name = call.function?.name ?? call.name;
        await onEvent({ type: 'tool_start', tool: name, content: `Running ${name}` });
        try {
          const result = await invokeTool(session, call, { signal, onOutput: (stream, content) => { void onEvent({ type: 'output', stream, content }); } });
          events.push({ tool: name, ok: true });
          await onEvent({ type: 'tool_end', tool: name, ok: true, result });
          messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify(result).slice(0, 60_000) });
        } catch (error) {
          events.push({ tool: name, ok: false, error: error.message });
          await onEvent({ type: 'tool_end', tool: name, ok: false, error: error.message });
          messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify({ error: error.message }) });
        }
      }
    }
    return { answer: 'I reached the configured step limit. Review the tool activity and ask me to continue.', events, steps: maxSteps, usage };
  }

  return { run };
}
