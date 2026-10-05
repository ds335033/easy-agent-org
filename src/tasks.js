import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const fault = (message, statusCode) => Object.assign(new Error(message), { statusCode });

export async function createTaskStore({ dataDir, projects, agentFor, maxConcurrent = 2, maxTasksPerDay = 100, taskTimeoutMs = 300_000 }) {
  const dir = path.join(dataDir, 'tasks');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const records = new Map();
  const controllers = new Map();
  const executions = new Map();
  const listeners = new EventEmitter();
  listeners.setMaxListeners(100);
  let persistence = Promise.resolve();
  const persist = (task) => {
    const serialized = JSON.stringify(task);
    const target = path.join(dir, `${task.id}.json`);
    persistence = persistence.catch(() => {}).then(async () => {
      await writeFile(`${target}.tmp`, serialized, { mode: 0o600 });
      await rename(`${target}.tmp`, target);
    });
    return persistence;
  };
  for (const name of await readdir(dir)) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    const task = JSON.parse(await readFile(path.join(dir, name), 'utf8'));
    if (!terminal.has(task.status)) {
      task.status = 'interrupted';
      task.error = 'Server restarted during execution. Inspect the diff or restore the checkpoint before retrying.';
      await persist(task);
    }
    records.set(task.id, task);
  }
  const publicTask = (task) => structuredClone(task);
  const owned = (owner, id) => {
    const task = records.get(id);
    if (!task || task.owner !== owner) throw fault('Task not found', 404);
    return task;
  };
  const emit = (task, event) => {
    const normalized = { ...event, at: new Date().toISOString() };
    if (task.events.length < 500) task.events.push(normalized);
    if (event.type === 'delta') task.answer = (task.answer + event.content).slice(0, 200_000);
    task.updatedAt = normalized.at;
    listeners.emit(task.id, publicTask(task));
    return persist(task);
  };

  async function execute(task, controller) {
    const timer = setTimeout(() => controller.abort(new Error('Task time limit reached')), taskTimeoutMs);
    try {
      task.status = 'running';
      await emit(task, { type: 'status', content: 'Creating recovery checkpoint' });
      const checkpoint = await projects.checkpoint(task.owner, task.projectId, `Before task ${task.id}`);
      task.checkpoint = checkpoint;
      controller.signal.throwIfAborted();
      if (task.kind === 'check') {
        const result = await projects.run(task.owner, task.projectId, task.command, {
          signal: controller.signal,
          onOutput: (stream, content) => { void emit(task, { type: 'output', stream, content }).catch(() => controller.abort()); }
        });
        task.result = result;
        task.answer = [result.stdout, result.stderr].filter(Boolean).join('\n');
        task.status = controller.signal.aborted || result.cancelled ? 'cancelled' : result.exitCode === 0 ? 'completed' : 'failed';
        if (result.timedOut) task.error = 'Check exceeded its time limit';
      } else {
        const history = [...records.values()].filter((item) => item.projectId === task.projectId && item.owner === task.owner && item.status === 'completed' && item.kind === 'agent').slice(-5).flatMap((item) => [{ role: 'user', content: item.prompt }, { role: 'assistant', content: item.answer }]);
        const result = await agentFor(task.owner).run(task.projectId, task.prompt, history, {
          signal: controller.signal,
          onEvent: (event) => emit(task, event)
        });
        task.answer = result.answer;
        task.usage = result.usage;
        task.status = controller.signal.aborted ? 'cancelled' : 'completed';
      }
    } catch (error) {
      task.status = controller.signal.aborted ? 'cancelled' : 'failed';
      task.error = controller.signal.aborted ? 'Task cancelled; inspect partial changes or restore its checkpoint.' : error.message;
    } finally {
      clearTimeout(timer);
      task.finishedAt = new Date().toISOString();
      await emit(task, { type: 'status', content: task.status }).catch(() => {});
      controllers.delete(task.id);
    }
  }

  return {
    async create(owner, projectId, { prompt, command, kind = 'agent' }) {
      await projects.get(owner, projectId);
      if (!['agent', 'check'].includes(kind)) throw fault('Invalid task type', 400);
      const input = kind === 'agent' ? prompt : command;
      if (typeof input !== 'string' || !input.trim() || input.length > (kind === 'agent' ? 20_000 : 4000)) throw fault('Invalid task input', 400);
      if ([...records.values()].some((item) => item.projectId === projectId && !terminal.has(item.status))) throw fault('A task is already running in this project', 409);
      if (controllers.size >= maxConcurrent) throw fault('Worker capacity reached. Try again after a running task finishes.', 429);
      const today = new Date().toISOString().slice(0, 10);
      if ([...records.values()].filter((item) => item.owner === owner && item.createdAt.startsWith(today)).length >= maxTasksPerDay) throw fault('Daily task limit reached', 429);
      const now = new Date().toISOString();
      const task = { id: randomUUID(), owner, projectId, kind, prompt: prompt || '', command: command || '', status: 'queued', createdAt: now, updatedAt: now, answer: '', events: [], usage: null };
      records.set(task.id, task);
      const controller = new AbortController();
      controllers.set(task.id, controller);
      await persist(task);
      const execution = new Promise((resolve) => setImmediate(resolve)).then(() => execute(task, controller));
      executions.set(task.id, execution);
      void execution.finally(() => executions.delete(task.id));
      return publicTask(task);
    },
    async list(owner, projectId) {
      await projects.get(owner, projectId);
      return [...records.values()].filter((task) => task.owner === owner && task.projectId === projectId).map(publicTask);
    },
    get(owner, id) { return publicTask(owned(owner, id)); },
    busy(projectId) { return [...records.values()].some((task) => task.projectId === projectId && !terminal.has(task.status)); },
    subscribe(owner, id, callback) {
      owned(owner, id);
      listeners.on(id, callback);
      return () => listeners.off(id, callback);
    },
    async cancel(owner, id) {
      const task = owned(owner, id);
      controllers.get(task.id)?.abort();
      return publicTask(task);
    },
    async close() {
      for (const controller of controllers.values()) controller.abort();
      await Promise.allSettled(executions.values());
      await persistence;
    }
  };
}
