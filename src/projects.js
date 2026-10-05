import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import {
  cp, lstat, mkdir, open, opendir, readFile, readdir, realpath, rename, rm, stat, writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 1_000_000;
const MAX_ARTIFACT_BYTES = 20_000_000;
const MAX_PROJECT_BYTES = 50_000_000;
const MAX_PROJECT_ENTRIES = 2000;
const MAX_CHECKPOINTS = 100;
const OWNER_PATTERN = /^[\w@.+-]{1,160}$/u;
const NAME_PATTERN = /^[^\0\r\n]{1,100}$/u;

function failure(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function publicRecord(record) {
  const { root: _root, ...safe } = record;
  return { ...safe, checkpoints: safe.checkpoints.map((item) => ({ ...item })) };
}

function validateOwner(owner) {
  if (typeof owner !== 'string' || !OWNER_PATTERN.test(owner)) throw failure('Invalid owner');
  return owner;
}

function validateName(name) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name.trim())) throw failure('Invalid project name');
  return name.trim();
}

function validateRelative(input, { rootAllowed = false } = {}) {
  if (typeof input !== 'string' || input.includes('\0') || path.isAbsolute(input)) throw failure('Invalid path');
  const normalized = path.posix.normalize(input.replaceAll('\\', '/'));
  const parts = normalized.split('/').filter((part) => part && part !== '.');
  if (parts.includes('..') || parts.includes('.git')) throw failure('Path is not allowed');
  if (!rootAllowed && parts.length === 0) throw failure('A file path is required');
  return parts;
}

async function exists(target) {
  try { return await lstat(target); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function createProjectStore({ dataDir, executor } = {}) {
  if (!dataDir) throw new TypeError('dataDir is required');
  if (!executor || typeof executor.run !== 'function') throw new TypeError('executor.run is required');

  const projectsDir = path.resolve(dataDir, 'projects');
  const records = new Map();
  const locks = new Map();

  const metadataPath = (id) => path.join(projectsDir, id, 'project.json');
  const snapshotsDir = (id) => path.join(projectsDir, id, 'snapshots');

  async function atomicJson(target, value) {
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, target);
  }

  async function save(record) {
    await atomicJson(metadataPath(record.id), {
      id: record.id, owner: record.owner, name: record.name, createdAt: record.createdAt,
      checkpoints: record.checkpoints
    });
  }

  async function git(root, args, options = {}) {
    const env = {
      PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
      GIT_DIR: path.resolve(root, '../repository.git'),
      GIT_WORK_TREE: root,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Easy Agent', GIT_AUTHOR_EMAIL: 'agent@localhost',
      GIT_COMMITTER_NAME: 'Easy Agent', GIT_COMMITTER_EMAIL: 'agent@localhost'
    };
    try {
      return await execFileAsync('git', [
        '-c', 'core.hooksPath=/dev/null',
        '-c', 'core.fsmonitor=false',
        '-c', 'core.pager=cat',
        '-c', 'pager.diff=false',
        '-c', 'interactive.diffFilter=',
        ...args
      ], {
        cwd: root, env, timeout: 30_000, maxBuffer: options.maxBuffer ?? 5_000_000,
        encoding: options.encoding ?? 'utf8'
      });
    } catch (error) {
      if (options.allowExit?.includes(error.code)) return { stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
      throw failure(`Git operation failed: ${String(error.stderr || error.message).trim()}`, 500);
    }
  }

  async function init() {
    await mkdir(projectsDir, { recursive: true, mode: 0o700 });
    for (const entry of await readdir(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        const parsed = JSON.parse(await readFile(metadataPath(entry.name), 'utf8'));
        if (parsed.id !== entry.name || !Array.isArray(parsed.checkpoints)) continue;
        records.set(parsed.id, { ...parsed, root: path.join(projectsDir, parsed.id, 'workspace') });
      } catch { /* Ignore incomplete/corrupt project directories. */ }
    }
  }

  function owned(owner, id) {
    validateOwner(owner);
    const record = typeof id === 'string' ? records.get(id) : null;
    // Deliberately make missing and foreign projects indistinguishable.
    if (!record || record.owner !== owner) throw failure('Project not found', 404);
    return record;
  }

  async function locked(id, operation) {
    const previous = locks.get(id) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    locks.set(id, current);
    try { return await current; } finally { if (locks.get(id) === current) locks.delete(id); }
  }

  async function resolveSafe(record, relativePath, { allowMissing = false, rootAllowed = false } = {}) {
    const parts = validateRelative(relativePath, { rootAllowed });
    const canonicalRoot = await realpath(record.root);
    let cursor = canonicalRoot;
    for (let index = 0; index < parts.length; index += 1) {
      cursor = path.join(cursor, parts[index]);
      const metadata = await exists(cursor);
      if (!metadata) {
        if (!allowMissing) throw failure('File not found', 404);
        continue;
      }
      if (metadata.isSymbolicLink()) throw failure('Symbolic links are not allowed');
      const canonical = await realpath(cursor);
      if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}${path.sep}`)) {
        throw failure('Path escapes project');
      }
    }
    return { target: cursor, parts, root: canonicalRoot };
  }

  async function seed(root) {
    await writeFile(path.join(root, 'index.html'), '<!doctype html>\n<title>Easy Agent Project</title>\n<h1>It works</h1>\n', 'utf8');
    await writeFile(path.join(root, 'package.json'), `${JSON.stringify({
      name: 'easy-agent-project', private: true, type: 'module', scripts: { test: 'node --test' }
    }, null, 2)}\n`, 'utf8');
    await mkdir(path.join(root, 'test'));
    await writeFile(path.join(root, 'test', 'project.test.js'), "import assert from 'node:assert/strict';\nimport { readFile } from 'node:fs/promises';\nimport test from 'node:test';\n\ntest('homepage contains a title and heading', async () => { const html = await readFile(new URL('../index.html', import.meta.url), 'utf8'); assert.match(html, /<title>.+<\\/title>/); assert.match(html, /<h1>.+<\\/h1>/); });\n", 'utf8');
  }

  async function create(owner, input = {}) {
    validateOwner(owner);
    if (records.size >= 100 || [...records.values()].filter((item) => item.owner === owner).length >= 20) throw failure('Project capacity reached; archive unused projects with the operator', 429);
    const name = validateName(input.name);
    const id = randomUUID();
    const projectDir = path.join(projectsDir, id);
    const root = path.join(projectDir, 'workspace');
    const record = { id, owner, name, createdAt: new Date().toISOString(), checkpoints: [], root };
    await mkdir(root, { recursive: true, mode: 0o700 });
    await mkdir(snapshotsDir(id), { mode: 0o700 });
    try {
      await seed(root);
      await git(root, ['init', '--quiet']);
      await git(root, ['add', '--all']);
      await git(root, ['commit', '--quiet', '-m', 'Initial project']);
      await save(record);
      records.set(id, record);
      return publicRecord(record);
    } catch (error) {
      await rm(projectDir, { recursive: true, force: true });
      throw error;
    }
  }

  async function list(owner) {
    validateOwner(owner);
    return [...records.values()].filter((record) => record.owner === owner)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(publicRecord);
  }

  async function get(owner, id) { return publicRecord(owned(owner, id)); }

  async function files(owner, id, relativePath = '.') {
    const record = owned(owner, id);
    await walkSafe(record, record.root);
    const { target } = await resolveSafe(record, relativePath, { rootAllowed: true });
    const targetStat = await stat(target);
    if (!targetStat.isDirectory()) throw failure('Path is not a directory');
    const entries = await readdir(target, { withFileTypes: true });
    return (await Promise.all(entries.filter((entry) => entry.name !== '.git').map(async (entry) => {
      if (entry.isSymbolicLink()) return null;
      const metadata = await stat(path.join(target, entry.name));
      return { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file', size: metadata.size };
    }))).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function readProjectFile(owner, id, relativePath) {
    const record = owned(owner, id);
    const { target } = await resolveSafe(record, relativePath);
    const metadata = await stat(target);
    if (!metadata.isFile()) throw failure('Path is not a file');
    if (metadata.size > MAX_FILE_BYTES) throw failure('File is too large', 413);
    const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try { return await handle.readFile('utf8'); } finally { await handle.close(); }
  }

  async function writeProjectFile(owner, id, relativePath, content) {
    const record = owned(owner, id);
    if (typeof content !== 'string') throw failure('Content must be text');
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw failure('File is too large', 413);
    return locked(id, async () => {
      await walkSafe(record, record.root);
      const { target, root } = await resolveSafe(record, relativePath, { allowMissing: true });
      const parent = path.dirname(target);
      await mkdir(parent, { recursive: true, mode: 0o700 });
      const canonicalParent = await realpath(parent);
      if (canonicalParent !== root && !canonicalParent.startsWith(`${root}${path.sep}`)) throw failure('Path escapes project');
      const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW || 0), 0o600);
      try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
      return { path: relativePath.replaceAll('\\', '/'), bytes: Buffer.byteLength(content) };
    });
  }

  async function diff(owner, id) {
    const record = owned(owner, id);
    await walkSafe(record, record.root);
    const tracked = await git(record.root, ['diff', '--no-ext-diff', '--binary', 'HEAD']);
    const untrackedResult = await git(record.root, ['ls-files', '--others', '--exclude-standard', '-z']);
    let output = tracked.stdout;
    for (const file of untrackedResult.stdout.split('\0').filter(Boolean)) {
      validateRelative(file);
      const result = await git(record.root, ['diff', '--no-ext-diff', '--no-index', '--binary', '--', '/dev/null', file], { allowExit: [1] });
      output += result.stdout;
      if (Buffer.byteLength(output) > 5_000_000) throw failure('Diff is too large; review fewer files locally', 413);
    }
    return output;
  }

  async function copyWorkspace(source, destination) {
    await mkdir(destination, { recursive: true, mode: 0o700 });
    for (const entry of await readdir(source, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      if (entry.isSymbolicLink()) throw failure('Symbolic links are not allowed');
      await cp(path.join(source, entry.name), path.join(destination, entry.name), {
        recursive: entry.isDirectory(), errorOnExist: true, dereference: false
      });
    }
  }

  async function checkpoint(owner, id, message = 'Project checkpoint') {
    const record = owned(owner, id);
    if (typeof message !== 'string' || !message.trim() || message.length > 200) throw failure('Invalid checkpoint message');
    return locked(id, async () => {
      if (record.checkpoints.length >= MAX_CHECKPOINTS) throw failure('Checkpoint capacity reached; export and archive this project with the operator', 429);
      // Verify the tree before allowing Git or snapshot tools to traverse it.
      await walkSafe(record, record.root);
      await git(record.root, ['add', '--all']);
      const tree = (await git(record.root, ['write-tree'])).stdout.trim();
      const parent = (await git(record.root, ['rev-parse', 'HEAD'])).stdout.trim();
      const checkpointId = (await git(record.root, ['commit-tree', tree, '-p', parent, '-m', message.trim()])).stdout.trim();
      await git(record.root, ['reset', '--quiet', '--mixed', 'HEAD']);
      const snapshot = path.join(snapshotsDir(id), checkpointId);
      if (record.checkpoints.some((item) => item.id === checkpointId)) return { ...record.checkpoints.find((item) => item.id === checkpointId) };
      await copyWorkspace(record.root, snapshot);
      const item = { id: checkpointId, message: message.trim(), createdAt: new Date().toISOString() };
      record.checkpoints.push(item);
      await save(record);
      return { ...item };
    });
  }

  async function walkSafe(record, directory, budget = { entries: 0, bytes: 0, started: Date.now() }) {
    const entries = await opendir(directory);
    for await (const entry of entries) {
      budget.entries += 1;
      if (budget.entries > MAX_PROJECT_ENTRIES || Date.now() - budget.started > 5000) throw failure('Project has too many entries to process safely', 413);
      if (entry.name === '.git' && directory === record.root) continue;
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw failure('Symbolic links are not allowed');
      if (!entry.isDirectory() && !entry.isFile()) throw failure('Special files are not allowed');
      if (entry.isDirectory()) await walkSafe(record, target, budget);
      else {
        budget.bytes += (await lstat(target)).size;
        if (budget.bytes > MAX_PROJECT_BYTES) throw failure('Project exceeds the 50 MB processing limit', 413);
      }
    }
    return budget;
  }

  async function restoreCheckpoint(owner, id, checkpointId) {
    const record = owned(owner, id);
    const known = record.checkpoints.find((item) => item.id === checkpointId);
    if (!known) throw failure('Checkpoint not found', 404);
    return locked(id, async () => {
      const source = path.join(snapshotsDir(id), known.id);
      if (!await exists(source)) throw failure('Checkpoint not found', 404);
      await walkSafe(record, record.root);
      for (const entry of await readdir(record.root, { withFileTypes: true })) {
        if (entry.name === '.git') continue;
        await rm(path.join(record.root, entry.name), { recursive: entry.isDirectory(), force: false });
      }
      await copyWorkspace(source, record.root);
      await git(record.root, ['reset', '--quiet', '--mixed', 'HEAD']);
      return { ...known };
    });
  }

  async function artifact(owner, id) {
    const record = owned(owner, id);
    await walkSafe(record, record.root);
    const { stdout } = await execFileAsync('tar', ['--exclude=.git', '-czf', '-', '.'], {
      cwd: record.root, encoding: 'buffer', timeout: 30_000, maxBuffer: MAX_ARTIFACT_BYTES,
      env: { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' }
    });
    return { filename: `${record.id}.tar.gz`, contentType: 'application/gzip', buffer: stdout };
  }

  async function preview(owner, id, relativePath = 'index.html') {
    const content = await readProjectFile(owner, id, relativePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
    return { content, contentType: types[path.extname(relativePath).toLowerCase()] || 'text/plain; charset=utf-8' };
  }

  async function run(owner, id, command, options = {}) {
    const record = owned(owner, id);
    if (typeof command !== 'string' || !command.trim()) throw failure('Invalid command');
    return locked(id, () => executor.run(record.root, command, options));
  }

  return {
    init, list, create, get,
    files: async (owner, id, relative) => { owned(owner, id); return locked(id, () => files(owner, id, relative)); },
    readFile: async (owner, id, relative) => { owned(owner, id); return locked(id, () => readProjectFile(owner, id, relative)); },
    writeFile: writeProjectFile,
    diff: async (owner, id) => { owned(owner, id); return locked(id, () => diff(owner, id)); },
    artifact: async (owner, id) => { owned(owner, id); return locked(id, () => artifact(owner, id)); },
    preview: async (owner, id, relative) => { owned(owner, id); return locked(id, () => preview(owner, id, relative)); },
    checkpoint, restoreCheckpoint, run,
    build: (owner, id, options) => run(owner, id, 'npm run build', options),
    test: (owner, id, options) => run(owner, id, 'npm test', options)
  };
}
