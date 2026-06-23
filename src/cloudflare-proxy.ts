import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import * as core from "@actions/core";
import { cloudflareResponsesApiUrl, rewriteCloudflareModel } from "./provider-core.js";

const readBody = async (request: AsyncIterable<Buffer>) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
};

const main = async () => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const gatewayId = process.env.CLOUDFLARE_AI_GATEWAY_ID || "default";
  const endpointFile = process.env.ENDPOINT_FILE;
  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required");
  }
  if (!endpointFile) {
    throw new Error("ENDPOINT_FILE is required");
  }

  const upstreamUrl = cloudflareResponsesApiUrl(accountId);
  const server = createServer(async (request, response) => {
    try {
      const body = JSON.parse(await readBody(request));
      body.model = rewriteCloudflareModel(body.model);

      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          authorization: request.headers.authorization || "",
          "cf-aig-gateway-id": gatewayId,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      response.statusCode = upstream.status;
      upstream.headers.forEach((value, key) => {
        if (
          !["content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())
        ) {
          response.setHeader(key, value);
        }
      });

      if (!upstream.body) {
        response.end();
        return;
      }

      for await (const chunk of upstream.body) {
        response.write(chunk);
      }
      response.end();
    } catch (error) {
      response.statusCode = 502;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      );
    }
  });

  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not determine Cloudflare proxy address");
    }
    writeFileSync(endpointFile, `http://127.0.0.1:${address.port}/responses`);
  });
};

await main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
