import * as core from "@actions/core";
import { run } from "./command.js";
import { getOctokit, github, repoContext } from "./github.js";
import { boolOutput, stringOutput } from "./outputs.js";
import { buildPullRequestBody } from "./publish-core.js";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const configureGit = () => {
  const token = required("GITHUB_TOKEN");
  const repository = required("GITHUB_REPOSITORY");
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const host = serverUrl.replace(/^https?:\/\//, "");

  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  run("git", [
    "remote",
    "set-url",
    "origin",
    `https://x-access-token:${token}@${host}/${repository}.git`,
  ]);
};

const hasStagedChanges = () => {
  try {
    run("git", ["diff", "--cached", "--quiet", "--exit-code"]);
    return false;
  } catch {
    return true;
  }
};

const main = async () => {
  if (!hasStagedChanges()) {
    boolOutput("changed", false);
    return;
  }

  configureGit();
  const commitMessage = process.env.COMMIT_MESSAGE || "apply codex changes";
  let destinationRef = "";
  let issueNumber = "";
  let baseRef = "";
  let body = "";

  if (process.env.CAN_MODIFY === "true") {
    destinationRef = required("HEAD_REF");
  } else if (process.env.CAN_CREATE_PR === "true") {
    issueNumber = required("TARGET_ISSUE_NUMBER");
    baseRef = required("BASE_REF");
    const prefix = (process.env.BRANCH_PREFIX || "codex").replace(/[^A-Za-z0-9._/-]/g, "-");
    destinationRef = `${prefix}/issue-${issueNumber}-${github.context.runId}-${github.context.runAttempt}`;
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
  run("git", ["push", "origin", `HEAD:${destinationRef}`]);
  boolOutput("changed", true);

  if (issueNumber) {
    const octokit = getOctokit();
    const repo = repoContext();

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
