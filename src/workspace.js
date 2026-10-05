import { execFile } from 'node:child_process';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SESSION_PATTERN = /^[a-z0-9][a-z0-9_-]{0,47}$/;

export function createWorkspaceManager(baseDir, options = {}) {
  const commandTimeout = options.commandTimeout ?? 30_000;

  function validateSession(session) {
    if (!SESSION_PATTERN.test(session)) throw new Error('Invalid session name');
    return session;
  }

  function rootFor(session) {
    return path.join(baseDir, validateSession(session));
  }

  function safePath(session, relativePath = '.') {
    const root = rootFor(session);
    const resolved = path.resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      throw new Error('Path escapes workspace');
    }
    if (existsSync(root)) {
      const canonicalRoot = realpathSync(root);
      const relative = path.relative(root, resolved);
      let cursor = root;
      for (const part of relative.split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        if (!existsSync(cursor)) break;
        if (lstatSync(cursor).isSymbolicLink()) throw new Error('Symbolic links are not allowed in workspaces');
        const canonical = realpathSync(cursor);
        if (canonical !== canonicalRoot && !canonical.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error('Path escapes workspace');
      }
    }
    return resolved;
  }

  async function ensureSession(session) {
    const root = rootFor(session);
    await mkdir(root, { recursive: true });
    return root;
  }

  async function listFiles(session, relativePath = '.') {
    const target = safePath(session, relativePath);
    const entries = await readdir(target, { withFileTypes: true });
    return Promise.all(entries
      .filter((entry) => entry.name !== '.git' && entry.name !== 'node_modules')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        const itemPath = path.join(target, entry.name);
        const metadata = await stat(itemPath);
        return { name: entry.name, type: entry.isDirectory() ? 'directory' : 'file', size: metadata.size };
      }));
  }

  async function readText(session, relativePath) {
    const content = await readFile(safePath(session, relativePath), 'utf8');
    return content.slice(0, 200_000);
  }

  async function writeText(session, relativePath, content) {
    if (typeof content !== 'string') throw new Error('Content must be text');
    const target = safePath(session, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    return { path: relativePath, bytes: Buffer.byteLength(content) };
  }

  async function runCommand(session, command) {
    if (typeof command !== 'string' || !command.trim() || command.length > 4_000) {
      throw new Error('Invalid command');
    }
    const cwd = await ensureSession(session);
    try {
      const { stdout, stderr } = await execFileAsync('/bin/sh', ['-lc', command], {
        cwd,
        timeout: commandTimeout,
        maxBuffer: 1024 * 1024,
        env: {
          HOME: cwd,
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
          LANG: process.env.LANG || 'C.UTF-8',
          TERM: process.env.TERM || 'dumb',
          NO_COLOR: '1'
        }
      });
      return { exitCode: 0, stdout, stderr };
    } catch (error) {
      return {
        exitCode: Number.isInteger(error.code) ? error.code : 1,
        stdout: error.stdout ?? '',
        stderr: error.killed ? `${error.stderr ?? ''}\nCommand timed out.`.trim() : (error.stderr ?? error.message)
      };
    }
  }

  async function gitSummary(session) {
    return runCommand(session, 'git status --short --branch 2>&1; git diff --stat 2>&1');
  }

  return { ensureSession, gitSummary, listFiles, readText, rootFor, runCommand, safePath, writeText };
}
