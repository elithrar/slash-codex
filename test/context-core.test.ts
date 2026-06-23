import { describe, expect, test } from "vitest";
import {
  parseCommand,
  resolveTrigger,
  type ContextOptions,
  type PullRequestInfo,
} from "../src/context-core.js";

const options: ContextOptions = {
  commands: "/codex,/review",
  requiredPermission: "write",
  allowForks: false,
  createPr: true,
  pushPrBranch: true,
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
    expect(result.reviewCommentId).toBe("100");
  });

  test("skips bots, unauthorized users, and forks by default", () => {
    expect(
      resolveTrigger({
        eventName: "issue_comment",
        payload: { ...issueCommentPayload, sender: { login: "bot", type: "Bot" } },
        options,
        actorPermission: "admin",
        pullRequest: null,
        repositoryFullName: "o/r",
      }).canRun,
    ).toBe(false);

    expect(
      resolveTrigger({
        eventName: "issue_comment",
        payload: issueCommentPayload,
        options,
        actorPermission: "read",
        pullRequest: null,
        repositoryFullName: "o/r",
      }).canRun,
    ).toBe(false);

    expect(
      resolveTrigger({
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
      }).canRun,
    ).toBe(false);
  });
});
