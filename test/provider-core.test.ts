import { describe, expect, test } from "vitest";
import {
  cloudflareResponsesApiUrl,
  resolveProvider,
  responsesApiEndpoint,
  rewriteCloudflareModel,
} from "../src/provider-core.js";

describe("resolveProvider", () => {
  test("resolves explicit and automatic providers", () => {
    expect(resolveProvider("openai", { OPENAI_API_KEY: "sk-test" })).toBe("openai");
    expect(
      resolveProvider("auto", { CLOUDFLARE_API_KEY: "cf", CLOUDFLARE_ACCOUNT_ID: "acct" }),
    ).toBe("cloudflare");
    expect(resolveProvider("auto", { OPENCODE_API_KEY: "oc" })).toBe("opencode");
  });
});

describe("responsesApiEndpoint", () => {
  test("validates Cloudflare config without exposing secrets as an endpoint", () => {
    const endpoint = responsesApiEndpoint("cloudflare", {
      CLOUDFLARE_ACCOUNT_ID: "acct123",
      CLOUDFLARE_AI_GATEWAY_ID: "my-gateway",
      CLOUDFLARE_API_KEY: "secret-token",
    });

    expect(endpoint).toBe("");
    expect(endpoint).not.toContain("secret-token");
  });

  test("generates the OpenCode Zen Responses endpoint without secrets", () => {
    const endpoint = responsesApiEndpoint("opencode", { OPENCODE_API_KEY: "secret-token" });

    expect(endpoint).toBe("https://opencode.ai/zen/v1/responses");
    expect(endpoint).not.toContain("secret-token");
  });

  test("builds Cloudflare REST endpoint and OpenAI model names", () => {
    expect(cloudflareResponsesApiUrl("acct123")).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct123/ai/v1/responses",
    );
    expect(rewriteCloudflareModel("gpt-5.5")).toBe("openai/gpt-5.5");
    expect(rewriteCloudflareModel("openai/gpt-5.5")).toBe("openai/gpt-5.5");
  });
});
