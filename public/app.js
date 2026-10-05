const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let accessToken = '';
let projects = [];
let projectId = '';
let openPath = '';
let openTaskId = '';
let previewUrl = '';
let renderedEventCount = 0;
let pollTimer;
let taskStream;

async function request(path, options = {}) {
  if (['POST', 'PUT'].includes(options.method) && !options.body) options = { ...options, body: '{}' };
  const headers = new Headers(options.headers || {});
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (options.body && !(options.body instanceof FormData)) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { message = (await response.json()).error || message; } catch { /* non-JSON response */ }
    const error = new Error(message); error.status = response.status; throw error;
  }
  if (options.raw) return response;
  return response.status === 204 ? {} : response.json();
}

const projectPath = (suffix = '') => `/api/projects/${encodeURIComponent(projectId)}${suffix}`;
const text = (value) => value == null ? '' : String(value);

function toast(message, isError = false) {
  const node = document.createElement('div');
  node.className = `toast${isError ? ' error' : ''}`; node.textContent = message;
  $('#toast-region').append(node); setTimeout(() => node.remove(), 4500);
}

function setBusy(element, busy) {
  if (!element) return;
  element.disabled = busy;
  element.setAttribute('aria-busy', String(busy));
}

function setStatus(element, label, state = 'neutral', detail = '') {
  element.className = `status-pill ${state}`;
  element.innerHTML = '<i aria-hidden="true"></i>';
  element.append(document.createTextNode(label));
  element.title = detail || label;
}

function stateTone(state) {
  if (['ready', 'connected', 'available', 'succeeded', 'completed'].includes(state)) return 'good';
  if (['error', 'failed', 'unavailable', 'disconnected'].includes(state)) return 'bad';
  if (['running', 'queued', 'degraded', 'cancelling'].includes(state)) return 'warn';
  return 'neutral';
}

async function loadStatus() {
  const status = await request('/api/status');
  const model = status.model || {};
  const modelState = model.state || 'unverified';
  setStatus($('#model-status'), `${model.model || 'Model'} · ${modelState}`, stateTone(modelState), model.error);
  setStatus($('#executor-status'), status.executor?.available ? 'Executor available' : 'Executor unavailable', status.executor?.available ? 'good' : 'bad');
  const initials = text(status.user?.id || 'US').split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  $('#account-button').textContent = initials || 'US';
  const sites = (status.integrations || []).find((item) => /sites|pages|cloudflare/i.test(`${item.id || ''} ${item.name || ''}`));
  const reason = sites?.state === 'connected' ? 'Publish API unavailable' : 'Sites not connected';
  $('#publish-reason').textContent = reason; $('#publish').title = reason;
}

async function loadProjects(preferredId = '') {
  const body = await request('/api/projects');
  projects = body.projects || [];
  const select = $('#project-select'); select.replaceChildren();
  if (!projects.length) select.add(new Option('No projects', ''));
  for (const project of projects) select.add(new Option(project.name || project.id, project.id));
  projectId = preferredId || (projects.some((item) => item.id === projectId) ? projectId : projects[0]?.id || '');
  select.value = projectId;
  updateProjectControls();
  await selectProject();
}

function updateProjectControls() {
  const disabled = !projectId;
  $('#checkpoint').disabled = disabled; $('#restore').disabled = disabled; $('#download-artifact').disabled = disabled;
  $('#agent-prompt').disabled = disabled; $('#run-agent').disabled = disabled;
}

async function selectProject() {
  taskStream?.abort();
  openPath = ''; openTaskId = ''; renderedEventCount = 0; clearTimeout(pollTimer);
  $('#diff-output').textContent = 'Select Changes to inspect this project.';
  $('#checks-list').replaceChildren();
  $('#preview-frame').removeAttribute('src'); $('#preview-frame').hidden = true; $('#preview-empty').hidden = false;
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = '';
  closeFile(); resetTaskFeed();
  if (!projectId) { $('#file-tree').innerHTML = '<p class="empty compact">Create a project to begin.</p>'; return; }
  await Promise.all([loadFiles(), loadTasks()]);
}

async function loadFiles() {
  const tree = $('#file-tree'); tree.innerHTML = '<p class="empty compact">Loading files…</p>';
  try {
    tree.replaceChildren(await buildDirectory('.'));
    if (!tree.childNodes.length) tree.innerHTML = '<p class="empty compact">No files yet.</p>';
  } catch (error) { tree.innerHTML = `<p class="empty compact">${escapeHtml(error.message)}</p>`; }
}

async function buildDirectory(path) {
  const fragment = document.createDocumentFragment();
  const { files = [] } = await request(`${projectPath('/files')}?path=${encodeURIComponent(path)}`);
  for (const file of files) {
    const filePath = path === '.' ? file.name : `${path}/${file.name}`;
    if (file.type === 'directory') {
      const details = document.createElement('details');
      const summary = document.createElement('summary'); summary.className = 'file-button'; summary.innerHTML = `<span class="file-glyph">▸</span><span>${escapeHtml(file.name)}</span>`;
      const children = document.createElement('div'); children.className = 'file-children';
      details.append(summary, children);
      details.addEventListener('toggle', async () => { if (details.open && !children.childNodes.length) children.append(await buildDirectory(filePath)); }, { once: true });
      fragment.append(details);
    } else {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'file-button'; button.dataset.path = filePath;
      button.innerHTML = `<span class="file-glyph">·</span><span>${escapeHtml(file.name)}</span>`;
      button.addEventListener('click', () => openFile(filePath)); fragment.append(button);
    }
  }
  return fragment;
}

async function openFile(path) {
  $('#file-path').textContent = `${path} · loading…`;
  try {
    const { content } = await request(`${projectPath('/file')}?path=${encodeURIComponent(path)}`);
    openPath = path; $('#editor').value = content || ''; $('#editor').hidden = false; $('#editor-empty').hidden = true; $('#save-file').disabled = false; $('#file-path').textContent = path;
    $$('.file-button').forEach((item) => item.classList.toggle('active', item.dataset.path === path));
  } catch (error) { closeFile(); toast(error.message, true); }
}

function closeFile() {
  openPath = ''; $('#editor').value = ''; $('#editor').hidden = true; $('#editor-empty').hidden = false; $('#save-file').disabled = true; $('#file-path').textContent = 'No file open';
}

async function saveFile() {
  if (!projectId || !openPath) return;
  setBusy($('#save-file'), true);
  try { await request(projectPath('/file'), { method: 'PUT', body: JSON.stringify({ path: openPath, content: $('#editor').value }) }); toast(`Saved ${openPath}`); }
  catch (error) { toast(error.message, true); }
  finally { setBusy($('#save-file'), false); }
}

function resetTaskFeed() {
  delete $('#task-feed').dataset.answerShown; delete $('#task-feed').dataset.errorShown;
  $('#task-feed').innerHTML = '<article class="agent-message"><div class="message-mark">EA</div><div><strong>Ready when you are.</strong><p>I’ll show every tool action and result while I work.</p></div></article>';
  setTaskState('idle');
}

function addMessage(role, title, body = '') {
  const article = document.createElement('article'); article.className = `agent-message ${role}`;
  article.innerHTML = `<div class="message-mark">${role === 'user' ? 'YOU' : 'EA'}</div><div><strong>${escapeHtml(title)}</strong>${body ? `<p>${escapeHtml(body)}</p>` : ''}</div>`;
  $('#task-feed').append(article); $('#task-feed').scrollTop = $('#task-feed').scrollHeight;
}

function addEvent(event) {
  const node = document.createElement('div');
  const failed = event.type === 'error' || event.ok === false;
  node.className = `event ${failed ? 'error' : event.type === 'result' ? 'success' : ''}`;
  const label = event.tool || event.type || 'event';
  const payload = event.content ?? event.result ?? event.error ?? '';
  node.textContent = `${label}${payload ? `\n${typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}` : ''}`;
  $('#task-feed').append(node); $('#task-feed').scrollTop = $('#task-feed').scrollHeight;
}

function setTaskState(state) {
  setStatus($('#task-state'), state[0].toUpperCase() + state.slice(1), stateTone(state));
  const active = ['queued', 'running', 'cancelling'].includes(state);
  $('#cancel-task').hidden = !active; $('#run-agent').disabled = active || !projectId; $('#agent-prompt').disabled = active || !projectId;
}

function renderTask(task) {
  if (!task) return;
  setTaskState(task.status || 'unknown');
  const events = task.events || [];
  events.slice(renderedEventCount).forEach(addEvent); renderedEventCount = events.length;
  if (['succeeded', 'completed'].includes(task.status) && task.answer && !$('#task-feed').dataset.answerShown) {
    addMessage('assistant', 'Task complete', task.answer); $('#task-feed').dataset.answerShown = 'true';
  }
  if (task.status === 'failed' && task.error && !$('#task-feed').dataset.errorShown) {
    addMessage('assistant', 'Task failed', task.error); $('#task-feed').dataset.errorShown = 'true';
  }
}

async function runTask(prompt, endpoint = projectPath('/tasks')) {
  const { task } = await request(endpoint, { method: 'POST', body: JSON.stringify(endpoint.endsWith('/checks') ? { command: prompt } : { prompt }) });
  openTaskId = task.id; renderedEventCount = 0; delete $('#task-feed').dataset.answerShown; delete $('#task-feed').dataset.errorShown;
  renderTask(task); followTask(task.id);
  return task;
}

async function followTask(id) {
  taskStream?.abort();
  const controller = new AbortController(); taskStream = controller;
  try {
    const response = await request(`/api/tasks/${encodeURIComponent(id)}/events`, { raw: true, signal: controller.signal, headers: { accept: 'text/event-stream' } });
    if (!response.body) throw new Error('Streaming unavailable');
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (openTaskId === id) {
      const { value, done } = await reader.read(); if (done || openTaskId !== id) break; buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split(/\r?\n\r?\n/); buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const payload = chunk.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        if (payload) { try { const parsed = JSON.parse(payload); parsed.task ? renderTask(parsed.task) : addEvent(parsed); } catch { /* ignore malformed event */ } }
      }
    }
    await pollTask(id);
  } catch { if (!controller.signal.aborted) await pollTask(id); }
}

async function pollTask(id) {
  if (openTaskId !== id) return;
  try {
    const { task } = await request(`/api/tasks/${encodeURIComponent(id)}`); renderTask(task);
    if (['queued', 'running', 'cancelling'].includes(task.status)) pollTimer = setTimeout(() => pollTask(id), 1500);
    else { await Promise.all([loadFiles(), loadDiff(), loadTasks()]); }
  } catch (error) { toast(error.message, true); setTaskState('error'); }
}

async function loadTasks() {
  if (!projectId) return;
  try {
    const { tasks = [] } = await request(projectPath('/tasks'));
    const history = $('#task-history'); history.replaceChildren(new Option('Task history', ''));
    for (const task of tasks) history.add(new Option(`${task.status} · ${(task.prompt || task.command || 'Task').slice(0, 70)}`, task.id));
    history.value = openTaskId;
    const checks = tasks.filter((task) => task.kind === 'check' || task.command);
    const target = $('#checks-list'); target.replaceChildren();
    if (!checks.length) target.innerHTML = '<p class="empty">No checks have run.</p>';
    for (const task of checks) {
      const card = document.createElement('article'); card.className = 'check-card';
      card.innerHTML = `<header><strong>${escapeHtml(task.command || task.prompt || 'Check')}</strong><span class="status-pill ${stateTone(task.status)}"><i></i>${escapeHtml(task.status || 'unknown')}</span></header>${task.answer || task.error ? `<pre>${escapeHtml(task.answer || task.error)}</pre>` : ''}`;
      target.append(card);
    }
  } catch (error) { $('#checks-list').innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`; }
}

async function loadDiff() {
  if (!projectId) return;
  $('#diff-output').textContent = 'Loading changes…';
  try { const { diff = '' } = await request(projectPath('/diff')); $('#diff-output').textContent = diff || 'No uncommitted changes.'; }
  catch (error) { $('#diff-output').textContent = error.message; }
}

async function loadPreview() {
  if (!projectId) return;
  try {
    const response = await request(`${projectPath('/preview')}?path=${encodeURIComponent($('#preview-path').value.trim())}`, { raw: true });
    const html = await response.text(); if (previewUrl) URL.revokeObjectURL(previewUrl);
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
    previewUrl = URL.createObjectURL(new Blob([policy, html], { type: 'text/html' }));
    $('#preview-frame').src = previewUrl; $('#preview-frame').hidden = false; $('#preview-empty').hidden = true;
  } catch (error) { toast(error.message, true); }
}

function escapeHtml(value) {
  const node = document.createElement('span'); node.textContent = text(value); return node.innerHTML;
}

async function downloadArtifact() {
  if (!projectId) return;
  try {
    const response = await request(projectPath('/artifact'), { raw: true }); const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || ''; const name = disposition.match(/filename="?([^";]+)"?/)?.[1] || `${projects.find((item) => item.id === projectId)?.name || 'project'}.zip`;
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { toast(error.message, true); }
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const candidate = $('#access-token').value; $('#login-error').textContent = '';
  accessToken = candidate;
  try { await Promise.all([loadStatus(), loadProjects()]); $('#login-dialog').close(); $('#app').hidden = false; $('#access-token').value = ''; }
  catch (error) { accessToken = ''; $('#login-error').textContent = error.status === 401 ? 'That token was not accepted.' : error.message; }
});
$('#local-development').addEventListener('click', async () => {
  accessToken = ''; $('#login-error').textContent = '';
  try { await Promise.all([loadStatus(), loadProjects()]); $('#login-dialog').close(); $('#app').hidden = false; }
  catch (error) { $('#login-error').textContent = error.status === 401 ? 'Local development is disabled. Enter your access token.' : error.message; }
});
$('#account-button').addEventListener('click', () => { taskStream?.abort(); clearTimeout(pollTimer); openTaskId = ''; accessToken = ''; $('#app').hidden = true; $('#login-dialog').showModal(); $('#access-token').focus(); });
$('#task-history').addEventListener('change', async (event) => {
  const id = event.target.value; if (!id) return;
  taskStream?.abort(); clearTimeout(pollTimer); openTaskId = id; renderedEventCount = 0; resetTaskFeed();
  try { const { task } = await request(`/api/tasks/${encodeURIComponent(id)}`); if (openTaskId !== id) return; addMessage('user', 'Task', task.prompt || task.command); renderTask(task); if (['queued', 'running'].includes(task.status)) followTask(id); }
  catch (error) { toast(error.message, true); }
});
$('#project-select').addEventListener('change', async (event) => { projectId = event.target.value; updateProjectControls(); await selectProject(); });
$('#new-project').addEventListener('click', () => { $('#project-name').value = ''; $('#project-error').textContent = ''; $('#project-dialog').showModal(); $('#project-name').focus(); });
$('[data-close-dialog]').addEventListener('click', () => $('#project-dialog').close());
$('#project-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const submit = $('button[type="submit"]', event.currentTarget); setBusy(submit, true);
  try { const { project } = await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: $('#project-name').value.trim() }) }); $('#project-dialog').close(); await loadProjects(project.id); toast(`Created ${project.name}`); }
  catch (error) { $('#project-error').textContent = error.message; }
  finally { setBusy(submit, false); }
});
$('#refresh-files').addEventListener('click', loadFiles); $('#save-file').addEventListener('click', saveFile);
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && openPath) { event.preventDefault(); saveFile(); } });
$('#agent-prompt').addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') $('#agent-form').requestSubmit(); });
$('#agent-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const prompt = $('#agent-prompt').value.trim(); if (!prompt) return; addMessage('user', 'You', prompt); $('#agent-prompt').value = ''; setTaskState('queued');
  try { await runTask(prompt); } catch (error) { toast(error.message, true); setTaskState('error'); }
});
$('#cancel-task').addEventListener('click', async () => { if (!openTaskId) return; setTaskState('cancelling'); try { await request(`/api/tasks/${encodeURIComponent(openTaskId)}/cancel`, { method: 'POST' }); await pollTask(openTaskId); } catch (error) { toast(error.message, true); } });
$('#check-form').addEventListener('submit', async (event) => { event.preventDefault(); const command = $('#check-command').value.trim(); if (!command) return; try { await runTask(command, projectPath('/checks')); toast('Check started'); await loadTasks(); } catch (error) { toast(error.message, true); } });
$('#refresh-diff').addEventListener('click', loadDiff); $('#preview-form').addEventListener('submit', (event) => { event.preventDefault(); loadPreview(); });
$('#download-artifact').addEventListener('click', downloadArtifact);
$('#checkpoint').addEventListener('click', async () => { try { await request(projectPath('/checkpoint'), { method: 'POST' }); toast('Checkpoint created'); } catch (error) { toast(error.message, true); } });
$('#restore').addEventListener('click', async () => { if (!confirm('Restore the latest checkpoint? Current uncheckpointed changes will be replaced.')) return; try { await request(projectPath('/restore'), { method: 'POST' }); await Promise.all([loadFiles(), loadDiff()]); closeFile(); toast('Checkpoint restored'); } catch (error) { toast(error.message, true); } });
$$('.tab').forEach((tab) => tab.addEventListener('click', async () => { $$('.tab').forEach((item) => { const active = item === tab; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); }); $$('[data-view-panel]').forEach((panel) => { panel.hidden = panel.dataset.viewPanel !== tab.dataset.view; }); if (tab.dataset.view === 'changes') await loadDiff(); if (tab.dataset.view === 'checks') await loadTasks(); }));
window.addEventListener('beforeunload', () => { accessToken = ''; if (previewUrl) URL.revokeObjectURL(previewUrl); });

$('#login-dialog').showModal();
