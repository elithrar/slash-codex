export const DEFAULT_BLOCKED_PATTERNS = [
  ".github/workflows/**",
  ".github/scripts/codex/**",
  "action.yml",
  "action.yaml",
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "*.pem",
  "**/*.pem",
  "*.key",
  "**/*.key",
  "*.p12",
  "**/*.p12",
  "*.pfx",
  "**/*.pfx",
];

const regexEscape = (char: string) => char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");

export const globToRegex = (glob: string) => {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*" && next === "*") {
      const after = glob[index + 2];
      if (after === "/") {
        pattern += "(?:.*/)?";
        index += 2;
      } else {
        pattern += ".*";
        index += 1;
      }
    } else if (char === "*") {
      pattern += "[^/]*";
    } else if (char === "?") {
      pattern += "[^/]";
    } else {
      pattern += regexEscape(char ?? "");
    }
  }
  return new RegExp(`${pattern}$`, "i");
};

export const parseExtraBlockedPatterns = (value: string | undefined) => {
  if (!value) {
    return [];
  }
  return value
    .split(/[\n,]/)
    .map((pattern) => pattern.trim())
    .filter(Boolean);
};

export const blockedPaths = (paths: string[], extraPatterns = "") => {
  const patterns = [...DEFAULT_BLOCKED_PATTERNS, ...parseExtraBlockedPatterns(extraPatterns)].map(
    globToRegex,
  );
  return paths.filter((path) => patterns.some((pattern) => pattern.test(path)));
};
