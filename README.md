# slash-codex

Just `/codex` it.

`slash-codex` packages a comment-triggered Codex workflow as a standalone GitHub
Action. Maintainers can invoke Codex from issues, PR conversations, PR reviews,
and PR file comments. The action checks permissions, runs Codex with the
requested task, blocks sensitive paths, and then publishes safe changes back to a
same-repository PR branch or opens a new PR from a standalone issue.

The action currently targets OpenAI-compatible Codex Responses models.

## Quick start

Create a workflow such as `.github/workflows/slash-codex.yml`:

```yaml
name: Slash Codex

on:
  issue_comment:
    types: [created]
  pull_request_review:
    types: [submitted]
  pull_request_review_comment:
    types: [created]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  codex:
    if: github.event.sender.type != 'Bot'
    runs-on: ubuntu-latest
    steps:
      - uses: elithrar/slash-codex@main
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          model: gpt-5.5
```

No separate checkout step is required. The action checks out the correct branch
or PR merge ref after it validates the trigger.

Trigger it with a maintainer comment:

```text
/codex fix the failing test
```

Ask for a review-oriented pass with:

```text
/review focus on correctness and missing tests
```

The default command set is `/codex,/review`. Commands must appear at the start
of the comment body.

## How it publishes changes

- Same-repository PR comments can push a commit back to the PR branch when
  `push-pr-branch` is enabled.
- Standalone issue comments can create a branch and open a pull request when
  `create-pr` is enabled.
- Fork PRs are skipped by default so repository secrets are not exposed to fork
  code.
- Read-only runs can still post Codex feedback, but they do not publish changes.

## Repository instructions

Use `prompt_file` to add repository-specific instructions to every Codex run:

```yaml
- uses: elithrar/slash-codex@main
  with:
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    prompt_file: .github/slash-codex.md
```

`prompt_file` is read from the PR base branch or default branch, not from the
checked-out PR branch. This keeps untrusted PR changes from modifying the system
prompt used by the action.

## Providers

`provider: auto` is the default. It resolves to the first matching configured
provider in this order: OpenAI, Cloudflare, then OpenCode Zen.

Use direct OpenAI:

```yaml
- uses: elithrar/slash-codex@main
  with:
    provider: openai
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    model: gpt-5.5
```

Use Cloudflare AI Gateway with Unified Billing:

```yaml
- uses: elithrar/slash-codex@main
  with:
    provider: cloudflare
    cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    cloudflare-ai-gateway-id: ${{ vars.CLOUDFLARE_AI_GATEWAY_ID || 'default' }}
    cloudflare-api-key: ${{ secrets.CLOUDFLARE_API_KEY }}
    model: gpt-5.5
```

Cloudflare requests use the Codex action's Responses API proxy plus a local shim
that sends `cf-aig-gateway-id` to
`https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1/responses`. The
Cloudflare API key is passed to the proxy input, not exposed to the Codex process
environment.

Use OpenCode Zen:

```yaml
- uses: elithrar/slash-codex@main
  with:
    provider: opencode
    opencode-api-key: ${{ secrets.OPENCODE_API_KEY }}
    model: gpt-5.5
```

OpenCode Zen requests use `https://opencode.ai/zen/v1/responses`. Only Zen
models on the Responses endpoint are supported.

## Inputs

| Input                      | Default               | Description                                                                                                     |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `provider`                 | `auto`                | `auto`, `openai`, `cloudflare`, or `opencode`.                                                                  |
| `openai-api-key`           | empty                 | OpenAI API key. Prefer this over env passthrough.                                                               |
| `cloudflare-api-key`       | empty                 | Cloudflare API token. Prefer this over env passthrough.                                                         |
| `cloudflare-account-id`    | empty                 | Cloudflare account ID. Prefer this over env passthrough.                                                        |
| `cloudflare-ai-gateway-id` | `default`             | Cloudflare AI Gateway ID or slug. Prefer this over env passthrough.                                             |
| `opencode-api-key`         | empty                 | OpenCode Zen API key. Prefer this over env passthrough.                                                         |
| `model`                    | `gpt-5.5`             | OpenAI-compatible Codex Responses model.                                                                        |
| `commands`                 | `/codex,/review`      | Comma-separated slash commands.                                                                                 |
| `prompt_file`              | empty                 | Repository path to extra prompt instructions injected into every command. Read from the PR base/default branch. |
| `required-permission`      | `write`               | Minimum actor permission: `write`, `maintain`, or `admin`.                                                      |
| `allow-forks`              | `false`               | Run on fork PRs in read-only mode. Defaults safe.                                                               |
| `create-pr`                | `true`                | Allow standalone issue comments to create PRs.                                                                  |
| `push-pr-branch`           | `true`                | Allow same-repository PR comments to push commits.                                                              |
| `commit-message`           | `apply codex changes` | Commit message for published changes.                                                                           |
| `branch-prefix`            | `codex`               | Branch prefix for issue-created PRs.                                                                            |
| `blocked-paths`            | built-in list         | Extra newline- or comma-separated blocked globs.                                                                |
| `codex-version`            | empty                 | Optional Codex CLI version passed to `openai/codex-action`.                                                     |
| `codex-args`               | empty                 | Extra `codex exec` arguments.                                                                                   |
| `effort`                   | empty                 | Optional reasoning effort.                                                                                      |
| `safety-strategy`          | `drop-sudo`           | Passed to `openai/codex-action`.                                                                                |
| `github-token`             | `github.token`        | Override token for API calls and publishing.                                                                    |

## Outputs

| Output          | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `skipped`       | `true` when the event did not trigger a Codex run.         |
| `final-message` | Final message returned by Codex.                           |
| `changed`       | `true` when Codex changes were published.                  |
| `pr-url`        | Pull request URL created from an issue-triggered run.      |
| `provider`      | Resolved model provider: `openai`, `cloudflare`, or `opencode`. |

## Environment variable fallbacks

Inputs are preferred because the nested Codex action can isolate keys from the
Codex process. These env names are still accepted for passthrough compatibility
and are explicitly cleared before `codex exec` runs.

| Env                        | Provider     | Required                   |
| -------------------------- | ------------ | -------------------------- |
| `OPENAI_API_KEY`           | `openai`     | Yes for direct OpenAI.     |
| `CLOUDFLARE_ACCOUNT_ID`    | `cloudflare` | Yes.                       |
| `CLOUDFLARE_API_KEY`       | `cloudflare` | Yes.                       |
| `CLOUDFLARE_AI_GATEWAY_ID` | `cloudflare` | No, defaults to `default`. |
| `OPENCODE_API_KEY`         | `opencode`   | Yes for OpenCode Zen.      |

## Safety

Only users with the configured repository permission can run Codex. The default
minimum permission is `write`.

Before publishing, the action blocks changes to these built-in path patterns:

```text
.github/workflows/**
.github/scripts/codex/**
action.yml
action.yaml
.env
.env.*
**/.env
**/.env.*
*.pem
**/*.pem
*.key
**/*.key
*.p12
**/*.p12
*.pfx
**/*.pfx
```

Add repository-specific blocked paths with `blocked-paths`:

```yaml
- uses: elithrar/slash-codex@main
  with:
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    blocked-paths: |
      infra/production/**
      docs/private/**
```

## Development

```bash
npm install
npm run check
```

`npm run check` runs type checking, tests, linting, and the production build.

## License

Apache-2.0 licensed.
