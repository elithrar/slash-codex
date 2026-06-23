import { describe, expect, it } from "vitest";
import { buildPullRequestBody } from "../src/publish-core.js";

describe("buildPullRequestBody", () => {
  it("uses Codex's final message as the PR body", () => {
    const body = buildPullRequestBody({
      issueNumber: "1",
      request: "do a review of the README and open a PR with improvements",
      finalMessage: `Updated README.md with clearer setup and safety docs.

- Clarified Quick Start triggers so maintainers can invoke Codex predictably.
- Added provider setup notes because the required secrets differ by backend.
- Documented blocked paths so users understand why sensitive changes are not published.

Verification:
- git diff --check passes.

I did not open a PR directly; the runner should package this change.`,
    });

    expect(body).toBe(`Generated from #1.

Updated README.md with clearer setup and safety docs.

- Clarified Quick Start triggers so maintainers can invoke Codex predictably.
- Added provider setup notes because the required secrets differ by backend.
- Documented blocked paths so users understand why sensitive changes are not published.

Verification:
- git diff --check passes.`);
  });

  it("falls back to the request when Codex returns no summary", () => {
    expect(
      buildPullRequestBody({
        issueNumber: "7",
        request: "update the README examples",
        finalMessage: "",
      }),
    ).toBe(`Generated from #7.

Requested: update the README examples`);
  });
});
