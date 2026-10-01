import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, InputError, SCOPES, MAX_BYTES } from '../src/model.mjs';
const base = (permission = '', job = '    runs-on: ubuntu-latest') => `on: push\n${permission}jobs:\n  build:\n${job}\n`;
const level = (result, scope, index = 0) => result.jobs[index].cells.find(c => c.scope === scope);
const reject = (name, source, pattern) => test(name, () => assert.throws(() => analyze(source), { name: 'Error', message: pattern }));
test('synthetic example: inheritance, replacement, empty map, reusable caller', () => {
  const result = analyze(readFileSync('examples/synthetic.yml', 'utf8'));
  assert.equal(result.jobs.length, 4);
  assert.equal(level(result, 'contents').value, 'read');
  assert.equal(level(result, 'issues').value, 'write');
  assert.equal(level(result, 'contents', 1).value, 'none');
  assert.equal(level(result, 'packages', 1).value, 'write');
  assert.match(level(result, 'contents', 1).reason, /not merged/);
  assert.ok(result.jobs[2].cells.every(c => c.value === 'none'));
  assert.match(result.jobs[3].kind, /callee unresolved/);
});
test('defaults stay unknown', () => assert.ok(analyze(base()).jobs[0].cells.every(c => c.value === 'unknown' && c.line === null)));
test('one explicit workflow permission makes all other scopes none', () => {
  const result = analyze(base('permissions:\n  contents: read\n'));
  assert.equal(level(result, 'contents').value, 'read');
  assert.equal(level(result, 'issues').value, 'none');
  assert.equal(level(result, 'contents').line, 3);
  assert.equal(level(result, 'issues').line, 2);
});
test('empty workflow map disables all declared scopes', () => assert.ok(analyze(base('permissions: {}\n')).jobs[0].cells.every(c => c.value === 'none')));
test('empty job overrides nonempty workflow', () => assert.ok(analyze(base('permissions: write-all\n', '    permissions: {}')).jobs[0].cells.every(c => c.value === 'none')));
for (const value of ['read-all', 'write-all']) {
  test(`${value} remains symbolic, including id-token`, () => assert.ok(analyze(base(`permissions: ${value}\n`)).jobs[0].cells.every(c => c.value === value)));
  test(`job ${value} replaces workflow map`, () => {
    const result = analyze(base('permissions: {}\n', `    permissions: ${value}`));
    assert.equal(level(result, 'contents').value, value);
    assert.equal(level(result, 'contents').source, 'jobs.build.permissions');
  });
}
for (const scope of SCOPES) test(`known scope ${scope} is retained`, () => assert.equal(level(analyze(base(`permissions:\n  ${scope}: none\n`)), scope).value, 'none'));
test('line references survive CRLF and comments', () => {
  const source = '# 合成例子\r\non: push\r\npermissions:\r\n  contents: write\r\njobs:\r\n  build:\r\n    permissions:\r\n      packages: read\r\n';
  const result = analyze(source);
  assert.equal(level(result, 'packages').line, 8);
  assert.equal(level(result, 'contents').line, 7);
});
test('on remains a string under YAML 1.2', () => assert.deepEqual(analyze(base()).events, ['push']));
test('event mapping and caution', () => {
  const result = analyze(base().replace('on: push', 'on:\n  pull_request_target:\n    branches: [main]\n  workflow_call:'));
  assert.deepEqual(result.events, ['pull_request_target', 'workflow_call']);
  assert.ok(result.cautions.some(c => c.startsWith('pull_request_target:')));
  assert.ok(result.cautions.some(c => c.startsWith('workflow_call:')));
});
test('fork caution never transforms declared writes', () => {
  const result = analyze(base('permissions:\n  contents: write\n').replace('on: push', 'on: [pull_request]'));
  assert.equal(level(result, 'contents').value, 'write');
  assert.ok(result.cautions.some(c => c.startsWith('pull_request:')));
});
test('job-only permissions are supported', () => assert.equal(level(analyze(base('', '    permissions:\n      contents: read')), 'contents').source, 'jobs.build.permissions'));
test('prototype-like job names do not mutate objects', () => {
  const result = analyze(base().replace('build:', '__proto__:'));
  assert.equal(result.jobs[0].id, '__proto__');
  assert.equal({}.polluted, undefined);
});
test('uninterpreted scripts never enter model output', () => {
  const result = analyze(base('', '    steps:\n      - run: echo SYNTHETIC_PRIVATE_MARKER'));
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_MARKER'));
});
reject('unknown scope rejects whole input', base('permissions:\n  future-scope: read\n'), /unrecognized permission/);
reject('id-token read is rejected', base('permissions:\n  id-token: read\n'), /allowed values are write, none/);
reject('vulnerability-alerts write is rejected', base('permissions:\n  vulnerability-alerts: write\n'), /allowed values are read, none/);
reject('permission expression rejected', base('permissions: "${{ inputs.permissions }}"\n'), /use a permission map/);
reject('null permission rejected', base('permissions:\n'), /use a permission map/);
reject('array permission rejected', base('permissions: [read]\n'), /use a permission map/);
reject('boolean level rejected', base('permissions:\n  contents: true\n'), /allowed values/);
reject('duplicate scope rejected', base('permissions:\n  contents: read\n  contents: write\n'), /Invalid YAML/);
reject('duplicate job rejected', base() + '  build: {}\n', /Invalid YAML/);
reject('duplicate unrelated fields rejected', base('', '    name: one\n    name: two'), /Invalid YAML/);
reject('multiple documents rejected', base() + '---\nhello: world', /Invalid YAML/);
reject('aliases rejected', base('permissions: &p {}\n', '    permissions: *p'), /aliases/);
reject('merge keys rejected', base('permissions:\n  <<: {}\n'), /merge keys/);
reject('custom tags rejected', base('permissions: !custom {}\n'), /Unsupported YAML|tags/);
reject('standard explicit tags rejected', base('permissions: !!map {}\n'), /tags/);
reject('non-string mapping keys rejected', base('permissions:\n  123: read\n'), /keys must be strings/);
reject('complex keys rejected', 'on: push\njobs:\n  ? [a,b]\n  : {}', /keys must be strings/);
reject('YAML 1.1 rejected', '%YAML 1.1\n---\n' + base(), /Only YAML 1.2/);
reject('invalid syntax rejected', 'jobs: [', /Invalid YAML/);
reject('empty document rejected', '', /must be a YAML mapping/);
reject('non-map root rejected', '- foo', /must be a YAML mapping/);
reject('no jobs rejected', 'on: push', /non-empty jobs/);
reject('empty jobs rejected', 'on: push\njobs: {}', /non-empty jobs/);
reject('non-map job rejected', 'on: push\njobs:\n  a: hello', /must be a mapping/);
reject('invalid job identifier rejected', base().replace('build:', 'bad.name:'), /job identifier/);
reject('missing event rejected', base().replace('on: push\n', ''), /Expected on/);
reject('empty event rejected', base().replace('on: push', 'on: []'), /Event names/);
reject('event expression rejected', base().replace('on: push', 'on: "${{ inputs.event }}"'), /Event names/);
reject('non-string uses rejected', base('', '    uses: 123'), /uses must be a string/);
reject('over 200 jobs rejected', 'on: push\njobs:\n' + Array.from({length: 201}, (_, i) => `  j${i}: {}\n`).join(''), /At most 200/);
reject('oversized UTF-8 rejected', '# ' + '中'.repeat(MAX_BYTES / 2), /256 KiB/);
reject('oversized ASCII rejected', ' '.repeat(MAX_BYTES + 1), /256 KiB/);
reject('deep input rejected', 'on: push\nx: ' + '['.repeat(50) + '1' + ']'.repeat(50) + '\njobs:\n  a: {}', /too complex/);
reject('node count bounded', 'on: push\nx: [' + 'a,'.repeat(30001) + ']\njobs:\n  a: {}', /too complex/);
test('non-string input raises controlled error', () => assert.throws(() => analyze(null), InputError));
test('models are deterministic and JSON serializable', () => assert.equal(JSON.stringify(analyze(base())), JSON.stringify(analyze(base()))));
