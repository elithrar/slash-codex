import { run } from "./command.js";

export const requiredEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

export const authenticatedRemoteUrl = () => {
  const token = requiredEnv("GITHUB_TOKEN");
  const repository = requiredEnv("GITHUB_REPOSITORY");
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const host = serverUrl.replace(/^https?:\/\//, "");
  return `https://x-access-token:${token}@${host}/${repository}.git`;
};

export const configureGitUser = () => {
  run("git", ["config", "user.name", "github-actions[bot]"]);
  run("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
};

export const withAuthenticatedRemote = <T>(operation: () => T): T => {
  const originalUrl = run("git", ["remote", "get-url", "origin"]);
  run("git", ["remote", "set-url", "origin", authenticatedRemoteUrl()]);
  try {
    return operation();
  } finally {
    run("git", ["remote", "set-url", "origin", originalUrl]);
  }
};
