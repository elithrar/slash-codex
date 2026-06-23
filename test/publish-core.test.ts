import { describe, expect, it } from "vitest";
import { buildPullRequestBody } from "../src/publish-core.js";

describe("buildPullRequestBody", () => {
  it("summarizes major changes and why from Codex output", () => {
    const body = buildPullRequestBody({
      issueNumber: "1",
      request: "do a review of the README and open a PR with improvements",
      finalMessage: `Updated README.md with:

- Clearer Quick Start setup and trigger examples.
- Notes on internal checkout behavior, issue-created PRs, and PR branch pushes.
- A dedicated repository instructions section.
- Provider auto-selection behavior.
- Outputs documentation.
- Expanded safety notes and a blocked-paths example.

Verification:
- git diff --check passes.
- npm run format could not run because oxfmt was missing.

I did not open a PR directly.`,
    });

    expect(body).toBe(`Generated from #1.

Why:
- Requested: do a review of the README and open a PR with improvements

Major changes:
- Clearer Quick Start setup and trigger examples.
- Notes on internal checkout behavior, issue-created PRs, and PR branch pushes.
- A dedicated repository instructions section.
- Provider auto-selection behavior.
- Outputs documentation.
- Expanded safety notes and a blocked-paths example.

Verification:
- git diff --check passes.
- npm run format could not run because oxfmt was missing.`);
  });

  it("falls back to the first useful sentence when no change bullets are present", () => {
    expect(
      buildPullRequestBody({
        issueNumber: "7",
        request: "",
        finalMessage:
          "Updated README.md with clearer provider docs.\n\nVerification:\n- Tests passed.",
      }),
    ).toBe(`Generated from #7.

Why:
- Addresses the Codex request from #7.

Major changes:
- Updated README.md with clearer provider docs.

Verification:
- Tests passed.`);
  });
});
