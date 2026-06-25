# slash-codex

Just `/codex` it.

`slash-codex` packages a comment-triggered Codex workflow as a standalone GitHub Action. It responds to maintainer slash commands on issues, PR conversations, PR reviews, and file comments, then publishes safe changes back to same-repo PR branches or opens a PR from standalone issues.

We only target OpenAI-compatible Codex Responses models for now.

## Usage

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

Trigger it with:

```text
/codex fix the failing test
```

Or ask for a review:

```text
/review focus on correctness and missing tests
```

Add repository-specific instructions to every command with `prompt_file`:

```yaml
- uses: elithrar/slash-codex@main
  with:
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    prompt_file: .github/slash-codex.md
```

`prompt_file` is read from the PR base branch or default branch, not from the checked-out PR branch.

## Providers

Use direct OpenAI:

```yaml
- uses: elithrar/slash-codex@main
  with:
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    provider: openai
    model: gpt-5.5
```

Use Cloudflare AI Gateway with Unified Billing:

```yaml
- uses: elithrar/slash-codex@main
  with:
    cloudflare-account-id: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    cloudflare-ai-gateway-id: ${{ vars.CLOUDFLARE_AI_GATEWAY_ID || 'default' }}
    cloudflare-api-key: ${{ secrets.CLOUDFLARE_API_KEY }}
    provider: cloudflare
    model: gpt-5.5
```

Cloudflare requests use the Codex action's Responses API proxy plus a local shim that sends `cf-aig-gateway-id` to `https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1/responses`. The Cloudflare API key is passed to the proxy input, not exposed to the Codex process environment.

Use OpenCode Zen:

```yaml
- uses: elithrar/slash-codex@main
  with:
    opencode-api-key: ${{ secrets.OPENCODE_API_KEY }}
    provider: opencode
    model: gpt-5.5
```

OpenCode Zen requests use `https://opencode.ai/zen/v1/responses`. Only Zen models on the Responses endpoint are supported.

## Config

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
| `create-pr`                | `true`                | Allow standalone issue comments to create or update Codex PRs.                                                  |
| `push-pr-branch`           | `true`                | Allow same-repo PR comments to push commits and sync branches.                                                  |
| `commit-message`           | `apply codex changes` | Commit message for published changes.                                                                           |
| `branch-prefix`            | `codex`               | Branch prefix for issue-created PRs.                                                                            |
| `blocked-paths`            | built-in list         | Extra newline- or comma-separated blocked globs.                                                                |
| `codex-version`            | empty                 | Optional Codex CLI version passed to `openai/codex-action`.                                                     |
| `codex-args`               | empty                 | Extra `codex exec` arguments.                                                                                   |
| `effort`                   | empty                 | Optional reasoning effort.                                                                                      |
| `safety-strategy`          | `drop-sudo`           | Passed to `openai/codex-action`.                                                                                |
| `github-token`             | `github.token`        | Override token for API calls and publishing.                                                                    |

Environment variable fallbacks:

Inputs are preferred because the nested Codex action can isolate keys from the Codex process. These env names are still accepted for passthrough compatibility and are explicitly cleared before `codex exec` runs.

| Env                        | Provider     | Required                   |
| -------------------------- | ------------ | -------------------------- |
| `OPENAI_API_KEY`           | `openai`     | Yes for direct OpenAI.     |
| `CLOUDFLARE_ACCOUNT_ID`    | `cloudflare` | Yes.                       |
| `CLOUDFLARE_API_KEY`       | `cloudflare` | Yes.                       |
| `CLOUDFLARE_AI_GATEWAY_ID` | `cloudflare` | No, defaults to `default`. |
| `OPENCODE_API_KEY`         | `opencode`   | Yes for OpenCode Zen.      |

## Safety

Only users with the configured repository permission can run Codex. Same-repo PRs can receive commits and branch syncs. Standalone issues create PRs on deterministic branches like `codex/issue-123`; later issue comments update the existing open PR for that branch instead of opening duplicates. Fork PRs are skipped by default.

Codex itself receives no GitHub token and should only edit files. The action harness owns ref fetching, commits, pushes, PR creation, PR updates, reactions, comments, and same-repo branch syncs.

The action blocks changes to workflow files, this action's own metadata, `.env` files, and common private key/certificate extensions before publishing.

## License

Apache-2.0 licensed.
