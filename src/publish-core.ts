const wrapperNoise = [
  /^i did not (open|create) a pr\b/i,
  /^per the workflow constraints\b/i,
  /^the runner should package\b/i,
  /^the github actions wrapper is expected\b/i,
];

const cleanedFinalMessage = (message: string) =>
  message
    .split(/\r?\n/)
    .filter((line) => !wrapperNoise.some((pattern) => pattern.test(line.trim())))
    .join("\n")
    .trim();

export const buildPullRequestBody = ({
  issueNumber,
  request,
  finalMessage,
}: {
  issueNumber: string;
  request: string;
  finalMessage: string;
}) => {
  const summary = cleanedFinalMessage(finalMessage);
  const fallback = request
    ? `Requested: ${request}`
    : `Codex generated changes for #${issueNumber}.`;

  return [`Generated from #${issueNumber}.`, "", summary || fallback].join("\n");
};
