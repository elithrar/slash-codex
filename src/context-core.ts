export type Permission = "none" | "read" | "triage" | "write" | "maintain" | "admin";

export type SlashPayload = {
  sender?: { login?: string | undefined; type?: string | undefined } | undefined;
  repository?: { default_branch?: string | undefined } | undefined;
  issue?:
    | { number?: number | undefined; html_url?: string | undefined; pull_request?: unknown }
    | undefined;
  pull_request?: { number?: number | undefined } | undefined;
  review?:
    | { body?: string | undefined; node_id?: string | undefined; html_url?: string | undefined }
    | undefined;
  comment?:
    | {
        id?: number | undefined;
        node_id?: string | undefined;
        body?: string | undefined;
        html_url?: string | undefined;
        path?: string | undefined;
        line?: number | undefined;
        side?: string | undefined;
        start_line?: number | undefined;
        original_line?: number | undefined;
        diff_hunk?: string | undefined;
      }
    | undefined;
};

export type ContextOptions = {
  commands: string;
  requiredPermission: string;
  allowForks: boolean;
  createPr: boolean;
  pushPrBranch: boolean;
};

export type ParsedCommand = {
  command: string;
  userPrompt: string;
} | null;

export type PullRequestInfo = {
  number: number;
  headRef: string;
  headRepo: string;
  baseRef: string;
  baseSha: string;
  headSha: string;
};

export type TriggerResolution = {
  isValid: boolean;
  skipped: boolean;
  command: string;
  userPrompt: string;
  prNumber: string;
  targetIssueNumber: string;
  actorPermission: Permission;
  canRun: boolean;
  canModify: boolean;
  canCreatePr: boolean;
  baseRef: string;
  headRef: string;
  headRepo: string;
  reviewCommentId: string;
  reactionSubjectId: string;
  triggerUrl: string;
  skipReason: string;
};

const permissionOrder: Record<Permission, number> = {
  none: 0,
  read: 1,
  triage: 2,
  write: 3,
  maintain: 4,
  admin: 5,
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const parseCommands = (commands: string): string[] => {
  return commands
    .split(/[\n,]/)
    .map((command) => command.trim())
    .filter(Boolean)
    .map((command) => (command.startsWith("/") ? command : `/${command}`));
};

export const parseCommand = (body: string, commands: string): ParsedCommand => {
  const parsedCommands = parseCommands(commands);
  if (parsedCommands.length === 0) {
    return null;
  }

  const pattern = new RegExp(
    `^(${parsedCommands.map(escapeRegex).join("|")})(?:\\s+([\\s\\S]*))?$`,
  );
  const match = body.trim().match(pattern);
  if (!match) {
    return null;
  }

  const command = match[1];
  if (!command) {
    return null;
  }

  return {
    command: command.replace(/^\//, ""),
    userPrompt: (match[2] ?? "").trim(),
  };
};

export const hasPermission = (permission: Permission, required: string) => {
  const normalized = required.toLowerCase().trim();
  const minimum =
    normalized === "admin" || normalized === "maintain" || normalized === "write"
      ? normalized
      : "write";
  return permissionOrder[permission] >= permissionOrder[minimum];
};

export const bodyForEvent = (eventName: string, payload: SlashPayload) => {
  if (eventName === "pull_request_review") {
    return payload.review?.body ?? "";
  }
  if (eventName === "issue_comment" || eventName === "pull_request_review_comment") {
    return payload.comment?.body ?? "";
  }
  return "";
};

export const resolveTrigger = ({
  eventName,
  payload,
  options,
  actorPermission,
  pullRequest,
  repositoryFullName,
}: {
  eventName: string;
  payload: SlashPayload;
  options: ContextOptions;
  actorPermission: Permission;
  pullRequest: PullRequestInfo | null;
  repositoryFullName: string;
}): TriggerResolution => {
  const unsupported = ![
    "issue_comment",
    "pull_request_review",
    "pull_request_review_comment",
  ].includes(eventName);
  const body = bodyForEvent(eventName, payload);
  const parsed = unsupported ? null : parseCommand(body, options.commands);
  const defaultBranch = payload.repository?.default_branch ?? "";
  const isBot = payload.sender?.type === "Bot";
  const isPullRequestIssueComment =
    eventName === "issue_comment" && Boolean(payload.issue?.pull_request);
  const isStandaloneIssueComment =
    eventName === "issue_comment" && Boolean(payload.issue) && !payload.issue?.pull_request;
  const prNumber =
    pullRequest?.number ??
    payload.pull_request?.number ??
    (isPullRequestIssueComment ? payload.issue?.number : "");
  const targetIssueNumber = payload.issue?.number ?? prNumber ?? "";
  const isFork = Boolean(pullRequest?.headRepo && pullRequest.headRepo !== repositoryFullName);
  const hasRequiredPermission = hasPermission(actorPermission, options.requiredPermission);
  const blockedFork = isFork && !options.allowForks;
  const canRun = Boolean(parsed) && !isBot && !unsupported && hasRequiredPermission && !blockedFork;
  const canModify = Boolean(
    canRun && options.pushPrBranch && pullRequest && pullRequest.headRepo === repositoryFullName,
  );
  const canCreatePr = Boolean(canRun && options.createPr && isStandaloneIssueComment);
  const skipped = !parsed || isBot || unsupported || !canRun;
  const skipReason = unsupported
    ? `unsupported event: ${eventName}`
    : isBot
      ? "bot sender"
      : !parsed
        ? "no slash command"
        : !hasRequiredPermission
          ? `insufficient permission: ${actorPermission}`
          : blockedFork
            ? "fork pull request"
            : "";

  return {
    isValid: Boolean(parsed),
    skipped,
    command: parsed?.command ?? "",
    userPrompt: parsed?.userPrompt ?? "",
    prNumber: prNumber ? String(prNumber) : "",
    targetIssueNumber: targetIssueNumber ? String(targetIssueNumber) : "",
    actorPermission,
    canRun,
    canModify,
    canCreatePr,
    baseRef: pullRequest?.baseRef ?? defaultBranch,
    headRef: pullRequest?.headRef ?? "",
    headRepo: pullRequest?.headRepo ?? "",
    reviewCommentId:
      eventName === "pull_request_review_comment" ? String(payload.comment?.id ?? "") : "",
    reactionSubjectId: payload.comment?.node_id ?? payload.review?.node_id ?? "",
    triggerUrl:
      payload.comment?.html_url ?? payload.review?.html_url ?? payload.issue?.html_url ?? "",
    skipReason,
  };
};
