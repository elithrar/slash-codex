import * as core from "@actions/core";
import { resolveProvider, responsesApiEndpoint, type ProviderEnv } from "./provider-core.js";
import { stringOutput } from "./outputs.js";

const main = () => {
  const env: ProviderEnv = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_AI_GATEWAY_ID: process.env.CLOUDFLARE_AI_GATEWAY_ID,
    CLOUDFLARE_API_KEY: process.env.CLOUDFLARE_API_KEY,
    OPENCODE_API_KEY: process.env.OPENCODE_API_KEY,
  };
  const provider = resolveProvider(process.env.PROVIDER || "auto", env);
  const endpoint = responsesApiEndpoint(provider, env);
  core.info(`Using ${provider} provider`);
  stringOutput("provider", provider);
  stringOutput("responses_api_endpoint", endpoint);
};

try {
  main();
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
