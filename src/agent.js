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
Run meaningful tests after implementation. Never claim a command passed unless its tool output says so.
Do not expose credentials. Explain the result and any limitations succinctly.`;

function parseArguments(call) {
  const value = call.function?.arguments ?? call.arguments ?? '{}';
  return typeof value === 'string' ? JSON.parse(value || '{}') : value;
}

export function createAgent({ workspace, mcp, baseUrl, model, apiKey = '', maxSteps = 8, fetchImpl = fetch }) {
  async function invokeTool(session, call) {
    const args = parseArguments(call);
    const name = call.function?.name ?? call.name;
    switch (name) {
      case 'list_files': return workspace.listFiles(session, args.path ?? '.');
      case 'read_file': return { content: await workspace.readText(session, args.path) };
      case 'write_file': return workspace.writeText(session, args.path, args.content);
      case 'run_command': return workspace.runCommand(session, args.command);
      case 'git_summary': return workspace.gitSummary(session);
      default:
        if (name.startsWith('mcp__') && mcp) return mcp.call(name, args);
        throw new Error('Unknown tool');
    }
  }

  async function complete(messages, tools) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ model, messages, tools, stream: false })
    });
    try {
      if (!response.ok) throw new Error(`Model request failed (${response.status})`);
      const body = await response.json();
      return body.message ?? body.choices?.[0]?.message;
    } finally { clearTimeout(timer); }
  }

  async function run(session, prompt, history = []) {
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('Prompt is required');
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(-20).filter((item) => ['user', 'assistant'].includes(item.role)),
      { role: 'user', content: prompt }
    ];
    const events = [];
    const tools = [...TOOL_DEFINITIONS, ...(mcp ? await mcp.tools() : [])];

    for (let step = 0; step < maxSteps; step += 1) {
      const message = await complete(messages, tools);
      if (!message) throw new Error('Model returned no message');
      messages.push(message);
      const calls = message.tool_calls ?? [];
      if (!calls.length) return { answer: message.content ?? '', events, steps: step + 1 };

      for (const call of calls) {
        const name = call.function?.name ?? call.name;
        try {
          const result = await invokeTool(session, call);
          events.push({ tool: name, ok: true });
          messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify(result) });
        } catch (error) {
          events.push({ tool: name, ok: false, error: error.message });
          messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify({ error: error.message }) });
        }
      }
    }
    return { answer: 'I reached the configured step limit. Review the tool activity and ask me to continue.', events, steps: maxSteps };
  }

  return { run };
}
