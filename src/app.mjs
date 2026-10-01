import { analyze, SCOPES, MAX_BYTES } from './model.mjs';
import example from '../examples/synthetic.yml';
const $ = id => document.getElementById(id);
let current = null;
let source = '';
let generation = 0;
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function invalidate(message = 'Input changed. Run Explain permissions to refresh.') {
  current = null;
  source = '';
  $('result').hidden = true;
  $('empty').hidden = false;
  $('error').hidden = true;
  $('status').textContent = message;
  for (const id of ['head', 'body', 'stats', 'detail', 'cautions']) $(id).replaceChildren();
}
function explain(job, cell) {
  const detail = $('detail');
  detail.replaceChildren(el('h3', `${job.id} / ${cell.scope}`, 'wrap'));
  detail.append(el('p', `Declared level: ${cell.value}`));
  detail.append(el('p', cell.reason));
  detail.append(el('code', cell.line ? `${cell.source} · line ${cell.line}` : cell.source));
  if (cell.line) detail.append(el('code', source.split(/\r?\n/)[cell.line - 1] ?? ''));
  detail.append(el('p', `${job.kind}. Actual runtime authority remains unresolved.`, 'small muted'));
}
function renderTable() {
  if (!current) return;
  const header = el('tr');
  header.append(el('th', 'Scope'));
  for (const job of current.jobs) {
    const heading = el('th', job.id);
    heading.scope = 'col';
    heading.append(el('small', job.overridesWorkflow ? 'job replaces workflow' : job.policy ? `from ${job.policy.path}` : 'defaults unknown'));
    header.append(heading);
  }
  $('head').replaceChildren(header);
  $('body').replaceChildren();
  const scopes = SCOPES.filter(scope => $('scope-filter').value === 'all' || current.jobs.some(j => j.cells.find(c => c.scope === scope).value !== 'none'));
  for (const scope of scopes) {
    const row = el('tr');
    const heading = el('th', scope);
    heading.scope = 'row';
    row.append(heading);
    for (const job of current.jobs) {
      const cell = job.cells.find(c => c.scope === scope);
      const td = el('td');
      const button = el('button', cell.value);
      button.dataset.level = cell.value;
      button.setAttribute('aria-label', `${job.id}: ${scope}: ${cell.value}. Explain source`);
      button.addEventListener('click', () => explain(job, cell));
      td.append(button); row.append(td);
    }
    $('body').append(row);
  }
  if (!scopes.length) {
    const row = el('tr'), td = el('td', 'All recognized scopes are declared none. Select “All recognized scopes” to inspect.');
    td.colSpan = current.jobs.length + 1; row.append(td); $('body').append(row);
  }
}
function run() {
  generation++;
  invalidate('');
  try {
    source = $('yaml').value;
    current = analyze(source);
    $('empty').hidden = true; $('result').hidden = false;
    const stats = [[current.jobs.length, 'jobs'], [current.jobs.filter(j => j.overridesWorkflow).length, 'job overrides'], [current.jobs.filter(j => !j.policy).length, 'unknown defaults']];
    for (const [value, label] of stats) {
      const item = el('div', undefined, 'stat'); item.append(el('strong', String(value)), el('span', label)); $('stats').append(item);
    }
    for (const caution of current.cautions) $('cautions').append(el('li', caution));
    renderTable();
    explain(current.jobs[0], current.jobs[0].cells.find(c => c.scope === 'contents'));
    $('status').textContent = `Parsed locally. Events: ${current.events.join(', ')}. Steps were not interpreted.`;
  } catch (error) {
    invalidate('No result. Fix input and try again.');
    $('error').textContent = error.message; $('error').hidden = false;
  }
}
$('analyze').addEventListener('click', run);
$('yaml').addEventListener('input', () => { generation++; invalidate(); });
$('example').addEventListener('click', () => { generation++; $('yaml').value = example; $('file').value = ''; run(); });
$('clear').addEventListener('click', () => { generation++; $('yaml').value = ''; $('file').value = ''; invalidate('Cleared. No input retained by the app.'); });
$('scope-filter').addEventListener('change', renderTable);
$('file').addEventListener('change', async () => {
  const token = ++generation;
  invalidate('Reading local file…');
  $('yaml').value = '';
  try {
    const file = $('file').files[0];
    if (!file) { invalidate('No file selected.'); return; }
    if (file.size > MAX_BYTES) throw new Error('File exceeds 256 KiB.');
    const text = await file.text();
    if (token !== generation) return;
    $('yaml').value = text;
    run();
  } catch (error) {
    if (token !== generation) return;
    invalidate('No result.'); $('error').textContent = error.message; $('error').hidden = false;
  }
});
$('export').addEventListener('click', () => {
  if (!current) return;
  const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a'); link.href = url; link.download = 'declared-permissions.json';
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Begin with an explicitly synthetic demo; never load files or persisted user input automatically.
$('yaml').value = example;
run();
