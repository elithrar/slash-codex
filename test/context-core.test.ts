import { describe, expect, test } from "vitest";
import {
  issueBranchName,
  parseCommand,
  resolveTrigger,
  syncStrategyForPrompt,
  type ContextOptions,
  type PullRequestInfo,
} from "../src/context-core.js";

const options: ContextOptions = {
  commands: "/codex,/review",
  requiredPermission: "write",
  allowForks: false,
  createPr: true,
  pushPrBranch: true,
  branchPrefix: "codex",
};

const issueCommentPayload = {
  sender: { login: "matt", type: "User" },
  repository: { default_branch: "main" },
  issue: { number: 12, html_url: "https://github.com/o/r/issues/12" },
  comment: {
    id: 99,
    node_id: "node-comment",
    body: "/codex fix it",
    html_url: "https://github.com/o/r/issues/12#issuecomment-99",
  },
};

const pr: PullRequestInfo = {
  number: 42,
  headRef: "feature",
  headRepo: "o/r",
  baseRef: "main",
  baseSha: "base",
  headSha: "head",
  state: "open",
};

describe("parseCommand", () => {
  test("matches configured slash commands exactly", () => {
    expect(parseCommand("/codex fix the bug", "/codex,/review")).toEqual({
      command: "codex",
      userPrompt: "fix the bug",
    });
    expect(parseCommand("please /codex fix", "/codex,/review")).toBeNull();
    expect(parseCommand("/codexify fix", "/codex,/review")).toBeNull();
  });

  test("supports multi-line prompts", () => {
    expect(parseCommand("/review check this\n\n- auth\n- tests", "/codex,/review")).toEqual({
      command: "review",
      userPrompt: "check this\n\n- auth\n- tests",
    });
  });
});

describe("resolveTrigger", () => {
  test("allows issue comments to create PRs", () => {
    const result = resolveTrigger({
      eventName: "issue_comment",
      payload: issueCommentPayload,
      options,
      actorPermission: "write",
      pullRequest: null,
      repositoryFullName: "o/r",
    });

    expect(result.canRun).toBe(true);
    expect(result.canCreatePr).toBe(true);
    expect(result.mode).toBe("create_pr");
    expect(result.skipped).toBe(false);
    expect(result.skipReason).toBe("");
    expect(result.targetIssueNumber).toBe("12");
  });

  test("allows same-repo file comments to modify the PR branch", () => {
    const result = resolveTrigger({
      eventName: "pull_request_review_comment",
      payload: {
        sender: { login: "matt", type: "User" },
        repository: { default_branch: "main" },
        pull_request: { number: 42 },
        comment: {
          id: 100,
          node_id: "node-file-comment",
          body: "/codex rename this variable",
          path: "src/app.ts",
          line: 10,
          html_url: "https://github.com/o/r/pull/42#discussion_r100",
        },
      },
      options,
      actorPermission: "maintain",
      pullRequest: pr,
      repositoryFullName: "o/r",
    });

    expect(result.canRun).toBe(true);
    expect(result.canModify).toBe(true);
    expect(result.mode).toBe("update_pr");
    expect(result.skipped).toBe(false);
    expect(result.skipReason).toBe("");
    expect(result.reviewCommentId).toBe("100");
  });

  test("skips bots, unauthorized users, and forks by default", () => {
    const botResult = resolveTrigger({
      eventName: "issue_comment",
      payload: { ...issueCommentPayload, sender: { login: "bot", type: "Bot" } },
      options,
      actorPermission: "admin",
      pullRequest: null,
      repositoryFullName: "o/r",
    });
    expect(botResult.canRun).toBe(false);
    expect(botResult.isValid).toBe(true);
    expect(botResult.skipped).toBe(true);
    expect(botResult.skipReason).toBe("bot sender");

    const permissionResult = resolveTrigger({
      eventName: "issue_comment",
      payload: issueCommentPayload,
      options,
      actorPermission: "read",
      pullRequest: null,
      repositoryFullName: "o/r",
    });
    expect(permissionResult.canRun).toBe(false);
    expect(permissionResult.isValid).toBe(true);
    expect(permissionResult.skipped).toBe(true);
    expect(permissionResult.skipReason).toBe("insufficient permission: read");

    const forkResult = resolveTrigger({
      eventName: "pull_request_review_comment",
      payload: {
        sender: { login: "matt", type: "User" },
        repository: { default_branch: "main" },
        pull_request: { number: 42 },
        comment: { body: "/codex ok", id: 1 },
      },
      options,
      actorPermission: "admin",
      pullRequest: { ...pr, headRepo: "fork/r" },
      repositoryFullName: "o/r",
    });
    expect(forkResult.canRun).toBe(false);
    expect(forkResult.isValid).toBe(true);
    expect(forkResult.skipped).toBe(true);
    expect(forkResult.skipReason).toBe("fork pull request");
  });

  test("marks non-command comments invalid", () => {
    const result = resolveTrigger({
      eventName: "issue_comment",
      payload: { ...issueCommentPayload, comment: { body: "please fix it" } },
      options,
      actorPermission: "write",
      pullRequest: null,
      repositoryFullName: "o/r",
    });

    expect(result.isValid).toBe(false);
    expect(result.canRun).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("no slash command");
  });

  test("updates an existing issue-created Codex PR instead of creating another PR", () => {
    const result = resolveTrigger({
      eventName: "issue_comment",
      payload: issueCommentPayload,
      options,
      actorPermission: "write",
      pullRequest: null,
      existingIssuePullRequest: {
        ...pr,
        number: 77,
        headRef: issueBranchName("codex", 12),
      },
      repositoryFullName: "o/r",
    });

    expect(result.canRun).toBe(true);
    expect(result.canModify).toBe(true);
    expect(result.canCreatePr).toBe(false);
    expect(result.mode).toBe("update_codex_pr");
    expect(result.prNumber).toBe("77");
    expect(result.targetIssueNumber).toBe("12");
    expect(result.headRef).toBe("codex/issue-12");
  });

  test("does not create a duplicate issue PR when existing PR updates are disabled", () => {
    const result = resolveTrigger({
      eventName: "issue_comment",
      payload: issueCommentPayload,
      options: { ...options, pushPrBranch: false },
      actorPermission: "write",
      pullRequest: null,
      existingIssuePullRequest: {
        ...pr,
        number: 77,
        headRef: issueBranchName("codex", 12),
      },
      repositoryFullName: "o/r",
    });

    expect(result.mode).toBe("read_only");
    expect(result.canModify).toBe(false);
    expect(result.canCreatePr).toBe(false);
    expect(result.prNumber).toBe("77");
  });

  test("routes same-repo PR sync requests to sync mode", () => {
    const result = resolveTrigger({
      eventName: "issue_comment",
      payload: {
        sender: { login: "matt", type: "User" },
        repository: { default_branch: "main" },
        issue: { number: 42, pull_request: {}, html_url: "https://github.com/o/r/pull/42" },
        comment: { body: "/codex rebase this branch against main", id: 1 },
      },
      options,
      actorPermission: "write",
      pullRequest: pr,
      repositoryFullName: "o/r",
    });

    expect(result.canModify).toBe(true);
    expect(result.mode).toBe("sync_pr");

    const customCommandResult = resolveTrigger({
      eventName: "issue_comment",
      payload: {
        sender: { login: "matt", type: "User" },
        repository: { default_branch: "main" },
        issue: { number: 42, pull_request: {}, html_url: "https://github.com/o/r/pull/42" },
        comment: { body: "/ai rebase this branch against main", id: 1 },
      },
      options: { ...options, commands: "/ai,/review" },
      actorPermission: "write",
      pullRequest: pr,
      repositoryFullName: "o/r",
    });
    expect(customCommandResult.mode).toBe("sync_pr");
  });

  test("does not route review comments or closed PRs to sync/write modes", () => {
    const reviewResult = resolveTrigger({
      eventName: "issue_comment",
      payload: {
        sender: { login: "matt", type: "User" },
        repository: { default_branch: "main" },
        issue: { number: 42, pull_request: {}, html_url: "https://github.com/o/r/pull/42" },
        comment: { body: "/review does the rebase implementation handle conflicts?", id: 1 },
      },
      options,
      actorPermission: "write",
      pullRequest: pr,
      repositoryFullName: "o/r",
    });
    expect(reviewResult.mode).toBe("update_pr");

    const closedResult = resolveTrigger({
      eventName: "issue_comment",
      payload: {
        sender: { login: "matt", type: "User" },
        repository: { default_branch: "main" },
        issue: { number: 42, pull_request: {}, html_url: "https://github.com/o/r/pull/42" },
        comment: { body: "/codex rebase this branch against main", id: 1 },
      },
      options,
      actorPermission: "write",
      pullRequest: { ...pr, state: "closed" },
      repositoryFullName: "o/r",
    });
    expect(closedResult.mode).toBe("read_only");
    expect(closedResult.canModify).toBe(false);
  });
});

describe("issueBranchName", () => {
  test("uses stable sanitized branch names", () => {
    expect(issueBranchName("codex bot", 123)).toBe("codex-bot/issue-123");
    expect(issueBranchName("///", 123)).toBe("codex/issue-123");
  });
});

describe("syncStrategyForPrompt", () => {
  test("detects rebase requests before merge-style sync requests", () => {
    expect(syncStrategyForPrompt("rebase this branch against main")).toBe("rebase");
    expect(syncStrategyForPrompt("please rebase against main")).toBe("rebase");
    expect(syncStrategyForPrompt("merge main into this branch")).toBe("merge");
    expect(syncStrategyForPrompt("update this branch with main")).toBe("merge");
    expect(syncStrategyForPrompt("rebase detection should ignore review comments")).toBe("");
    expect(syncStrategyForPrompt("update the branch naming docs")).toBe("");
    expect(syncStrategyForPrompt("do not rebase; fix the failing test")).toBe("");
    expect(syncStrategyForPrompt("update the README examples")).toBe("");
  });
});
