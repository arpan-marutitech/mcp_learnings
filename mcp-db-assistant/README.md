# AI Database Assistant MCP (SQL Server)

Production-ready MCP server using Node.js, `@modelcontextprotocol/sdk`, and SQL Server via `mssql`.

## Features

- 8 MCP tools for user/order operations and analytics
- Strict input schemas (`zod`)
- Parameterized SQL requests only (`request.input(...)`)
- No raw SQL execution exposed to LLM
- Validation for email, IDs, status, and amount
- Structured JSON responses
- Tool call logging for audit/debug

## Tech Stack

- Node.js (ESM)
- `@modelcontextprotocol/sdk`
- `mssql`
- `dotenv`
- `zod`

## Project Files

- `index.js`: MCP server, repositories, services, and tools
- `schema.sql`: SQL Server schema script (run in SSMS)
- `.env.example`: Environment template
- `package.json`: Scripts and dependencies

## Environment Setup

Create a `.env` file in this folder:

```env
DB_HOST=127.0.0.1
DB_PORT=1433
DB_USER=mcp_app
DB_PASSWORD=StrongPass@123
DB_NAME=ai_assistant_db
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true
```

## Database Setup (SSMS)

1. Open SQL Server Management Studio.
2. Open `schema.sql` from this folder.
3. Execute the script.

The script creates:

- Database: `ai_assistant_db`
- Tables: `dbo.users`, `dbo.orders`
- Constraints and indexes

## Install and Run

```bash
cd "D:\MCP Learning\mcp-db-assistant"
npm install
npm start
```

Expected startup message:

`AI Database Assistant MCP server started on stdio`

## MCP Server Config (Claude Desktop)

```json
{
  "mcpServers": {
    "ai-database-assistant-mcp": {
      "command": "node",
      "args": ["D:\\MCP Learning\\mcp-db-assistant\\index.js"],
      "cwd": "D:\\MCP Learning\\mcp-db-assistant"
    }
  }
}
```

Restart Claude Desktop fully after changes.

## Tools

- `getUsers(status)`
- `getUserByEmail(email)`
- `createUser(name, email)`
- `updateUserStatus(userId, status)`
- `getOrdersByUser(userId)`
- `createOrder(userId, amount)`
- `getRecentUsers(days)`
- `getAnalytics()`

## Example Test Prompts

- `Create a user with name "Arpan" and email "arpan@example.com"`
- `Get user by email "arpan@example.com"`
- `Get all active users`
- `Create an order for userId 1 with amount 499.99`
- `Get all orders for userId 1`
- `Get users created in last 7 days`
- `Get analytics`

## Security Notes

- All database calls use parameterized inputs.
- No dynamic SQL from model input is accepted.
- Inputs are validated before DB operations.

## Troubleshooting

- `Missing required environment variables`: `.env` is missing or not loaded.
  Add `.env` with required keys and restart.
- `ESOCKET` connection errors: wrong SQL Server host/port/protocol.
  Verify SQL Server is listening on `1433` and `DB_HOST` is correct.
- Login/auth failures: verify SQL login exists and has access to `ai_assistant_db`.
- Claude can start server but tools fail immediately: ensure config includes `cwd`.
