import { rmSync } from "node:fs";
import * as core from "@actions/core";
import { run } from "./command.js";
import { configureGitUser, requiredEnv, withAuthenticatedRemote } from "./git-auth.js";
import { getOctokit, github, repoContext } from "./github.js";
import { boolOutput, stringOutput } from "./outputs.js";
import { issueBranchName } from "./context-core.js";
import { buildPullRequestBody } from "./publish-core.js";

const hasStagedChanges = () => {
  try {
    run("git", ["diff", "--cached", "--quiet", "--exit-code"]);
    return false;
  } catch {
    return true;
  }
};

const hasMergeInProgress = () => {
  try {
    run("git", ["rev-parse", "--verify", "MERGE_HEAD"]);
    return true;
  } catch {
    return false;
  }
};

const assertHeadContains = (expectedHeadSha: string) => {
  if (!expectedHeadSha) {
    return;
  }
  run("git", ["merge-base", "--is-ancestor", expectedHeadSha, "HEAD"]);
};

const validateBranchName = (branch: string) => {
  try {
    run("git", ["check-ref-format", "--branch", branch]);
  } catch {
    throw new Error(`Invalid branch name: ${branch}`);
  }
};

const remoteBranchExists = (branch: string) => {
  const output = withAuthenticatedRemote(() =>
    run("git", ["ls-remote", "--heads", "origin", `refs/heads/${branch}`]),
  );
  return output.split(/\r?\n/).some((line) => line.endsWith(`\trefs/heads/${branch}`));
};

const pushHead = (branch: string, expectedHeadSha = "") => {
  withAuthenticatedRemote(() => {
    const lease = expectedHeadSha
      ? [`--force-with-lease=refs/heads/${branch}:${expectedHeadSha}`]
      : [];
    run("git", ["push", "origin", `HEAD:${branch}`, ...lease]);
  });
};

const remoteHeadSha = (branch: string) => {
  withAuthenticatedRemote(() => {
    run("git", [
      "fetch",
      "--no-tags",
      "origin",
      `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
    ]);
  });
  return run("git", ["rev-parse", `refs/remotes/origin/${branch}`]);
};

const remoteAlreadyHasHead = (branch: string) => {
  try {
    return remoteHeadSha(branch) === run("git", ["rev-parse", "HEAD"]);
  } catch {
    return false;
  }
};

const recoverStagedChangesOntoHead = (headRef: string, expectedHeadSha: string) => {
  const patchPath = ".slash-codex-staged.patch";
  run("git", ["diff", "--cached", "--binary", `--output=${patchPath}`]);
  try {
    run("git", ["reset", "--hard"]);
    withAuthenticatedRemote(() => {
      run("git", [
        "fetch",
        "--no-tags",
        "origin",
        `+refs/heads/${headRef}:refs/remotes/origin/${headRef}`,
      ]);
    });
    run("git", ["switch", "-C", headRef, `refs/remotes/origin/${headRef}`]);
    const actualHeadSha = run("git", ["rev-parse", "HEAD"]);
    if (actualHeadSha !== expectedHeadSha) {
      throw new Error(`PR branch ${headRef} moved while recovering Codex changes`);
    }
    run("git", ["apply", "--index", patchPath]);
  } finally {
    rmSync(patchPath, { force: true });
  }
};

const recoverCommittedChangesOntoHead = (headRef: string, commitMessage: string) => {
  const parentLine = run("git", ["rev-list", "--parents", "-n", "1", "HEAD"]);
  if (parentLine.trim().split(/\s+/).length > 2) {
    throw new Error(
      "PR branch changed after creating a merge commit; rerun Codex to resolve conflicts on the latest head",
    );
  }
  const patchPath = ".slash-codex-commit.patch";
  run("git", ["diff", "--binary", "HEAD~1", "HEAD", `--output=${patchPath}`]);
  try {
    withAuthenticatedRemote(() => {
      run("git", [
        "fetch",
        "--no-tags",
        "origin",
        `+refs/heads/${headRef}:refs/remotes/origin/${headRef}`,
      ]);
    });
    run("git", ["switch", "-C", headRef, `refs/remotes/origin/${headRef}`]);
    const expectedHeadSha = run("git", ["rev-parse", "HEAD"]);
    run("git", ["apply", "--index", patchPath]);
    run("git", ["commit", "-m", commitMessage]);
    return expectedHeadSha;
  } finally {
    rmSync(patchPath, { force: true });
  }
};

const validateWritablePr = async ({
  prNumber,
  headRef,
  expectedHeadSha,
  expectedBaseRef,
  expectedBaseSha,
}: {
  prNumber: string;
  headRef: string;
  expectedHeadSha: string;
  expectedBaseRef?: string;
  expectedBaseSha?: string;
}) => {
  const octokit = getOctokit();
  const repo = repoContext();
  const { data: pr } = await octokit.rest.pulls.get({
    ...repo,
    pull_number: Number(prNumber),
  });
  const defaultBranch = github.context.payload.repository?.default_branch || "";

  if (pr.state !== "open") {
    throw new Error(`PR #${prNumber} is not open`);
  }
  if (pr.head.repo?.full_name !== `${repo.owner}/${repo.repo}`) {
    throw new Error(`PR #${prNumber} is not a same-repository PR`);
  }
  if (pr.head.ref !== headRef) {
    throw new Error(`PR #${prNumber} head changed from ${headRef} to ${pr.head.ref}`);
  }
  if (defaultBranch && pr.head.ref === defaultBranch) {
    throw new Error(`Refusing to push to the default branch: ${defaultBranch}`);
  }
  if (expectedHeadSha && pr.head.sha !== expectedHeadSha) {
    core.info(`PR #${prNumber} head changed during the run; will reapply Codex changes`);
  }
  if (expectedBaseRef && pr.base.ref !== expectedBaseRef) {
    throw new Error(`PR #${prNumber} base changed from ${expectedBaseRef} to ${pr.base.ref}`);
  }
  if (expectedBaseSha && pr.base.sha !== expectedBaseSha) {
    throw new Error(`PR #${prNumber} base ${pr.base.ref} moved during the run`);
  }

  return pr;
};

const validateSyncConflictPr = async (headRef: string, expectedHeadSha: string) => {
  const prNumber = requiredEnv("PR_NUMBER");
  const pr = await validateWritablePr({
    prNumber,
    headRef,
    expectedHeadSha,
    expectedBaseRef: requiredEnv("BASE_REF"),
    expectedBaseSha: requiredEnv("BASE_SHA"),
  });
  if (pr.head.sha !== expectedHeadSha) {
    throw new Error(
      `PR #${prNumber} head changed while resolving sync conflicts; rerun Codex on the latest head`,
    );
  }
  return pr;
};

const validateUpdatePrTarget = async (headRef: string, expectedHeadSha: string) => {
  return validateWritablePr({
    prNumber: requiredEnv("PR_NUMBER"),
    headRef,
    expectedHeadSha,
    expectedBaseRef: requiredEnv("BASE_REF"),
  });
};

const findIssuePullRequest = async (stableIssueRef: string, state: "open" | "closed") => {
  const octokit = getOctokit();
  const repo = repoContext();
  const escapedBranch = stableIssueRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fallbackPattern = new RegExp(`^${escapedBranch}-\\d+-\\d+$`);
  const prs = await octokit.paginate(octokit.rest.pulls.list, {
    ...repo,
    state,
    per_page: 100,
  });
  return prs.find(
    (pr) =>
      pr.head.repo?.full_name === `${repo.owner}/${repo.repo}` &&
      (pr.head.ref === stableIssueRef || fallbackPattern.test(pr.head.ref)),
  );
};

const fallbackIssueBranch = (stableIssueRef: string) =>
  `${stableIssueRef}-${github.context.runId}-${github.context.runAttempt}`;

const main = async () => {
  if (!hasStagedChanges() && !hasMergeInProgress()) {
    boolOutput("changed", false);
    return;
  }

  configureGitUser();
  const commitMessage = process.env.COMMIT_MESSAGE || "apply codex changes";
  const mode = process.env.ACTION_MODE || "read_only";
  const syncConflicted = process.env.SYNC_CONFLICTED === "true";
  let destinationRef = "";
  let issueNumber = "";
  let baseRef = "";
  let body = "";
  let updatedPrNumber = "";
  let updatedPrUrl = "";
  let expectedHeadSha = "";
  let stableIssueRef = "";

  if (mode === "update_pr" || mode === "update_codex_pr") {
    const pr = await validateWritablePr({
      prNumber: requiredEnv("PR_NUMBER"),
      headRef: requiredEnv("HEAD_REF"),
      expectedHeadSha: process.env.HEAD_SHA || "",
      ...(syncConflicted ? { expectedBaseRef: requiredEnv("BASE_REF") } : {}),
    });
    destinationRef = pr.head.ref;
    expectedHeadSha = pr.head.sha;
    if (process.env.HEAD_SHA && pr.head.sha !== process.env.HEAD_SHA) {
      if (syncConflicted || hasMergeInProgress()) {
        throw new Error(
          "PR branch changed while resolving sync conflicts; rerun Codex on the latest head",
        );
      }
      recoverStagedChangesOntoHead(pr.head.ref, pr.head.sha);
    }
    if (mode === "update_codex_pr" || syncConflicted) {
      updatedPrNumber = String(pr.number);
      updatedPrUrl = pr.html_url;
    }
  } else if (mode === "create_pr") {
    issueNumber = requiredEnv("TARGET_ISSUE_NUMBER");
    baseRef = requiredEnv("BASE_REF");
    stableIssueRef = issueBranchName(process.env.BRANCH_PREFIX || "codex", issueNumber);
    destinationRef = stableIssueRef;
    validateBranchName(stableIssueRef);
    if (remoteBranchExists(stableIssueRef)) {
      const existing = await findIssuePullRequest(stableIssueRef, "open");
      if (existing) {
        throw new Error(
          `Issue #${issueNumber} already has open Codex PR #${existing.number}: ${existing.html_url}`,
        );
      }
      const closed = await findIssuePullRequest(stableIssueRef, "closed");
      if (!closed) {
        throw new Error(`Issue branch ${stableIssueRef} already exists; rerun Codex to update it`);
      }
      destinationRef = fallbackIssueBranch(stableIssueRef);
      validateBranchName(destinationRef);
    }
    body = buildPullRequestBody({
      issueNumber,
      request: process.env.USER_PROMPT || "",
      finalMessage: process.env.CODEX_FINAL_MESSAGE || "",
    });

    run("git", ["switch", "-c", destinationRef]);
  } else {
    boolOutput("changed", false);
    return;
  }

  run("git", ["commit", "-m", commitMessage]);
  assertHeadContains(expectedHeadSha);
  if (mode === "update_pr" || mode === "update_codex_pr") {
    if (syncConflicted) {
      await validateSyncConflictPr(destinationRef, expectedHeadSha);
    } else {
      await validateUpdatePrTarget(destinationRef, expectedHeadSha);
    }
  }
  try {
    pushHead(destinationRef, expectedHeadSha);
  } catch (error) {
    if (mode === "update_pr" || mode === "update_codex_pr") {
      if (syncConflicted) {
        await validateSyncConflictPr(destinationRef, expectedHeadSha);
      } else {
        await validateUpdatePrTarget(destinationRef, expectedHeadSha);
      }
    }
    if (remoteAlreadyHasHead(destinationRef)) {
      core.info(`Remote ${destinationRef} already contains the pushed commit`);
    } else if ((mode === "update_pr" || mode === "update_codex_pr") && expectedHeadSha) {
      const recoveredHeadSha = recoverCommittedChangesOntoHead(destinationRef, commitMessage);
      pushHead(destinationRef, recoveredHeadSha);
    } else if (
      mode === "create_pr" &&
      destinationRef === stableIssueRef &&
      remoteBranchExists(stableIssueRef)
    ) {
      const existing = await findIssuePullRequest(stableIssueRef, "open");
      if (existing) {
        throw new Error(
          `Issue #${issueNumber} already has open Codex PR #${existing.number}: ${existing.html_url}`,
        );
      }
      throw new Error(`Issue branch ${stableIssueRef} was created during this run; rerun Codex`);
    } else {
      throw error;
    }
  }
  boolOutput("changed", true);

  if (updatedPrNumber) {
    stringOutput("pr_url", updatedPrUrl);
  } else if (issueNumber) {
    const octokit = getOctokit();
    const repo = repoContext();
    const existing = await findIssuePullRequest(stableIssueRef, "open");
    if (existing) {
      throw new Error(
        `Issue #${issueNumber} already has open Codex PR #${existing.number}: ${existing.html_url}`,
      );
    }

    const { data: pr } = await octokit.rest.pulls.create({
      ...repo,
      base: baseRef,
      head: destinationRef,
      title: `Codex changes for #${issueNumber}`,
      body,
    });
    stringOutput("pr_url", pr.html_url);
  }
};

await main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
