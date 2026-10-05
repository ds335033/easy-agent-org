const $ = (selector) => document.querySelector(selector);
let history = [];

async function api(path, options = {}) {
  const token = localStorage.getItem('easy-agent-token');
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

function session() { return $('#session').value.trim(); }
function message(role, text) {
  const article = document.createElement('article');
  article.className = role;
  article.textContent = text;
  $('#messages').append(article);
  article.scrollIntoView({ behavior: 'smooth' });
}

async function refresh() {
  const name = encodeURIComponent(session());
  await api('/api/sessions', { method: 'POST', body: JSON.stringify({ session: session() }) });
  const [{ files }, git] = await Promise.all([api(`/api/files?session=${name}`), api(`/api/git?session=${name}`)]);
  $('#files').textContent = files.map((file) => `${file.type === 'directory' ? '▸' : '·'} ${file.name}`).join('\n') || 'No files yet';
  $('#git').textContent = `${git.stdout}${git.stderr}`.trim() || 'Not initialized';
}

$('#open').addEventListener('click', () => refresh().catch((error) => message('error', error.message)));
$('#chat').addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = $('#prompt').value.trim();
  message('user', prompt); $('#prompt').value = '';
  const button = event.submitter; button.disabled = true; button.textContent = 'Working…';
  try {
    const result = await api('/api/chat', { method: 'POST', body: JSON.stringify({ session: session(), prompt, history }) });
    message('assistant', `${result.answer}\n\n${result.events.length ? `Tools: ${result.events.map((e) => e.tool).join(', ')}` : ''}`.trim());
    history.push({ role: 'user', content: prompt }, { role: 'assistant', content: result.answer });
    await refresh();
  } catch (error) { message('error', error.message); }
  finally { button.disabled = false; button.textContent = 'Run agent'; }
});
$('#terminal').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await api('/api/terminal', { method: 'POST', body: JSON.stringify({ session: session(), command: $('#command').value }) });
    $('#output').textContent = `$ ${$('#command').value}\n${result.stdout}${result.stderr}\n(exit ${result.exitCode})`;
    await refresh();
  } catch (error) { $('#output').textContent = error.message; }
});

Promise.all([api('/api/health'), api('/api/integrations')]).then(([health, result]) => {
  $('#status').textContent = `App online · ${health.model} unverified`;
  $('#integrations').textContent = result.integrations.map((item) => {
    const state = item.enabled && item.configured ? 'enabled' : item.configured ? 'available' : 'needs setup';
    return `${state === 'enabled' ? '●' : '○'} ${item.label} — ${state}`;
  }).join('\n');
  refresh();
}).catch((error) => { $('#status').textContent = error.message; });
