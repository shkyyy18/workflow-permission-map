# Workflow Permission Map — v0.1.0 alpha

Explain **declared** GitHub Actions permissions in an offline browser, cell by cell.
This is not a security scanner, a workflow validator, or a model of the actual runtime token.

## Try locally

Requires Node.js 22+ for building; the generated file needs only a modern browser.

```sh
npm ci --ignore-scripts
npm test
npm run build
```

Open `dist/index.html` directly in a browser. No server, account, GitHub token or network
connection is required at runtime. It starts with a clearly synthetic workflow.
Paste a workflow or use **Open YAML**, then **Explain permissions**. Click any cell
for the declaration path, source line, and explanation. Editing the input immediately
invalidates the old report. Use **Clear** to discard input and results.

Example: the synthetic workflow grants `contents: read` and `issues: write` globally.
Its `publish` job declares only `packages: write`. That job's `contents` and `issues`
are therefore declared `none`, not inherited. The example never publishes anything.

## Exact scope

- Workflow-level and job-level maps, explicit `{}`, and source line provenance.
- Missing declarations remain **unknown**: repository defaults are not fetched.
- `read-all` and `write-all` remain **symbolic policies**, not invented per-scope grants.
- Job maps replace workflow maps, including unspecified scopes becoming `none`.
- Reusable calls are identified but **not fetched**; their internal jobs and caller
  restrictions are unresolved. No `needs` graph, secret or command analysis.
- Export JSON contains job identifiers and permission declarations, not the original
  step scripts. It is **not a redactor**; review every report before sharing.
- No uploads, telemetry, persistent storage, workflow execution or embedded credentials.
  Browser extensions and the host OS are outside this claim. External reuse or modification
  of this prototype is outside the tested boundary.

## Deliberate limits

YAML 1.2 only, one document, at most 256 KiB / 200 jobs / 30,000 syntax nodes / depth 40.
Aliases, merge keys, explicit tags, duplicate keys, unsupported permission names/values,
null permissions, and permission expressions are rejected instead of partially modeled.
Some valid GitHub workflows may therefore be rejected. This prototype does not validate
steps, required workflow fields, expressions elsewhere, or event availability.

Known scope spellings are based on GitHub's documentation source reviewed on 2026-10-01.
The source includes feature-gated scopes: accepting a spelling does **not** establish
availability on any plan, enterprise version, repository or event. Future names fail closed
until the vocabulary is reviewed. For example `id-token` accepts only `write`/`none`,
while `vulnerability-alerts` accepts `read`/`none` in the documented vocabulary.

Fork-origin events, Dependabot, organization/repository settings, reusable caller chains,
PATs, app tokens and action behavior can change what runs can actually do. This tool does
not compute those effects or award a safe/unsafe score.

## Existing tools and this experiment

Actions Permission Diff Ledger already compares workflow trust-boundary changes and emits
Markdown/JSON/JUnit/SARIF. Use it when you need that CLI review workflow; this prototype is
not a replacement. Its narrow experiment is a single-file, interactive explanation of one
workflow's permission sources. Browser presentation alone is not evidence of demand or
novelty. No independent user validation has been obtained. This is an experimental alpha, not a production security product.

## Primary references

- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
- https://github.com/github/docs/blob/main/data/reusables/actions/github-token-available-permissions.md
- https://github.com/yzf121/actions-permission-diff-ledger
- https://eemeli.org/yaml/

These are documentation references, not runtime dependencies. See `README.zh-CN.md` for Chinese.

## Development

`src/model.mjs` is the pure, tested AST model. `src/app.mjs` renders via DOM text nodes,
never HTML derived from user input. `npm run build` embeds the YAML parser into one HTML.
A restrictive CSP disables connections. Unit tests run with Node's built-in test runner.
See `THIRD_PARTY_NOTICES.txt` for bundled dependencies. MIT license.

## Download / 在线合成演示

[Open browser app](https://shkyyy18.github.io/workflow-permission-map/) · [Download standalone index.html](https://github.com/shkyyy18/workflow-permission-map/releases/tag/v0.1.0)

Download `index.html` and open it offline for your own workflows. The app requires no upload. Compare its SHA-256 with `SHA256SUMS.txt` from the same release.

Build inputs and the published standalone file use LF line endings for reproducible Windows/Linux builds.
