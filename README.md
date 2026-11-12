# LLMIntel Deadline Check

GitHub Action that scans your repository for hard-coded LLM model ids (OpenAI, Anthropic, Azure, Bedrock, Vertex/Gemini, Cohere, and more), looks them up against [LLMIntel](https://llmintel.ai/?utm_source=github-action)'s live catalog, and warns when a model is deprecated or retiring soon.

No API key is required. Source code never leaves the runner — only the public catalog is downloaded, and matching happens locally.

## What it does

1. Downloads the public catalog from [llmintel.ai/v1/models](https://llmintel.ai/v1/models?utm_source=github-action)
2. Scans configurable file globs for model ids and aliases
3. Emits **annotations** and a **job summary** for every hit inside the `days_ahead` window
4. Optionally comments on the pull request
5. Optionally opens or updates a single tracking issue (handy on a weekly cron)
6. Optionally **fails the job** when a hit retires within `fail_within_days`

Every model link includes `utm_source=github-action`.

## Quick start

```yaml
name: LLM Model Deadline Check
on:
  schedule: [{ cron: "0 14 * * 1" }]
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
  pull-requests: write
  issues: write
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hivemindunit/llmintel-deadline-check@v1
        with:
          days_ahead: "120"
          fail_within_days: "14"
          comment_on_pr: "true"
          create_issue: "true"
```

See [`examples/deadline-check.yml`](./examples/deadline-check.yml) for a fuller copy-paste workflow.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `days_ahead` | `120` | Warn when retirement is within this many days (retired ids always warn). |
| `fail_within_days` | _(empty)_ | Fail the job when a hit retires within N days. Empty = never fail. |
| `providers` | _(all)_ | Comma-separated provider filter (`openai`, `anthropic`, `azure`, `bedrock`, `google`, `vertex`, `mistral`, `cohere`). |
| `paths` | common source globs | Comma-separated globs to scan. |
| `exclude` | `node_modules`, `dist`, … | Comma-separated globs to skip. |
| `api_base` | `https://llmintel.ai` | Catalog base URL. |
| `comment_on_pr` | `true` | Upsert a PR comment on `pull_request` events. |
| `create_issue` | `false` | Upsert the rolling tracking issue. |
| `issue_labels` | `llmintel-deadline-check` | Labels for that issue. |
| `github_token` | `${{ github.token }}` | Token for comments and issues. |

## Outputs

| Output | Description |
| --- | --- |
| `hit_count` | Number of (model × file:line) hits |
| `model_count` | Distinct model ids with hits |
| `failing` | `true` when the job failed due to `fail_within_days` |

## Example output

Job summary / PR comment when a deprecated model is found:

```markdown
## Model deadlines found by LLMIntel

Found **1** location(s) referencing model ids that are deprecated, retiring, or retired.

| Model | State | Deadline | Replacement | Location |
| --- | --- | --- | --- | --- |
| [openai/gpt-4o](https://llmintel.ai/models/openai/gpt-4o?utm_source=github-action) | deprecated | retires in 27 days | [openai/gpt-5](https://llmintel.ai/models/openai/gpt-5?utm_source=github-action) | `src/a.ts:3` |

Get free retirement alerts: [llmintel.ai/retirement-alerts](https://llmintel.ai/retirement-alerts?utm_source=github-action)
```

Annotations also appear on the matching file lines in the Checks UI.

## Local development

```bash
pnpm install
pnpm test
pnpm build
```

`pnpm build` emits a self-contained `dist/index.js` (dependencies bundled). Commit the rebuilt `dist/` whenever sources change.

## Privacy

- The Action only **downloads** public catalog JSON from LLMIntel.
- It does **not** upload your source. Matching is local.
- Anonymous rate limits apply to catalog reads.

## Related

- [LLMIntel](https://llmintel.ai/?utm_source=github-action)
- [Catalog API](https://llmintel.ai/v1/models?utm_source=github-action)
- [Bulk lookup](https://llmintel.ai/v1/models/lookup?ids=gpt-4o,claude-3-5-sonnet-latest&utm_source=github-action)
- [README badges](https://llmintel.ai/badge/openai/gpt-4o.svg?utm_source=github-action)
- [Free retirement alerts](https://llmintel.ai/retirement-alerts?utm_source=github-action)

## License

MIT
