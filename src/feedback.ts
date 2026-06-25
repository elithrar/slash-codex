import * as core from "@actions/core";
import { getOctokit, github, repoContext } from "./github.js";

const appendStatus = (body: string, message: string) => `${body}\n\n---\n${message}`;

const feedbackBody = () => {
  const codexOutcome = process.env.CODEX_OUTCOME;
  const patchChanged = process.env.PATCH_CHANGED === "true";
  const patchBlocked = process.env.PATCH_BLOCKED === "true";
  const publishChanged = process.env.PUBLISH_CHANGED === "true";
  const publishOutcome = process.env.PUBLISH_OUTCOME;
  const createdPrUrl = process.env.CREATED_PR_URL || "";
  const actionMode = process.env.ACTION_MODE || "read_only";
  const workflowFailed = process.env.WORKFLOW_FAILED === "true";
  const prepareRefsOutcome = process.env.PREPARE_REFS_OUTCOME;
  const providerOutcome = process.env.PROVIDER_OUTCOME;
  const syncProviderOutcome = process.env.SYNC_PROVIDER_OUTCOME;
  const promptOutcome = process.env.PROMPT_OUTCOME;
  const syncPromptOutcome = process.env.SYNC_PROMPT_OUTCOME;
  const patchOutcome = process.env.PATCH_OUTCOME;
  const syncOutcome = process.env.SYNC_OUTCOME;
  const syncChanged = process.env.SYNC_CHANGED === "true";
  const syncConflicted = process.env.SYNC_CONFLICTED === "true";
  const syncStrategy = process.env.SYNC_STRATEGY || "sync";
  let body = process.env.CODEX_FINAL_MESSAGE || "Codex completed without a final message.";

  if (actionMode === "sync_pr") {
    if (prepareRefsOutcome === "failure") {
      return `Codex could not prepare this PR branch for syncing.

Check the workflow logs for details: ${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
    }
    if (syncOutcome && syncOutcome !== "success") {
      return `Codex could not ${syncStrategy} this PR branch.

Check the workflow logs for details: ${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
    }
    if (syncProviderOutcome === "failure" || syncPromptOutcome === "failure") {
      return `Codex failed during sync conflict setup.

Check the workflow logs for details: ${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
    }
    if (syncConflicted && codexOutcome && codexOutcome !== "success") {
      return `Codex could not resolve the sync conflicts.

Check the workflow logs for details: ${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
    }
    if (syncConflicted && publishChanged) {
      return appendStatus(
        body,
        "Codex resolved the sync conflicts and pushed changes to this PR branch.",
      );
    }
    if (syncConflicted && patchChanged && publishOutcome === "failure") {
      return appendStatus(
        body,
        "Codex resolved sync conflicts, but the workflow could not publish them. Check the workflow logs.",
      );
    }
    if (syncConflicted && patchOutcome === "failure") {
      return appendStatus(
        body,
        "Codex responded, but the workflow could not capture the conflict-resolution changes. Check the workflow logs.",
      );
    }
    if (syncConflicted && patchBlocked) {
      return appendStatus(
        body,
        `Codex changed blocked paths while resolving sync conflicts, so no changes were published.

Blocked paths:
${process.env.PATCH_BLOCKED_PATHS || ""}`,
      );
    }
    return syncChanged
      ? `Codex ${syncStrategy === "rebase" ? "rebased" : "merged the base branch into"} this PR branch.`
      : `This PR branch was already up to date; no ${syncStrategy} changes were needed.`;
  }
  if (prepareRefsOutcome === "failure") {
    return `Codex could not prepare the pull request refs.

Check the workflow logs for details: ${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
  }
  if (providerOutcome === "failure" || promptOutcome === "failure") {
    return `Codex failed during workflow setup.

Check the workflow logs for details: ${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
  }
  if (workflowFailed && (!codexOutcome || codexOutcome === "skipped")) {
    return `Codex failed before producing a response.

Check the workflow logs for details: ${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
  }
  if (codexOutcome && codexOutcome !== "success") {
    return `Codex failed before producing a response.

Check the workflow logs for details: ${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
  }
  if (patchOutcome === "failure") {
    return appendStatus(
      body,
      "Codex generated a response, but the workflow could not capture file changes. Check the workflow logs.",
    );
  }
  if (patchBlocked) {
    return appendStatus(
      body,
      `Codex changed blocked paths, so no patch or PR was published.

Blocked paths:
${process.env.PATCH_BLOCKED_PATHS || ""}

A maintainer should review these changes manually before applying them.`,
    );
  }
  if (patchChanged && publishOutcome === "failure") {
    return appendStatus(
      body,
      "Codex generated changes, but the workflow could not publish them. Check the workflow logs.",
    );
  }
  if (createdPrUrl) {
    return appendStatus(
      body,
      actionMode === "update_codex_pr"
        ? `Codex updated the existing pull request with these changes: ${createdPrUrl}`
        : `Codex opened a pull request with these changes: ${createdPrUrl}`,
    );
  }
  if (publishChanged) {
    return appendStatus(body, "Codex pushed changes to this PR branch.");
  }
  if (patchChanged) {
    return appendStatus(
      body,
      "Codex generated changes, but no pushed branch or PR URL was reported. Check the workflow logs.",
    );
  }
  const noChangeStatus =
    actionMode === "update_pr"
      ? "Codex did not capture file changes, so no commit was pushed."
      : actionMode === "update_codex_pr"
        ? "Codex did not capture file changes for the existing pull request."
        : actionMode === "create_pr"
          ? "Codex did not capture file changes, so no PR was opened."
          : "Codex ran in read-only mode, so no changes were published.";
  return appendStatus(body, noChangeStatus);
};

const main = async () => {
  const issueNumber = Number(process.env.TARGET_ISSUE_NUMBER);
  if (!issueNumber) {
    core.warning("TARGET_ISSUE_NUMBER is missing; cannot post feedback");
    return;
  }

  const octokit = getOctokit();
  const repo = repoContext();
  const body = feedbackBody();
  const reviewCommentId = process.env.REVIEW_COMMENT_ID;

  if (reviewCommentId) {
    await octokit.rest.pulls.createReplyForReviewComment({
      ...repo,
      pull_number: issueNumber,
      comment_id: Number(reviewCommentId),
      body,
    });
    return;
  }

  await octokit.rest.issues.createComment({
    ...repo,
    issue_number: issueNumber,
    body,
  });
};

await main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
