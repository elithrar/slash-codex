import * as core from "@actions/core";
import { run } from "./command.js";
import { getOctokit, github, repoContext } from "./github.js";
import { boolOutput, stringOutput } from "./outputs.js";

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

  if (process.env.CAN_MODIFY === "true") {
    const headRef = required("HEAD_REF");
    run("git", ["commit", "-m", commitMessage]);
    run("git", ["push", "origin", `HEAD:${headRef}`]);
    boolOutput("changed", true);
    return;
  }

  if (process.env.CAN_CREATE_PR === "true") {
    const issueNumber = required("TARGET_ISSUE_NUMBER");
    const baseRef = required("BASE_REF");
    const prefix = (process.env.BRANCH_PREFIX || "codex").replace(/[^A-Za-z0-9._/-]/g, "-");
    const branch = `${prefix}/issue-${issueNumber}-${github.context.runId}-${github.context.runAttempt}`;
    const octokit = getOctokit();
    const repo = repoContext();

    run("git", ["switch", "-c", branch]);
    run("git", ["commit", "-m", commitMessage]);
    run("git", ["push", "origin", `HEAD:${branch}`]);

    const { data: pr } = await octokit.rest.pulls.create({
      ...repo,
      base: baseRef,
      head: branch,
      title: `Codex changes for #${issueNumber}`,
      body: `Generated from #${issueNumber}.`,
    });
    boolOutput("changed", true);
    stringOutput("pr_url", pr.html_url);
    return;
  }

  boolOutput("changed", false);
};

await main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
