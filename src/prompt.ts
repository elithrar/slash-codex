import { writeFileSync } from "node:fs";
import * as core from "@actions/core";
import { getOctokit, github, repoContext } from "./github.js";
import { stringOutput } from "./outputs.js";
import { buildPrompt } from "./prompt-core.js";

const main = async () => {
  const octokit = getOctokit();
  const repo = repoContext();
  const payload = github.context.payload;
  const prNumber = process.env.PR_NUMBER || "";
  let title = "";
  let description = "";
  let baseRef = "";
  let baseSha = "";
  let headSha = "";

  if (prNumber) {
    const { data: pr } = await octokit.rest.pulls.get({
      ...repo,
      pull_number: Number(prNumber),
    });
    title = pr.title || "";
    description = pr.body || "";
    baseRef = pr.base.ref;
    baseSha = pr.base.sha;
    headSha = pr.head.sha;
  } else if (payload.issue?.number) {
    const { data: issue } = await octokit.rest.issues.get({
      ...repo,
      issue_number: payload.issue.number,
    });
    title = issue.title || "";
    description = issue.body || "";
  }

  const comment = payload.comment;
  const prompt = buildPrompt({
    owner: repo.owner,
    repo: repo.repo,
    eventName: github.context.eventName,
    command: process.env.COMMAND || "codex",
    canModify: process.env.CAN_MODIFY === "true",
    canCreatePr: process.env.CAN_CREATE_PR === "true",
    userPrompt: process.env.USER_PROMPT || "",
    triggerUrl: process.env.TRIGGER_URL || "",
    title,
    description,
    prNumber,
    baseRef,
    baseSha,
    headSha,
    triggerComment: comment
      ? {
          html_url: comment.html_url || null,
          path: comment.path || null,
          line: comment.line || null,
          side: comment.side || null,
          start_line: comment.start_line || null,
          original_line: comment.original_line || null,
          diff_hunk: comment.diff_hunk || null,
        }
      : null,
  });

  writeFileSync(".slash-codex-prompt.md", prompt);
  stringOutput("prompt_file", ".slash-codex-prompt.md");
  stringOutput("base_ref", baseRef);
};

await main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
