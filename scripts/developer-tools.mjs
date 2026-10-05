import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.resolve(process.env.EASY_AGENT_RUNTIME_DIR || path.join(root, '.runtime'));
const toolsDir = path.resolve(process.env.EASY_AGENT_TOOLS_DIR || '/workspace/tools');
await mkdir(runtime, { recursive: true, mode: 0o700 });
const secretFile = path.join(runtime, 'local-credentials.json');
let credentials;
try { credentials = JSON.parse(await readFile(secretFile, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const key = () => randomBytes(32).toString('hex');
  credentials = { adminToken: key(), gatewayKey: key(), jwtSecret: key(), apiKeySecret: key(), encryptionKey: key(), dashboardPassword: key() };
  await writeFile(secretFile, JSON.stringify(credentials), { flag: 'wx', mode: 0o600 });
}
const upstreamModel = process.env.LOCAL_MODEL || 'qwen3:1.7b';
const providersFile = path.join(runtime, 'local-providers.json');
await writeFile(providersFile, JSON.stringify({ providers: [{ id: 'local-ollama', kind: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', model: upstreamModel }] }), { mode: 0o600 });
const command = process.argv[2] || 'doctor';
const baseEnv = Object.fromEntries(['PATH', 'SystemRoot', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE'].filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
const omniPrefix = process.env.OMNIROUTE_INSTALL_DIR || path.join(toolsDir, 'omniroute');
const orcaPrefix = process.env.ORCA_INSTALL_DIR || path.join(toolsDir, 'orca');
const useRouter = process.env.USE_OMNIROUTE === 'true';
async function requireCleanGatewayAudit() {
  let report;
  const auditArgs = ['audit', '--omit=dev', '--json', '--prefix', omniPrefix];
  const windows = process.platform === 'win32';
  try {
    const result = await promisify(execFile)(windows ? process.execPath : 'npm', windows ? [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...auditArgs] : auditArgs, { timeout: 60_000, maxBuffer: 5_000_000, windowsHide: true });
    report = JSON.parse(result.stdout);
  } catch (error) {
    try { report = JSON.parse(error.stdout); } catch { throw new Error('OmniRoute audit could not be verified. Use direct local Ollama.'); }
  }
  const counts = report.metadata?.vulnerabilities;
  if (!counts || counts.high || counts.critical) throw new Error('OmniRoute is blocked by its dependency audit. Upgrade to a verified patched release; use direct local Ollama meanwhile.');
}
let executable = process.execPath;
let args;
let env = { ...baseEnv };
if (command === 'router') {
  await requireCleanGatewayAudit();
  env = { ...env, DATA_DIR: path.join(runtime, 'omniroute'), XDG_CONFIG_HOME: path.join(runtime, 'config'),
    OMNIROUTE_SERVER_HOST: '127.0.0.1', APP_BIND_HOST: '127.0.0.1', PORT: '20128',
    JWT_SECRET: credentials.jwtSecret, API_KEY_SECRET: credentials.apiKeySecret,
    STORAGE_ENCRYPTION_KEY: credentials.encryptionKey, INITIAL_PASSWORD: credentials.dashboardPassword,
    REQUIRE_API_KEY: 'true', ALLOW_API_KEY_REVEAL: 'false',
    OMNIROUTE_SELF_HOSTED_PROVIDERS_FILE: providersFile, OMNIROUTE_SELF_HOSTED_API_KEY: credentials.gatewayKey,
    OMNIROUTE_ALLOW_PRIVATE_PROVIDER_URLS: 'true', DO_NOT_TRACK: '1', NO_UPDATE_NOTIFIER: '1' };
  args = [path.join(omniPrefix, 'node_modules/omniroute/bin/omniroute.mjs'), 'serve', '--no-open', '--no-tray', '--no-recovery', '--log'];
} else if (command === 'app') {
  if (useRouter) await requireCleanGatewayAudit();
  env = { ...env, HOST: '127.0.0.1', PORT: process.env.PORT || '3000', ADMIN_TOKEN: credentials.adminToken,
    MODEL_PROTOCOL: useRouter ? 'openai' : 'ollama', MODEL_BASE_URL: useRouter ? 'http://127.0.0.1:20128/v1' : 'http://127.0.0.1:11434', MODEL_NAME: upstreamModel,
    MODEL_API_KEY: useRouter ? credentials.gatewayKey : '', MODEL_TIMEOUT_MS: '180000', TASK_TIMEOUT_MS: '600000',
    MODEL_THINK: process.env.MODEL_THINK || (upstreamModel === 'qwen3:1.7b' ? 'false' : ''),
    DATA_DIR: path.join(root, 'data'), EXECUTOR_IMAGE: process.env.EXECUTOR_IMAGE || 'node:24-bookworm' };
  args = [path.join(root, 'src/server.js')];
} else if (command === 'orca' || command === 'doctor') {
  if (useRouter) await requireCleanGatewayAudit();
  env = { ...env, ORCA_HOME: path.join(runtime, 'orca'), ORCA_API_KEY: useRouter ? credentials.gatewayKey : 'ollama',
    ORCA_BASE_URL: useRouter ? 'http://127.0.0.1:20128/v1' : 'http://127.0.0.1:11434/v1', ORCA_MODEL: upstreamModel };
  args = [path.join(orcaPrefix, 'node_modules/@blade-ai/orca/bin/orca.js'), ...(command === 'doctor' ? ['doctor', '--cwd', root] : process.argv.slice(3))];
} else if (command === 'configure-router') {
  await requireCleanGatewayAudit();
  if (credentials.issuedGatewayKey) { console.log('Gateway key already issued; credentials preserved.'); process.exit(0); }
  const base = 'http://127.0.0.1:20128';
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ password: credentials.dashboardPassword }), signal: AbortSignal.timeout(15000)
  });
  if (!login.ok) throw new Error(`Router dashboard login failed (${login.status})`);
  const cookies = login.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
  const response = await fetch(`${base}/api/keys`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie: cookies },
    body: JSON.stringify({ name: 'Easy Agent local developer tools', noLog: true }), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Router key creation failed (${response.status})`);
  const issued = await response.json();
  if (typeof issued.key !== 'string' || !issued.key) throw new Error('Router did not return a client key');
  credentials.gatewayKey = issued.key;
  credentials.issuedGatewayKey = issued.id;
  await writeFile(secretFile, JSON.stringify(credentials), { mode: 0o600 });
  console.log('Local OmniRoute client key issued and saved privately. Restart the router to apply the shared entry key.');
  process.exit(0);
} else if (command === 'probe') {
  const results = {};
  for (const [name, url, auth] of [
    ['ollama', 'http://127.0.0.1:11434/api/tags', ''],
    ...(useRouter ? [['omniroute', 'http://127.0.0.1:20128/v1/models', credentials.gatewayKey]] : [])
  ]) {
    try {
      const response = await fetch(url, { headers: auth ? { authorization: `Bearer ${auth}` } : {}, signal: AbortSignal.timeout(5000) });
      results[name] = { reachable: response.ok, status: response.status };
    } catch { results[name] = { reachable: false }; }
  }
  console.log(JSON.stringify(results));
  process.exit(Object.values(results).every((result) => result.reachable) ? 0 : 1);
} else throw new Error('Use router, app, orca, doctor, configure-router, or probe');

// Keys stay in private runtime files/environment and are never put in argv.
const child = spawn(executable, args, { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
child.once('error', () => { console.error('Tool could not start. Check the configured install directory.'); process.exitCode = 1; });
child.once('exit', (code) => { process.exitCode = code || 0; });
