import * as core from "@actions/core";
import { run } from "./command.js";
import { stringOutput } from "./outputs.js";
import { requiredEnv, withAuthenticatedRemote } from "./git-auth.js";

const revParse = (ref: string) => run("git", ["rev-parse", ref]);

const main = () => {
  const prNumber = requiredEnv("PR_NUMBER");
  const baseRef = requiredEnv("PR_BASE_REF");
  const mode = process.env.ACTION_MODE || "read_only";

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
      `+refs/pull/${prNumber}/head:refs/remotes/slash-codex/pr-${prNumber}-head`,
    ]);

    if (mode === "read_only") {
      run("git", [
        "fetch",
        "--no-tags",
        "origin",
        `+refs/pull/${prNumber}/merge:refs/remotes/slash-codex/pr-${prNumber}-merge`,
      ]);
    }
  });

  const baseSha = revParse(`refs/remotes/origin/${baseRef}`);
  const headSha = revParse(`refs/remotes/slash-codex/pr-${prNumber}-head`);
  run("git", ["update-ref", "refs/slash-codex/base", baseSha]);
  run("git", ["update-ref", "refs/slash-codex/head", headSha]);
  stringOutput("base_sha", baseSha);
  stringOutput("head_sha", headSha);
};

try {
  main();
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
