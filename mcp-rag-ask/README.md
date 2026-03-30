# MCP RAG Ask Bridge

This MCP server exposes one tool:

- `getPolicyAnswer` -> calls your RAG API `POST /ask`

## Prerequisites

- Your RAG API must be running in `rag-free`:
  - `node ingest.js`
  - `node server.js`
- Node.js 18+

## Setup

1. Install dependencies:

```bash
cd mcp-rag-ask
npm install
```

2. Copy env file:

```bash
copy .env.example .env
```

3. Start MCP server:

```bash
npm start
```

## Claude Desktop config

Add this server entry to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "rag-policy-bridge": {
      "command": "node",
      "args": ["D:/MCP Learning/mcp-rag-ask/index.js"],
      "env": {
        "RAG_API_BASE_URL": "http://localhost:3000",
        "RAG_ASK_PATH": "/ask",
        "REQUEST_TIMEOUT_MS": "30000"
      }
    }
  }
}
```

## Tool contract

- Tool name: `getPolicyAnswer`
- Input:

```json
{ "question": "What is leave policy?" }
```

- Output:

```json
{ "ok": true, "answer": "..." }
```
