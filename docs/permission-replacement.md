# Why a job's contents declaration becomes none

This is a **synthetic example**, not a real account's workflow or an observed
production failure. It only echoes text. Do not use it as a publishing workflow.

## A job map replaces the workflow map

```yaml
name: Synthetic replacement example
on: push
permissions:
  contents: read
  issues: write
jobs:
  inherited:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Synthetic example only"
  publish:
    permissions:
      packages: write
    runs-on: ubuntu-latest
    steps:
      - run: echo "No package is published"
```

Paste it into the [browser app](https://shkyyy18.github.io/workflow-permission-map/)
and select **Explain permissions**. Expected declared results:

| Scope | inherited | publish |
| --- | --- | --- |
| contents | read | none |
| issues | write | none |
| packages | none | write |

Click `publish / contents`. Its source is `jobs.publish.permissions`, line 12.
Because that job has its own permission map, it does not inherit the workflow's
`contents: read` or `issues: write`. A scope omitted from the selected map is `none`.

## Declare the intended scope explicitly

If that synthetic job is intended to declare content-read access, its map could be:

```yaml
permissions:
  contents: read
  packages: write
```

Replace the job's map, not the entire workflow, then explain it again.
Expected declaration: `publish / contents` is now `read`; `issues` remains `none`.
This is not a recommendation to add permissions to a real workflow: choose only
the scopes that your actual job requires, and review the platform's restrictions.

## What this example does not prove

The tool neither runs steps nor fetches repository defaults. Fork-origin events,
Dependabot, repository and organization settings, reusable callers and other token
types can change runtime authority. A green/read cell is **not** a safety verdict.
Some valid workflows are rejected by the alpha's deliberately limited YAML model;
see the [input limits](../README.md#deliberate-limits).

Reference: [GitHub workflow syntax: permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).

## 中文摘要

这是只输出文本的合成示例，不是真实线上故障。job 里的权限表替换工作流权限表，
不是逐项相加；遗漏项为 `none`。给合成 job 显式增加 `contents: read` 后，
声明会变为 `read`，但并不证明实际 token 拥有这个权限，也不构成真实工作流的授权建议。
