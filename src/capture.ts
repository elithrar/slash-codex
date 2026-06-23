import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import * as core from "@actions/core";
import { blockedPaths } from "./capture-core.js";
import { boolOutput, multilineOutput } from "./outputs.js";

const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" });

const stagedPaths = () => {
  const output = git(["diff", "--cached", "--name-only", "-z"]);
  return output.split("\0").filter(Boolean);
};

const main = () => {
  for (const path of [".slash-codex-prompt.md", ".slash-codex-output.md", "codex.patch"]) {
    rmSync(path, { force: true });
  }

  git(["add", "-A", "."]);
  const paths = stagedPaths();
  const blocked = blockedPaths(paths, process.env.BLOCKED_PATHS || "");

  if (blocked.length > 0) {
    boolOutput("changed", false);
    boolOutput("blocked", true);
    multilineOutput("blocked_paths", blocked);
    for (const path of blocked) {
      core.error(`Codex changed blocked path: ${path}`);
    }
    return;
  }

  boolOutput("blocked", false);
  if (paths.length === 0) {
    boolOutput("changed", false);
    return;
  }

  boolOutput("changed", true);
};

try {
  main();
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
