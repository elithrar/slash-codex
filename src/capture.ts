import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import * as core from "@actions/core";
import { blockedPaths } from "./capture-core.js";
import { boolOutput, multilineOutput } from "./outputs.js";

const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" });

const stagedPaths = () => {
  const output = git(["diff", "--cached", "--name-only", "-z"]);
  return output.split("\0").filter(Boolean);
};

const unmergedPaths = () => {
  const output = git(["diff", "--name-only", "--diff-filter=U", "-z"]);
  return output.split("\0").filter(Boolean);
};

const expectedConflictPaths = () => {
  return (process.env.CONFLICTED_PATHS || "")
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
};

const mergeStagedEntries = () => {
  return (process.env.MERGE_STAGED_ENTRIES || "")
    .split(/\r?\n/)
    .map((entry) => entry.replace(/\r$/, ""))
    .filter(Boolean);
};

const normalizeLsFilesOutput = (value: string) => value.replace(/\r?\n$/, "");

const pathFromStagedEntry = (entry: string) => {
  if (entry.startsWith("D\t")) {
    return entry.slice(2);
  }
  return entry.replace(/^\d+\s+[0-9a-f]+\s+\d+\t/, "");
};

const mergeStagedEntryMap = () => {
  return new Map(mergeStagedEntries().map((entry) => [pathFromStagedEntry(entry), entry]));
};

const hasConflictMarkers = (content: string, wasUnmerged: boolean) => {
  if (/^<{7}|^>{7}/m.test(content)) {
    return true;
  }
  if (!wasUnmerged) {
    return false;
  }
  const lines = content.split(/\r?\n/);
  return lines.some((line, index) => {
    if (/^\|{7}(?:\s.*)?$/.test(line)) {
      return true;
    }
    if (!/^={7}(?:\s.*)?$/.test(line)) {
      return false;
    }
    const before = lines.slice(0, index).some((candidate) => candidate.trim() !== "");
    const after = lines.slice(index + 1).some((candidate) => candidate.trim() !== "");
    return before && after;
  });
};

const pathsWithConflictMarkers = (paths: string[], initiallyUnmerged: string[]) => {
  const unmerged = new Set(initiallyUnmerged);
  return paths.filter((path) => {
    if (!unmerged.has(path)) {
      return false;
    }
    try {
      const content = readFileSync(path, "utf8");
      return hasConflictMarkers(content, true);
    } catch {
      return false;
    }
  });
};

const hasMergeInProgress = () => {
  try {
    git(["rev-parse", "--verify", "MERGE_HEAD"]);
    return true;
  } catch {
    return false;
  }
};

const isStagedDeletion = (path: string) => {
  try {
    git(["diff", "--cached", "--quiet", "--diff-filter=D", "--", path]);
    return false;
  } catch {
    return true;
  }
};

const stagedEntry = (path: string) => {
  try {
    const entry = normalizeLsFilesOutput(git(["ls-files", "-s", "--", path]));
    return entry || (isStagedDeletion(path) ? `D\t${path}` : "");
  } catch {
    return "";
  }
};

const main = () => {
  for (const path of [".slash-codex-prompt.md", ".slash-codex-output.md", "codex.patch"]) {
    rmSync(path, { force: true });
  }

  const initiallyUnmerged = [...new Set([...expectedConflictPaths(), ...unmergedPaths()])];

  git(["add", "-A", "."]);
  if (initiallyUnmerged.length > 0 && !hasMergeInProgress()) {
    throw new Error("Codex aborted the sync merge instead of resolving conflicts");
  }
  const unmerged = unmergedPaths();
  if (unmerged.length > 0) {
    throw new Error(`Codex left unresolved merge conflicts: ${unmerged.join(", ")}`);
  }

  const paths = [...new Set([...stagedPaths(), ...initiallyUnmerged])];
  const initiallyUnmergedSet = new Set(initiallyUnmerged);
  const mergeStagedEntriesByPath = mergeStagedEntryMap();
  const blockedCheckPaths = paths.filter((path) => {
    if (initiallyUnmergedSet.has(path)) {
      return true;
    }
    const mergeStagedEntry = mergeStagedEntriesByPath.get(path);
    if (mergeStagedEntry !== undefined) {
      return mergeStagedEntry !== stagedEntry(path);
    }
    return true;
  });
  const blocked = blockedPaths(blockedCheckPaths, process.env.BLOCKED_PATHS || "");

  if (blocked.length > 0) {
    boolOutput("changed", false);
    boolOutput("blocked", true);
    multilineOutput("blocked_paths", blocked);
    for (const path of blocked) {
      core.error(`Codex changed blocked path: ${path}`);
    }
    return;
  }

  const conflictMarkerPaths = pathsWithConflictMarkers(paths, initiallyUnmerged);
  if (conflictMarkerPaths.length > 0) {
    throw new Error(`Codex left conflict markers in: ${conflictMarkerPaths.join(", ")}`);
  }

  boolOutput("blocked", false);
  if (paths.length === 0 && !hasMergeInProgress()) {
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
