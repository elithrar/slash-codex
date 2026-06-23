export type Provider = "auto" | "openai" | "cloudflare" | "opencode";

export type ProviderEnv = {
  OPENAI_API_KEY?: string | undefined;
  CLOUDFLARE_ACCOUNT_ID?: string | undefined;
  CLOUDFLARE_AI_GATEWAY_ID?: string | undefined;
  CLOUDFLARE_API_KEY?: string | undefined;
  OPENCODE_API_KEY?: string | undefined;
};

export type ProviderConfig = {
  provider: Exclude<Provider, "auto">;
  responsesApiEndpoint: string;
};

export const cloudflareResponsesApiUrl = (accountId: string) => {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/responses`;
};

export const rewriteCloudflareModel = (model: unknown) => {
  if (typeof model !== "string" || model.includes("/") || model.startsWith("@cf/")) {
    return model;
  }
  return `openai/${model}`;
};

export const resolveProvider = (requested: string, env: ProviderEnv): Exclude<Provider, "auto"> => {
  const provider = requested.toLowerCase().trim();
  if (["openai", "cloudflare", "opencode"].includes(provider)) {
    return provider as Exclude<Provider, "auto">;
  }
  if (provider !== "" && provider !== "auto") {
    throw new Error(`Unsupported provider: ${requested}`);
  }
  if (env.OPENAI_API_KEY) {
    return "openai";
  }
  if (env.CLOUDFLARE_API_KEY || env.CLOUDFLARE_ACCOUNT_ID) {
    return "cloudflare";
  }
  if (env.OPENCODE_API_KEY) {
    return "opencode";
  }
  return "openai";
};

export const responsesApiEndpoint = (provider: Exclude<Provider, "auto">, env: ProviderEnv) => {
  if (provider === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required when provider is openai");
    }
    return "";
  }

  if (provider === "cloudflare") {
    if (!env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID is required when provider is cloudflare");
    }
    if (!env.CLOUDFLARE_API_KEY) {
      throw new Error("CLOUDFLARE_API_KEY is required when provider is cloudflare");
    }
    return "";
  }

  if (!env.OPENCODE_API_KEY) {
    throw new Error("OPENCODE_API_KEY is required when provider is opencode");
  }
  return "https://opencode.ai/zen/v1/responses";
};

export const buildProviderConfig = (
  provider: Exclude<Provider, "auto">,
  env: ProviderEnv,
): ProviderConfig => {
  return { provider, responsesApiEndpoint: responsesApiEndpoint(provider, env) };
};
