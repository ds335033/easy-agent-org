import { randomUUID } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

function positiveNumber(value, fallback, name) {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result <= 0) throw new TypeError(`${name} must be a positive number`);
  return result;
}

function collect(child, limit = 64 * 1024, timeoutMs = 8_000) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let used = 0;
    const append = (kind, chunk) => {
      if (used >= limit) return;
      const value = chunk.toString('utf8');
      const kept = value.slice(0, limit - used);
      used += Buffer.byteLength(kept);
      if (kind === 'stdout') stdout += kept;
      else stderr += kept;
    };
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    timer.unref?.();
    child.stdout?.on('data', (chunk) => append('stdout', chunk));
    child.stderr?.on('data', (chunk) => append('stderr', chunk));
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, error });
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, ...(signal === 'SIGKILL' ? { error: new Error('Docker probe timed out') } : {}) });
    });
  });
}

async function projectRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Project root must be an absolute path');
  const resolved = path.resolve(root);
  const canonical = await realpath(resolved);
  if (canonical !== resolved) throw new Error('Project root must not be a symbolic link');
  if (!(await stat(canonical)).isDirectory()) throw new Error('Project root must be a directory');
  return canonical;
}

export function createExecutor(options = {}) {
  const image = options.image ?? 'node:24-bookworm';
  const timeoutMs = positiveNumber(options.timeoutMs, 30_000, 'timeoutMs');
  const maxOutputBytes = positiveNumber(options.maxOutputBytes, 1024 * 1024, 'maxOutputBytes');
  const cpus = positiveNumber(options.cpus, 1, 'cpus');
  const memory = options.memory ?? '512m';
  const pids = positiveNumber(options.pids, 128, 'pids');
  const dockerCommand = options.dockerCommand ?? 'docker';
  if (typeof image !== 'string' || !image.trim()) throw new TypeError('image is required');
  if (typeof memory !== 'string' || !/^\d+[bkmg]$/i.test(memory)) throw new TypeError('memory must be a Docker size');

  function docker(args, spawnOptions = {}) {
    return spawn(dockerCommand, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...spawnOptions
    });
  }

  async function inspect(args) {
    let child;
    try {
      child = docker(args);
    } catch (error) {
      return { code: null, stdout: '', stderr: '', error };
    }
    return collect(child);
  }

  async function status() {
    const version = await inspect(['version', '--format', '{{.Server.Version}}']);
    if (version.error || version.code !== 0) {
      return { available: false, imageAvailable: false, error: version.error?.message ?? version.stderr.trim() };
    }
    const imageResult = await inspect(['image', 'inspect', '--format', '{{.Id}}', image]);
    if (imageResult.code !== 0) {
      return { available: true, imageAvailable: false, error: imageResult.stderr.trim() };
    }
    return {
      available: true,
      imageAvailable: true
    };
  }

  async function removeContainer(name) {
    const result = await inspect(['rm', '-f', name]);
    return result.code === 0;
  }

  async function probe() {
    const details = await status();
    return {
      available: details.available && details.imageAvailable,
      image,
      ...((details.available && details.imageAvailable) ? {} : { error: details.error || 'Executor image is unavailable' })
    };
  }

  async function run(root, command, { signal, onOutput, network = false } = {}) {
    const canonicalRoot = await projectRoot(root);
    if (typeof command !== 'string' || !command.trim()) throw new Error('Command is required');
    if (signal?.aborted) return { exitCode: 1, stdout: '', stderr: '', cancelled: true, timedOut: false, outputLimitExceeded: false };

    const name = `easy-agent-${randomUUID()}`;
    const uid = typeof process.getuid === 'function' && process.getuid() > 0 ? process.getuid() : 65534;
    const gid = typeof process.getgid === 'function' && process.getgid() > 0 ? process.getgid() : 65534;
    const args = [
      'create', '--init', '--name', name,
      `--network=${network ? 'bridge' : 'none'}`,
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=128m',
      '--memory', memory, '--cpus', String(cpus), '--pids-limit', String(pids),
      '--user', `${uid}:${gid}`, '--env', 'HOME=/tmp',
      '--mount', `type=bind,src=${canonicalRoot},dst=/project`, '--workdir', '/project',
      image, '/bin/sh', '-c', command
    ];

    let child;
    try {
      const creation = await collect(docker(args), 64 * 1024, 120_000);
      if (creation.code !== 0) {
        await removeContainer(name);
        return { exitCode: 127, stdout: '', stderr: creation.error?.message || creation.stderr, cancelled: false, timedOut: false, outputLimitExceeded: false };
      }
      if (signal?.aborted) {
        await removeContainer(name);
        return { exitCode: 137, stdout: '', stderr: '', cancelled: true, timedOut: false, outputLimitExceeded: false };
      }
      child = docker(['start', '--attach', name]);
    } catch (error) {
      return { exitCode: 127, stdout: '', stderr: error.message, cancelled: false, timedOut: false, outputLimitExceeded: false };
    }

    let stdout = '';
    let stderr = '';
    let used = 0;
    let timedOut = false;
    let cancelled = false;
    let outputLimitExceeded = false;
    let stopping;
    const append = (kind, chunk) => {
      const remaining = maxOutputBytes - used;
      const keptBuffer = chunk.subarray(0, Math.max(0, remaining));
      const kept = keptBuffer.toString('utf8');
      used += keptBuffer.length;
      if (kept) {
        if (kind === 'stdout') stdout += kept;
        else stderr += kept;
        if (typeof onOutput === 'function') {
          try { onOutput(kind, kept); } catch { /* A UI callback cannot break containment cleanup. */ }
        }
      }
      if (chunk.length > remaining && !outputLimitExceeded) {
        outputLimitExceeded = true;
        void stop();
      }
    };
    child.stdout?.on('data', (chunk) => append('stdout', chunk));
    child.stderr?.on('data', (chunk) => append('stderr', chunk));

    let exited = false;
    const stop = () => {
      if (!stopping) {
        stopping = (async () => {
          // Wait for daemon creation before removing; killing the CLI first
          // can leave a container whose name has not been registered yet.
          const deadline = Date.now() + 60_000;
          do {
            if (await removeContainer(name).catch(() => false)) return;
            if (exited) return;
            await new Promise((resolve) => setTimeout(resolve, 100));
          } while (Date.now() < deadline);
          child.kill('SIGKILL');
        })();
      }
      return stopping;
    };
    const timer = setTimeout(() => { timedOut = true; void stop(); }, timeoutMs);
    timer.unref?.();
    const abort = () => { cancelled = true; void stop(); };
    signal?.addEventListener('abort', abort, { once: true });

    const outcome = await new Promise((resolve) => {
      child.once('error', (error) => resolve({ code: null, error }));
      child.once('close', (code, closeSignal) => resolve({ code, signal: closeSignal }));
    });
    exited = true;
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (stopping) await stopping;
    await removeContainer(name);
    if (outcome.error) stderr ||= outcome.error.message;
    return {
      exitCode: timedOut || cancelled || outputLimitExceeded ? 137 : Number.isInteger(outcome.code) ? outcome.code : 127,
      stdout,
      stderr,
      cancelled,
      timedOut,
      outputLimitExceeded
    };
  }

  return { run, status, probe };
}
