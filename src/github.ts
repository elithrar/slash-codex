import * as github from "@actions/github";

export const getToken = () => {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is required");
  }
  return token;
};

export const getOctokit = () => github.getOctokit(getToken());

export const repoContext = () => {
  const { owner, repo } = github.context.repo;
  return { owner, repo };
};

export { github };
