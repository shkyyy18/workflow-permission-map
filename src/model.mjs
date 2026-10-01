import { parseDocument, isMap, isSeq, isScalar, isAlias, LineCounter } from 'yaml';

export const MAX_BYTES = 262144;
// Syntax vocabulary, not a claim that every scope is available on every GitHub plan/version.
export const SCOPES = Object.freeze([
  'actions', 'artifact-metadata', 'attestations', 'checks', 'code-quality',
  'contents', 'deployments', 'discussions', 'id-token', 'issues', 'packages',
  'pages', 'pull-requests', 'security-events', 'statuses', 'vulnerability-alerts',
]);
export class InputError extends Error {}
const fail = message => { throw new InputError(message); };
const key = pair => isScalar(pair.key) ? pair.key.value : undefined;
const field = (map, name) => map.items.find(pair => key(pair) === name);

function inspectTree(root) {
  const pending = [[root, 0]];
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node) continue;
    if (++count > 30000 || depth > 40) fail('YAML is too complex (30,000 nodes / depth 40 maximum).');
    if (isAlias(node)) fail('YAML aliases are not supported in this prototype. Expand anchors first.');
    if (node.tag) fail('Explicit YAML tags are not supported.');
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== 'string') fail('Mapping keys must be strings.');
        if (pair.key.value === '<<') fail('YAML merge keys are not supported.');
        pending.push([pair.key, depth + 1], [pair.value, depth + 1]);
      }
    } else if (isSeq(node)) {
      for (const child of node.items) pending.push([child, depth + 1]);
    }
  }
}

function policy(pair, path, lines) {
  if (!pair) return null;
  const node = pair.value;
  const line = lines.linePos(pair.key.range[0]).line;
  if (isScalar(node) && ['read-all', 'write-all'].includes(node.value)) {
    return { kind: node.value, path, line, values: {} };
  }
  if (!isMap(node)) fail(`${path}: use a permission map, {}, read-all or write-all; null/expressions are not supported.`);
  const values = Object.create(null);
  const entryLines = Object.create(null);
  for (const entry of node.items) {
    const scope = key(entry);
    if (!SCOPES.includes(scope)) fail(`${path}: unrecognized permission "${scope}"; input is not partially interpreted.`);
    const value = isScalar(entry.value) ? entry.value.value : null;
    const allowed = scope === 'id-token' ? ['write', 'none']
      : scope === 'vulnerability-alerts' ? ['read', 'none'] : ['read', 'write', 'none'];
    if (!allowed.includes(value)) fail(`${path}.${scope}: allowed values are ${allowed.join(', ')}.`);
    values[scope] = value;
    entryLines[scope] = lines.linePos(entry.key.range[0]).line;
  }
  return { kind: 'map', path, line, values, entryLines };
}

function cell(scope, selected, workflow, jobPolicy) {
  const base = { scope, source: selected?.path ?? 'repository / organization / enterprise defaults', line: selected?.entryLines?.[scope] ?? selected?.line ?? null };
  if (!selected) return { ...base, value: 'unknown', reason: 'Neither workflow nor job declares permissions. Defaults were not read.' };
  if (selected.kind !== 'map') return { ...base, value: selected.kind, reason: `Symbolic ${selected.kind} declaration. Not expanded into per-scope grants; availability differs by platform/version.` };
  const explicit = Object.hasOwn(selected.values, scope);
  const overridden = jobPolicy && workflow ? ' The job declaration replaces the workflow permission map; values are not merged.' : '';
  return { ...base, value: explicit ? selected.values[scope] : 'none', reason: (explicit ? 'Explicitly declared in this permission map.' : 'Not listed in this permission map, so the declared level is none.') + overridden };
}

export function analyze(text) {
  if (typeof text !== 'string') fail('Expected YAML text.');
  if (new TextEncoder().encode(text).length > MAX_BYTES) fail('Input exceeds 256 KiB.');
  const lines = new LineCounter();
  let doc;
  try {
    doc = parseDocument(text, { version: '1.2', lineCounter: lines, uniqueKeys: true, strict: true, prettyErrors: false });
  } catch { fail('Unable to parse YAML.'); }
  if (doc.errors.length) fail(`Invalid YAML: ${doc.errors[0].message}`);
  if (doc.warnings.length) fail(`Unsupported YAML: ${doc.warnings[0].message}`);
  if (doc.directives.yaml.explicit && doc.directives.yaml.version !== '1.2') fail('Only YAML 1.2 is supported.');
  inspectTree(doc.contents);
  if (!isMap(doc.contents)) fail('Workflow must be a YAML mapping.');
  const workflow = policy(field(doc.contents, 'permissions'), 'permissions', lines);
  const jobsNode = field(doc.contents, 'jobs')?.value;
  if (!isMap(jobsNode) || !jobsNode.items.length) fail('Workflow must contain a non-empty jobs mapping.');
  if (jobsNode.items.length > 200) fail('At most 200 jobs are supported.');
  const eventNode = field(doc.contents, 'on')?.value;
  let events = [];
  if (isScalar(eventNode) && typeof eventNode.value === 'string') events = [eventNode.value];
  else if (isSeq(eventNode) && eventNode.items.every(n => isScalar(n) && typeof n.value === 'string')) events = eventNode.items.map(n => n.value);
  else if (isMap(eventNode)) events = eventNode.items.map(key);
  else fail('Expected on: event, event list, or event mapping. This is not a full workflow validator.');
  if (!events.length || events.some(e => !/^[a-z][a-z0-9_]*$/.test(e))) fail('Event names must be non-empty literal identifiers.');
  const cautions = [
    'This is declared permission provenance, NOT the actual runtime token or a security audit.',
    'Repository/organization policy, event context, Dependabot and fork settings are not fetched or resolved.',
    'Reusable-workflow caller restrictions can reduce permissions; referenced workflows are not loaded.',
    'PATs, app tokens, secrets, action behavior and token use are outside this model.',
    'Scope availability varies by GitHub product/version. Recognized spelling does not prove availability.',
  ];
  if (events.includes('pull_request')) cautions.push('pull_request: fork-origin runs can reduce write permissions. The triggering origin and send-write-tokens setting are unknown.');
  if (events.includes('pull_request_target')) cautions.push('pull_request_target: privileged event semantics need separate review. Never infer a safe runtime from this matrix.');
  if (events.includes('workflow_call')) cautions.push('workflow_call: permissions cannot exceed the caller chain; caller context is unknown.');
  const jobs = jobsNode.items.map(entry => {
    const id = key(entry);
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(id)) fail('Unsupported job identifier.');
    if (!isMap(entry.value)) fail(`jobs.${id} must be a mapping.`);
    const jobPolicy = policy(field(entry.value, 'permissions'), `jobs.${id}.permissions`, lines);
    const selected = jobPolicy ?? workflow;
    const uses = field(entry.value, 'uses');
    if (uses && (!isScalar(uses.value) || typeof uses.value.value !== 'string')) fail(`jobs.${id}.uses must be a string.`);
    return {
      id, line: lines.linePos(entry.key.range[0]).line,
      kind: uses ? 'reusable workflow call (callee unresolved)' : 'job (steps not interpreted)',
      policy: selected, overridesWorkflow: Boolean(jobPolicy && workflow),
      cells: SCOPES.map(scope => cell(scope, selected, workflow, jobPolicy)),
    };
  });
  return { schemaVersion: 1, model: 'declared-only', events, workflow, cautions, jobs };
}
