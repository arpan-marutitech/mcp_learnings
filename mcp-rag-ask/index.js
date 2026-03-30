#!/usr/bin/env node
import axios from "axios";
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv({ path: path.join(__dirname, ".env") });

const RAG_API_BASE_URL = (process.env.RAG_API_BASE_URL || "http://localhost:3000").trim();
const RAG_ASK_PATH = (process.env.RAG_ASK_PATH || "/ask").trim();
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120000);
const REQUEST_RETRIES = Number(process.env.REQUEST_RETRIES || 2);
const RETRY_BACKOFF_MS = Number(process.env.RETRY_BACKOFF_MS || 1500);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toToolResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data
  };
}

function toToolError(toolName, error) {
  let message = "Unknown error";

  if (axios.isAxiosError(error)) {
    const status = error.response?.status || "unknown";
    const statusText = error.response?.statusText || error.message;
    const apiError = error.response?.data?.error;

    message = `Request failed: ${status} ${statusText}`;
    if (apiError) {
      message += ` (${apiError})`;
    }
  } else if (error instanceof Error) {
    message = error.message;
  }

  const payload = {
    ok: false,
    tool: toolName,
    error: message
  };

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2)
      }
    ],
    structuredContent: payload
  };
}

async function callAskApi(question) {
  let lastError;

  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        `${RAG_API_BASE_URL}${RAG_ASK_PATH}`,
        { question },
        {
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      const answer = response.data?.answer;
      if (!answer || typeof answer !== "string") {
        throw new Error("RAG API returned an invalid response. Expected: { answer: string }");
      }

      return answer;
    } catch (error) {
      lastError = error;

      const isTimeout = axios.isAxiosError(error) && error.code === "ECONNABORTED";
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const isRetryableHttp = typeof status === "number" && status >= 500;

      if (attempt < REQUEST_RETRIES && (isTimeout || isRetryableHttp)) {
        const waitMs = RETRY_BACKOFF_MS * (attempt + 1);
        await sleep(waitMs);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

const server = new McpServer({
  name: "rag-policy-bridge",
  version: "1.0.0"
});

server.registerTool(
  "getPolicyAnswer",
  {
    description: "Get answer from company policy via RAG API POST /ask.",
    inputSchema: {
      question: z.string().min(1).describe("Full user question about company policy")
    }
  },
  async ({ question }) => {
    try {
      const answer = await callAskApi(question);
      return toToolResult({
        ok: true,
        answer
      });
    } catch (error) {
      return toToolError("getPolicyAnswer", error);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
