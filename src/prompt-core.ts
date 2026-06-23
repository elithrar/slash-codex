import codexPrompt from "./prompts/codex.md?raw";
import mainPrompt from "./prompts/main.md?raw";
import readOnlyPrompt from "./prompts/read-only.md?raw";
import reviewPrompt from "./prompts/review.md?raw";
import writeIssuePrompt from "./prompts/write-issue.md?raw";
import writePrPrompt from "./prompts/write-pr.md?raw";

export type PromptInput = {
  owner: string;
  repo: string;
  eventName: string;
  command: string;
  canModify: boolean;
  canCreatePr: boolean;
  userPrompt: string;
  triggerUrl: string;
  title: string;
  description: string;
  prNumber: string;
  baseRef: string;
  baseSha: string;
  headSha: string;
  triggerComment: {
    html_url?: string | null;
    path?: string | null;
    line?: number | null;
    side?: string | null;
    start_line?: number | null;
    original_line?: number | null;
    diff_hunk?: string | null;
  } | null;
};

const escapePromptData = (value: unknown) =>
  JSON.stringify(value, null, 2)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");

const render = (template: string, values: Record<string, string>) => {
  return template.replace(/{{([a-z_]+)}}/g, (_match, key: string) => values[key] ?? "");
};

export const buildPrompt = (input: PromptInput) => {
  const scope = input.prNumber
    ? `This is PR #${input.prNumber} for ${input.owner}/${input.repo}.

Review only the changes introduced by this PR:
- Base ref: ${input.baseRef}
- Base SHA: ${input.baseSha}
- Head SHA: ${input.headSha}

Useful commands:
- git diff --stat ${input.baseSha}...${input.headSha}
- git diff ${input.baseSha}...${input.headSha}
- git log --oneline ${input.baseSha}...${input.headSha}`
    : "No pull request is attached to this trigger. Work from the checked-out default branch and do not claim to have reviewed a PR.";

  const writeAccessPrompt = input.canModify
    ? writePrPrompt
    : input.canCreatePr
      ? writeIssuePrompt
      : readOnlyPrompt;
  const modePrompt = input.command === "review" ? reviewPrompt : codexPrompt;

  const data = escapePromptData({
    title: input.title || null,
    description: input.description || null,
    user_prompt: input.userPrompt || null,
    trigger_comment: input.triggerComment,
  });

  return render(mainPrompt, {
    repository: `${input.owner}/${input.repo}`,
    write_access_prompt: writeAccessPrompt.trim(),
    mode_prompt: modePrompt.trim(),
    event_name: input.eventName,
    trigger_url: input.triggerUrl || "unknown",
    command: input.command,
    scope,
    request_data: data,
  });
};
