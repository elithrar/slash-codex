const bulletPattern = /^\s*[-*]\s+(.+)$/;

const sectionFor = (line: string) => line.trim().toLowerCase().replace(/:$/, "");

const cleanBullet = (value: string) => value.trim().replace(/\s+/g, " ");

const isWantedSection = (section: string, wantedSections: Set<string>) =>
  wantedSections.has(section) || (wantedSections.has("with") && section.endsWith(" with"));

const collectBullets = (message: string, wantedSections: Set<string>, max = 6) => {
  const bullets: string[] = [];
  let currentSection = "";

  for (const line of message.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (!bulletPattern.test(trimmed) && trimmed.length <= 80) {
      currentSection = sectionFor(trimmed);
      continue;
    }

    const match = trimmed.match(bulletPattern);
    if (!match || !isWantedSection(currentSection, wantedSections)) {
      continue;
    }

    bullets.push(cleanBullet(match[1] || ""));
    if (bullets.length >= max) {
      break;
    }
  }

  return bullets;
};

const firstUsefulSentence = (message: string) => {
  for (const line of message.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("---") || bulletPattern.test(trimmed)) {
      continue;
    }
    if (/^(verification|i did not|codex )/i.test(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return "Codex generated changes.";
};

export const buildPullRequestBody = ({
  issueNumber,
  request,
  finalMessage,
}: {
  issueNumber: string;
  request: string;
  finalMessage: string;
}) => {
  const changes = collectBullets(
    finalMessage,
    new Set(["with", "updated", "changes", "major changes", "summary"]),
  );
  const verification = collectBullets(finalMessage, new Set(["verification"]), 3);
  const body = [`Generated from #${issueNumber}.`, ""];

  body.push("Why:");
  body.push(
    request ? `- Requested: ${request}` : `- Addresses the Codex request from #${issueNumber}.`,
  );
  body.push("");

  body.push("Major changes:");
  if (changes.length > 0) {
    body.push(...changes.map((change) => `- ${change}`));
  } else {
    body.push(`- ${firstUsefulSentence(finalMessage)}`);
  }

  if (verification.length > 0) {
    body.push("", "Verification:", ...verification.map((item) => `- ${item}`));
  }

  return body.join("\n");
};
