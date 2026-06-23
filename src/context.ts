import * as core from "@actions/core";
import {
  bodyForEvent,
  resolveTrigger,
  type ContextOptions,
  type Permission,
  type PullRequestInfo,
  type SlashPayload,
} from "./context-core.js";
import { getOctokit, github, repoContext } from "./github.js";
import { boolOutput, stringOutput } from "./outputs.js";

const boolEnv = (name: string, fallback: boolean) => {
  const value = process.env[name];
  if (value == null || value === "") {
    return fallback;
  }
  return value.toLowerCase() === "true";
};

const optionsFromEnv = (): ContextOptions => ({
  commands: process.env.COMMANDS || "/codex,/review",
  requiredPermission: process.env.REQUIRED_PERMISSION || "write",
  allowForks: boolEnv("ALLOW_FORKS", false),
  createPr: boolEnv("CREATE_PR", true),
  pushPrBranch: boolEnv("PUSH_PR_BRANCH", true),
});

const getPrNumber = () => {
  const payload = github.context.payload;
  if (
    github.context.eventName === "pull_request_review" ||
    github.context.eventName === "pull_request_review_comment"
  ) {
    return payload.pull_request?.number;
  }
  if (github.context.eventName === "issue_comment" && payload.issue?.pull_request) {
    return payload.issue.number;
  }
  return undefined;
};

const slashPayload = (): SlashPayload => {
  const payload = github.context.payload;
  return {
    sender: payload.sender
      ? {
          login: payload.sender.login,
          type: payload.sender.type,
        }
      : undefined,
    repository: {
      default_branch: payload.repository?.default_branch,
    },
    issue: payload.issue
      ? {
          number: payload.issue.number,
          html_url: payload.issue.html_url,
          pull_request: payload.issue.pull_request,
        }
      : undefined,
    pull_request: payload.pull_request
      ? {
          number: payload.pull_request.number,
        }
      : undefined,
    review: payload.review
      ? {
          body: payload.review.body,
          node_id: payload.review.node_id,
          html_url: payload.review.html_url,
        }
      : undefined,
    comment: payload.comment
      ? {
          id: payload.comment.id,
          node_id: payload.comment.node_id,
          body: payload.comment.body,
          html_url: payload.comment.html_url,
          path: payload.comment.path,
          line: payload.comment.line,
          side: payload.comment.side,
          start_line: payload.comment.start_line,
          original_line: payload.comment.original_line,
          diff_hunk: payload.comment.diff_hunk,
        }
      : undefined,
  };
};

const main = async () => {
  const payload = github.context.payload;
  const triggerPayload = slashPayload();
  const options = optionsFromEnv();
  const octokit = getOctokit();
  const repo = repoContext();
  const actor = payload.sender?.login ?? github.context.actor;
  let actorPermission: Permission = "none";

  if (actor) {
    try {
      const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
        ...repo,
        username: actor,
      });
      actorPermission = data.permission as Permission;
    } catch (error) {
      core.warning(
        `Could not determine ${actor}'s repository permission: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const prNumber = getPrNumber();
  let pullRequest: PullRequestInfo | null = null;
  if (prNumber) {
    const { data: pr } = await octokit.rest.pulls.get({
      ...repo,
      pull_number: Number(prNumber),
    });
    pullRequest = {
      number: pr.number,
      headRef: pr.head.ref,
      headRepo: pr.head.repo?.full_name ?? "",
      baseRef: pr.base.ref,
      baseSha: pr.base.sha,
      headSha: pr.head.sha,
    };
  }

  const resolution = resolveTrigger({
    eventName: github.context.eventName,
    payload: triggerPayload,
    options,
    actorPermission,
    pullRequest,
    repositoryFullName: `${repo.owner}/${repo.repo}`,
  });

  const body = bodyForEvent(github.context.eventName, triggerPayload);
  if (resolution.skipped && resolution.skipReason) {
    core.info(`Skipping slash-codex: ${resolution.skipReason}`);
  }
  if (resolution.isValid) {
    core.info(`Matched /${resolution.command}${body ? "" : " with empty body"}`);
  }

  boolOutput("is_valid", resolution.isValid);
  boolOutput("skipped", resolution.skipped);
  boolOutput("can_run", resolution.canRun);
  boolOutput("can_modify", resolution.canModify);
  boolOutput("can_create_pr", resolution.canCreatePr);
  stringOutput("command", resolution.command);
  stringOutput("user_prompt", resolution.userPrompt);
  stringOutput("pr_number", resolution.prNumber);
  stringOutput("target_issue_number", resolution.targetIssueNumber);
  stringOutput("actor_permission", resolution.actorPermission);
  stringOutput("base_ref", resolution.baseRef);
  stringOutput("head_ref", resolution.headRef);
  stringOutput("head_repo", resolution.headRepo);
  stringOutput("review_comment_id", resolution.reviewCommentId);
  stringOutput("reaction_subject_id", resolution.reactionSubjectId);
  stringOutput("trigger_url", resolution.triggerUrl);
  stringOutput("skip_reason", resolution.skipReason);
};

await main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
