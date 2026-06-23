# slash-codex

Just `/codex` it.

`slash-codex` packages a comment-triggered Codex workflow as a standalone GitHub
Action. It listens for maintainer slash commands on issues, PR conversations, PR
reviews, and PR file comments, then runs Codex with repository context.

Depending on the trigger, the action can push safe changes back to a same-repo PR
branch or open a new PR from a standalone issue. Fork PRs are skipped by default.

Only OpenAI-compatible Codex Responses models are targeted for now.

## Quick start

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

The action performs its own checkout after it validates the trigger, so a separate
`actions/checkout` step is not required for the basic workflow.

## Commands

Run an implementation task from an issue or PR comment:

```text
/codex fix the failing test
```

Ask for a review from a PR conversation, review, or file comment:

```text
/review focus on correctness and missing tests
```

By default, `/codex` and `/review` are enabled. Override them with the
`commands` input:

```yaml
- uses: elithrar/slash-codex@main
  with:
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    commands: /codex,/review,/docs
```

Command matching is exact after trimming whitespace. The command body becomes the
user prompt passed to Codex.

## Repository instructions

Use `prompt_file` to add repository-specific guidance to every command:

```yaml
- uses: elithrar/slash-codex@main
  with:
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    prompt_file: .github/slash-codex.md
```

`prompt_file` is read from the PR base branch or default branch, not from the
checked-out PR branch. This keeps prompt instructions controlled by maintainers.

## Providers

The default `provider: auto` chooses the first configured provider in this order:

1. OpenAI when `openai-api-key` or `OPENAI_API_KEY` is set.
2. Cloudflare when `cloudflare-api-key`/`CLOUDFLARE_API_KEY` or
   `cloudflare-account-id`/`CLOUDFLARE_ACCOUNT_ID` is set.
3. OpenCode Zen when `opencode-api-key` or `OPENCODE_API_KEY` is set.
4. OpenAI, which then requires an OpenAI API key.

Inputs are preferred over environment variables because the nested Codex action
can isolate credentials from the Codex process environment.

### OpenAI

```yaml
- uses: elithrar/slash-codex@main
  with:
    provider: openai
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    model: gpt-5.5
```

### Cloudflare AI Gateway

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
that sends `cf-aig-gateway-id` to the Cloudflare AI Gateway Responses endpoint.
The Cloudflare API key is passed to the proxy input and is not exposed to the
Codex process environment.

Models without a provider prefix are rewritten as `openai/<model>` for
Cloudflare. Models that already contain `/` or start with `@cf/` are left
unchanged.

### OpenCode Zen

```yaml
- uses: elithrar/slash-codex@main
  with:
    provider: opencode
    opencode-api-key: ${{ secrets.OPENCODE_API_KEY }}
    model: gpt-5.5
```

OpenCode Zen requests use its Responses-compatible endpoint. Only Zen models on
that endpoint are supported.

## Inputs

| Input                      | Default               | Description                                                                                                     |
| -------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------- |
| `provider`                 | `auto`                | Model provider: `auto`, `openai`, `cloudflare`, or `opencode`.                                                  |
| `openai-api-key`           | empty                 | OpenAI API key. Prefer this over env passthrough.                                                               |
| `cloudflare-api-key`       | empty                 | Cloudflare API token. Prefer this over env passthrough.                                                         |
| `cloudflare-account-id`    | empty                 | Cloudflare account ID. Prefer this over env passthrough.                                                        |
| `cloudflare-ai-gateway-id` | `default`             | Cloudflare AI Gateway ID or slug. Prefer this over env passthrough.                                             |
| `opencode-api-key`         | empty                 | OpenCode Zen API key. Prefer this over env passthrough.                                                         |
| `model`                    | `gpt-5.5`             | OpenAI-compatible Codex Responses model.                                                                        |
| `commands`                 | `/codex,/review`      | Comma- or newline-separated slash commands. Commands may be provided with or without the leading `/`.           |
| `prompt_file`              | empty                 | Repository path to extra prompt instructions injected into every command. Read from the PR base/default branch. |
| `required-permission`      | `write`               | Minimum actor permission: `write`, `maintain`, or `admin`.                                                      |
| `allow-forks`              | `false`               | Run on fork PRs in read-only mode. Defaults safe.                                                               |
| `create-pr`                | `true`                | Allow standalone issue comments to create PRs.                                                                  |
| `push-pr-branch`           | `true`                | Allow same-repo PR comments to push commits.                                                                    |
| `commit-message`           | `apply codex changes` | Commit message for published changes.                                                                           |
| `branch-prefix`            | `codex`               | Branch prefix for issue-created PRs.                                                                            |
| `blocked-paths`            | built-in list         | Extra newline- or comma-separated blocked globs.                                                                |
| `codex-version`            | empty                 | Optional Codex CLI version passed to `openai/codex-action`.                                                     |
| `codex-args`               | empty                 | Extra `codex exec` arguments.                                                                                   |
| `effort`                   | empty                 | Optional reasoning effort passed to `openai/codex-action`.                                                      |
| `safety-strategy`          | `drop-sudo`           | Privilege reduction strategy passed to `openai/codex-action`.                                                   |
| `github-token`             | `github.token`        | Override token for API calls, comments, pushes, and PR creation.                                                |

Environment variable fallbacks are still accepted for compatibility and are
cleared before `codex exec` runs:

| Env                        | Provider     | Required                   |
| -------------------------- | ------------ | -------------------------- |
| `OPENAI_API_KEY`           | `openai`     | Yes for direct OpenAI.     |
| `CLOUDFLARE_ACCOUNT_ID`    | `cloudflare` | Yes.                       |
| `CLOUDFLARE_API_KEY`       | `cloudflare` | Yes.                       |
| `CLOUDFLARE_AI_GATEWAY_ID` | `cloudflare` | No, defaults to `default`. |
| `OPENCODE_API_KEY`         | `opencode`   | Yes for OpenCode Zen.      |

## Outputs

| Output          | Description                                                 |
| --------------- | ----------------------------------------------------------- |
| `skipped`       | `true` when the event did not trigger a Codex run.          |
| `final-message` | Final message returned by Codex.                            |
| `changed`       | `true` when Codex changes were published.                   |
| `pr-url`        | Pull request URL created from an issue-triggered run.       |
| `provider`      | Resolved model provider: `openai`, `cloudflare`, or `opencode`. |

## Publishing behavior

| Trigger                                | Default behavior                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| Same-repo PR comment, review, or file comment | Run Codex and push a commit to the PR branch when `push-pr-branch` is `true`. |
| Standalone issue comment               | Run Codex on the default branch and open a PR when `create-pr` is `true`.        |
| Fork PR comment, review, or file comment | Skip by default. Set `allow-forks: true` to run in read-only mode.              |

If Codex produces no file changes, the action posts feedback but does not open a
PR or push a commit.

## Safety

Only users with the configured repository permission can run Codex. Bot comments
are ignored.

Before publishing, the action blocks changes to:

- workflow files under `.github/workflows/**`
- this action's own metadata (`action.yml` or `action.yaml`)
- `.env` files
- common private key and certificate extensions (`.pem`, `.key`, `.p12`, `.pfx`)
- any extra globs supplied through `blocked-paths`

When blocked files are changed, no patch or PR is published and the action posts
feedback listing the blocked paths.

## License

Apache-2.0 licensed.
