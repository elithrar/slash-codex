import { execFileSync } from "node:child_process";
import * as core from "@actions/core";
import { run } from "./command.js";
import { configureGitUser, requiredEnv, withAuthenticatedRemote } from "./git-auth.js";
import { getOctokit, github, repoContext } from "./github.js";
import { boolOutput, multilineOutput, stringOutput } from "./outputs.js";
import { syncStrategyForPrompt } from "./context-core.js";

const revParse = (ref: string) => run("git", ["rev-parse", ref]);

const runRaw = (command: string, args: string[]) => {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
};

const normalizeFinalNewline = (value: string) => value.replace(/\r?\n$/, "");

const isStagedDeletion = (path: string) => {
  try {
    run("git", ["diff", "--cached", "--quiet", "--diff-filter=D", "--", path]);
    return false;
  } catch {
    return true;
  }
};

const unmergedPaths = () => {
  const output = run("git", ["diff", "--name-only", "--diff-filter=U", "-z"]);
  return output.split("\0").filter(Boolean);
};

const stagedPaths = () => {
  const output = run("git", ["diff", "--cached", "--name-only", "-z"]);
  return output.split("\0").filter(Boolean);
};

const stagedEntries = (paths: string[]) => {
  return paths
    .map((path) => {
      const entry = normalizeFinalNewline(runRaw("git", ["ls-files", "-s", "--", path]));
      return entry || (isStagedDeletion(path) ? `D\t${path}` : "");
    })
    .filter(Boolean);
};

const hasMergeInProgress = () => {
  try {
    run("git", ["rev-parse", "--verify", "MERGE_HEAD"]);
    return true;
  } catch {
    return false;
  }
};

const validatePr = async (expectedBaseSha = "") => {
  const octokit = getOctokit();
  const repo = repoContext();
  const prNumber = Number(requiredEnv("PR_NUMBER"));
  const expectedHeadRef = requiredEnv("HEAD_REF");
  const expectedHeadSha = requiredEnv("HEAD_SHA");
  const expectedBaseRef = requiredEnv("BASE_REF");
  const defaultBranch = github.context.payload.repository?.default_branch || "";
  const { data: pr } = await octokit.rest.pulls.get({
    ...repo,
    pull_number: prNumber,
  });

  if (pr.state !== "open") {
    throw new Error(`PR #${prNumber} is not open`);
  }
  if (pr.head.repo?.full_name !== `${repo.owner}/${repo.repo}`) {
    throw new Error(`PR #${prNumber} is not a same-repository PR`);
  }
  if (pr.head.ref !== expectedHeadRef) {
    throw new Error(`PR #${prNumber} head changed from ${expectedHeadRef} to ${pr.head.ref}`);
  }
  if (defaultBranch && pr.head.ref === defaultBranch) {
    throw new Error(`Refusing to sync the default branch: ${defaultBranch}`);
  }
  if (pr.head.sha !== expectedHeadSha) {
    throw new Error(`PR #${prNumber} head changed during the run`);
  }
  if (pr.base.ref !== expectedBaseRef) {
    throw new Error(`PR #${prNumber} base changed from ${expectedBaseRef} to ${pr.base.ref}`);
  }
  if (expectedBaseSha && pr.base.sha !== expectedBaseSha) {
    throw new Error(`PR #${prNumber} base ${expectedBaseRef} moved during the run`);
  }

  return pr;
};

const abortInProgressOperation = (strategy: "merge" | "rebase") => {
  try {
    run("git", [strategy, "--abort"]);
  } catch {
    // No operation was in progress, or Git already cleaned it up.
  }
};

const main = async () => {
  const pr = await validatePr();
  const headRef = requiredEnv("HEAD_REF");
  const baseRef = requiredEnv("BASE_REF");
  const expectedHeadSha = requiredEnv("HEAD_SHA");
  const strategy = syncStrategyForPrompt(process.env.USER_PROMPT || "") || "merge";
  stringOutput("strategy", strategy);
  boolOutput("conflicted", false);

  configureGitUser();
  withAuthenticatedRemote(() => {
    run("git", [
      "fetch",
      "--no-tags",
      "origin",
      `+refs/heads/${baseRef}:refs/remotes/origin/${baseRef}`,
    ]);
    run("git", [
      "fetch",
      "--no-tags",
      "origin",
      `+refs/heads/${headRef}:refs/remotes/origin/${headRef}`,
    ]);
  });
  const fetchedBaseSha = revParse(`refs/remotes/origin/${baseRef}`);
  stringOutput("base_sha", fetchedBaseSha);

  const before = revParse("HEAD");
  try {
    if (strategy === "rebase") {
      run("git", ["rebase", `refs/remotes/origin/${baseRef}`]);
    } else {
      run("git", ["merge", "--no-edit", `refs/remotes/origin/${baseRef}`]);
    }
  } catch (error) {
    if (strategy === "rebase") {
      abortInProgressOperation("rebase");
      throw error;
    }
    const conflictedPaths = unmergedPaths();
    if (!hasMergeInProgress() || conflictedPaths.length === 0) {
      throw error;
    }
    boolOutput("conflicted", true);
    multilineOutput("conflicted_paths", conflictedPaths);
    multilineOutput("merge_staged_entries", stagedEntries(stagedPaths()));
    boolOutput("changed", false);
    return;
  }

  const after = revParse("HEAD");
  await validatePr(fetchedBaseSha);
  if (after === before) {
    boolOutput("changed", false);
    return;
  }

  withAuthenticatedRemote(() => {
    const lease = `--force-with-lease=refs/heads/${headRef}:${expectedHeadSha}`;
    run("git", ["push", "origin", `HEAD:${headRef}`, lease]);
  });
  boolOutput("changed", true);
  stringOutput("pr_url", pr.html_url);
};

await main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
