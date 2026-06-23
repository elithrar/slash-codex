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
  let body = process.env.CODEX_FINAL_MESSAGE || "Codex completed without a final message.";

  if (codexOutcome && codexOutcome !== "success") {
    return `Codex failed before producing a response.

Check the workflow logs for details: ${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`;
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
    return appendStatus(body, `Codex opened a pull request with these changes: ${createdPrUrl}`);
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
  return appendStatus(body, "Codex did not capture file changes, so no PR was opened.");
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
