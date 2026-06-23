import { describe, expect, test } from "vitest";
import { blockedPaths } from "../src/capture-core.js";

describe("blockedPaths", () => {
  test("blocks workflow, env, key, and action metadata changes", () => {
    expect(
      blockedPaths([
        ".github/workflows/ci.yml",
        "action.yml",
        ".env.local",
        "private.pem",
        "secrets/private.pem",
        "src/app.ts",
      ]),
    ).toEqual([
      ".github/workflows/ci.yml",
      "action.yml",
      ".env.local",
      "private.pem",
      "secrets/private.pem",
    ]);
  });

  test("supports caller-provided blocked globs", () => {
    expect(blockedPaths(["src/app.ts", "docs/usage.md"], "docs/**")).toEqual(["docs/usage.md"]);
  });
});
