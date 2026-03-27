#!/usr/bin/env node
import { config as loadEnv } from "dotenv";
import sql from "mssql";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

loadEnv();

const CONFIG = {
  dbHost: process.env.DB_HOST || "localhost",
  dbPort: Number(process.env.DB_PORT || 1433),
  dbUser: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,
  dbName: process.env.DB_NAME,
  dbEncrypt: String(process.env.DB_ENCRYPT || "false").toLowerCase() === "true",
  dbTrustServerCertificate: String(process.env.DB_TRUST_SERVER_CERT || "true").toLowerCase() === "true"
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_STATUS = new Set(["active", "inactive"]);

function logToolCall(toolName, phase, details = {}) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    tool: toolName,
    phase,
    ...details
  }));
}

function validateEmail(email) {
  return EMAIL_REGEX.test(String(email || "").trim());
}

function toToolResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data
  };
}

function toToolError(toolName, error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const payload = { ok: false, tool: toolName, error: message };

  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload
  };
}

function validateConfig() {
  const missing = [];
  if (!CONFIG.dbUser) missing.push("DB_USER");
  if (CONFIG.dbPassword === undefined) missing.push("DB_PASSWORD");
  if (!CONFIG.dbName) missing.push("DB_NAME");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

class UserRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getUsersByStatus(status) {
    const result = await this.pool
      .request()
      .input("status", sql.NVarChar(20), status)
      .query(`
        SELECT id, name, email
        FROM dbo.users
        WHERE status = @status
        ORDER BY id DESC
      `);

    return result.recordset;
  }

  async getUserByEmail(email) {
    const result = await this.pool
      .request()
      .input("email", sql.NVarChar(255), email)
      .query(`
        SELECT TOP 1 id, name, email, status, created_at
        FROM dbo.users
        WHERE email = @email
      `);

    return result.recordset[0] || null;
  }

  async getUserById(userId) {
    const result = await this.pool
      .request()
      .input("userId", sql.Int, userId)
      .query(`
        SELECT TOP 1 id, name, email, status, created_at
        FROM dbo.users
        WHERE id = @userId
      `);

    return result.recordset[0] || null;
  }

  async createUser(name, email) {
    const result = await this.pool
      .request()
      .input("name", sql.NVarChar(120), name)
      .input("email", sql.NVarChar(255), email)
      .query(`
        INSERT INTO dbo.users (name, email, status)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.status, INSERTED.created_at
        VALUES (@name, @email, N'active')
      `);

    return result.recordset[0] || null;
  }

  async updateUserStatus(userId, status) {
    const result = await this.pool
      .request()
      .input("status", sql.NVarChar(20), status)
      .input("userId", sql.Int, userId)
      .query(`
        UPDATE dbo.users
        SET status = @status
        WHERE id = @userId
      `);

    return result.rowsAffected[0] || 0;
  }

  async getRecentUsers(days) {
    const result = await this.pool
      .request()
      .input("days", sql.Int, days)
      .query(`
        SELECT id, name, email, status, created_at
        FROM dbo.users
        WHERE created_at >= DATEADD(DAY, -@days, SYSUTCDATETIME())
        ORDER BY created_at DESC
      `);

    return result.recordset;
  }

  async getAnalyticsUsers() {
    const result = await this.pool.request().query(`
      SELECT
        COUNT(*) AS totalUsers,
        SUM(CASE WHEN status = N'active' THEN 1 ELSE 0 END) AS activeUsers
      FROM dbo.users
    `);

    return result.recordset[0] || { totalUsers: 0, activeUsers: 0 };
  }
}

class OrderRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async getOrdersByUser(userId) {
    const result = await this.pool
      .request()
      .input("userId", sql.Int, userId)
      .query(`
        SELECT id, user_id, amount, status, created_at
        FROM dbo.orders
        WHERE user_id = @userId
        ORDER BY created_at DESC
      `);

    return result.recordset;
  }

  async createOrder(userId, amount) {
    const result = await this.pool
      .request()
      .input("userId", sql.Int, userId)
      .input("amount", sql.Decimal(12, 2), amount)
      .query(`
        INSERT INTO dbo.orders (user_id, amount, status)
        OUTPUT INSERTED.id, INSERTED.user_id, INSERTED.amount, INSERTED.status, INSERTED.created_at
        VALUES (@userId, @amount, N'pending')
      `);

    return result.recordset[0] || null;
  }

  async getAnalyticsOrders() {
    const result = await this.pool.request().query(`
      SELECT
        COUNT(*) AS totalOrders,
        COALESCE(SUM(CASE WHEN status = N'completed' THEN amount ELSE 0 END), 0) AS totalRevenue
      FROM dbo.orders
    `);

    return result.recordset[0] || { totalOrders: 0, totalRevenue: 0 };
  }
}

class DatabaseService {
  constructor(userRepository, orderRepository) {
    this.userRepository = userRepository;
    this.orderRepository = orderRepository;
  }

  async getUsers(status) {
    if (!USER_STATUS.has(status)) {
      throw new Error("Invalid status. Allowed values: active, inactive");
    }
    return this.userRepository.getUsersByStatus(status);
  }

  async getUserByEmail(email) {
    if (!validateEmail(email)) {
      throw new Error("Invalid email format");
    }
    return this.userRepository.getUserByEmail(email.toLowerCase());
  }

  async createUser(name, email) {
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 120) {
      throw new Error("Name must be between 2 and 120 characters");
    }

    if (!validateEmail(cleanEmail)) {
      throw new Error("Invalid email format");
    }

    const existing = await this.userRepository.getUserByEmail(cleanEmail);
    if (existing) {
      throw new Error("User with this email already exists");
    }

    return this.userRepository.createUser(cleanName, cleanEmail);
  }

  async updateUserStatus(userId, status) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("userId must be a positive integer");
    }

    if (!USER_STATUS.has(status)) {
      throw new Error("Invalid status. Allowed values: active, inactive");
    }

    const affectedRows = await this.userRepository.updateUserStatus(userId, status);
    if (affectedRows === 0) {
      throw new Error("User not found");
    }

    return this.userRepository.getUserById(userId);
  }

  async getOrdersByUser(userId) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("userId must be a positive integer");
    }

    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    return this.orderRepository.getOrdersByUser(userId);
  }

  async createOrder(userId, amount) {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("userId must be a positive integer");
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new Error("amount must be a positive number");
    }

    const roundedAmount = Number(numericAmount.toFixed(2));
    const user = await this.userRepository.getUserById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    return this.orderRepository.createOrder(userId, roundedAmount);
  }

  async getRecentUsers(days) {
    if (!Number.isInteger(days) || days <= 0 || days > 3650) {
      throw new Error("days must be an integer between 1 and 3650");
    }

    return this.userRepository.getRecentUsers(days);
  }

  async getAnalytics() {
    const [userAnalytics, orderAnalytics] = await Promise.all([
      this.userRepository.getAnalyticsUsers(),
      this.orderRepository.getAnalyticsOrders()
    ]);

    return {
      totalUsers: Number(userAnalytics.totalUsers || 0),
      activeUsers: Number(userAnalytics.activeUsers || 0),
      totalOrders: Number(orderAnalytics.totalOrders || 0),
      totalRevenue: Number(orderAnalytics.totalRevenue || 0)
    };
  }
}

async function createDbPool() {
  validateConfig();

  const pool = new sql.ConnectionPool({
    server: CONFIG.dbHost,
    port: CONFIG.dbPort,
    user: CONFIG.dbUser,
    password: CONFIG.dbPassword,
    database: CONFIG.dbName,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    },
    options: {
      encrypt: CONFIG.dbEncrypt,
      trustServerCertificate: CONFIG.dbTrustServerCertificate
    }
  });

  await pool.connect();
  await pool.request().query("SELECT 1 AS health_check");
  return pool;
}

function registerTools(server, service) {
  server.registerTool(
    "getUsers",
    {
      description: "Fetch users by status. Returns id, name, and email.",
      inputSchema: {
        status: z.enum(["active", "inactive"]).describe("User status filter")
      }
    },
    async ({ status }) => {
      const toolName = "getUsers";
      logToolCall(toolName, "start", { status });
      try {
        const users = await service.getUsers(status);
        const result = { ok: true, users };
        logToolCall(toolName, "success", { count: users.length });
        return toToolResult(result);
      } catch (error) {
        logToolCall(toolName, "error", { message: error instanceof Error ? error.message : String(error) });
        return toToolError(toolName, error);
      }
    }
  );

  server.registerTool(
    "getUserByEmail",
    {
      description: "Fetch a single user by email.",
      inputSchema: {
        email: z.string().email().describe("User email")
      }
    },
    async ({ email }) => {
      const toolName = "getUserByEmail";
      logToolCall(toolName, "start", { email });
      try {
        const user = await service.getUserByEmail(email);
        const result = { ok: true, user };
        logToolCall(toolName, "success", { found: Boolean(user) });
        return toToolResult(result);
      } catch (error) {
        logToolCall(toolName, "error", { message: error instanceof Error ? error.message : String(error) });
        return toToolError(toolName, error);
      }
    }
  );

  server.registerTool(
    "createUser",
    {
      description: "Create a new user. Default status is active.",
      inputSchema: {
        name: z.string().min(2).max(120).describe("User full name"),
        email: z.string().email().describe("Unique user email")
      }
    },
    async ({ name, email }) => {
      const toolName = "createUser";
      logToolCall(toolName, "start", { email });
      try {
        const user = await service.createUser(name, email);
        const result = { ok: true, user };
        logToolCall(toolName, "success", { userId: user?.id || null });
        return toToolResult(result);
      } catch (error) {
        logToolCall(toolName, "error", { message: error instanceof Error ? error.message : String(error) });
        return toToolError(toolName, error);
      }
    }
  );

  server.registerTool(
    "updateUserStatus",
    {
      description: "Update a user status (active/inactive).",
      inputSchema: {
        userId: z.number().int().positive().describe("User ID"),
        status: z.enum(["active", "inactive"]).describe("New user status")
      }
    },
    async ({ userId, status }) => {
      const toolName = "updateUserStatus";
      logToolCall(toolName, "start", { userId, status });
      try {
        const user = await service.updateUserStatus(userId, status);
        const result = { ok: true, user };
        logToolCall(toolName, "success", { userId });
        return toToolResult(result);
      } catch (error) {
        logToolCall(toolName, "error", { message: error instanceof Error ? error.message : String(error) });
        return toToolError(toolName, error);
      }
    }
  );

  server.registerTool(
    "getOrdersByUser",
    {
      description: "Fetch all orders for a specific user.",
      inputSchema: {
        userId: z.number().int().positive().describe("User ID")
      }
    },
    async ({ userId }) => {
      const toolName = "getOrdersByUser";
      logToolCall(toolName, "start", { userId });
      try {
        const orders = await service.getOrdersByUser(userId);
        const result = { ok: true, orders };
        logToolCall(toolName, "success", { count: orders.length });
        return toToolResult(result);
      } catch (error) {
        logToolCall(toolName, "error", { message: error instanceof Error ? error.message : String(error) });
        return toToolError(toolName, error);
      }
    }
  );

  server.registerTool(
    "createOrder",
    {
      description: "Create a new order for a user. Default status is pending.",
      inputSchema: {
        userId: z.number().int().positive().describe("User ID"),
        amount: z.number().positive().describe("Order amount")
      }
    },
    async ({ userId, amount }) => {
      const toolName = "createOrder";
      logToolCall(toolName, "start", { userId, amount });
      try {
        const order = await service.createOrder(userId, amount);
        const result = { ok: true, order };
        logToolCall(toolName, "success", { orderId: order?.id || null });
        return toToolResult(result);
      } catch (error) {
        logToolCall(toolName, "error", { message: error instanceof Error ? error.message : String(error) });
        return toToolError(toolName, error);
      }
    }
  );

  server.registerTool(
    "getRecentUsers",
    {
      description: "Fetch users created in the last X days.",
      inputSchema: {
        days: z.number().int().min(1).max(3650).describe("Number of days")
      }
    },
    async ({ days }) => {
      const toolName = "getRecentUsers";
      logToolCall(toolName, "start", { days });
      try {
        const users = await service.getRecentUsers(days);
        const result = { ok: true, users };
        logToolCall(toolName, "success", { count: users.length });
        return toToolResult(result);
      } catch (error) {
        logToolCall(toolName, "error", { message: error instanceof Error ? error.message : String(error) });
        return toToolError(toolName, error);
      }
    }
  );

  server.registerTool(
    "getAnalytics",
    {
      description: "Return analytics: total users, active users, total orders, total revenue.",
      inputSchema: {}
    },
    async () => {
      const toolName = "getAnalytics";
      logToolCall(toolName, "start");
      try {
        const analytics = await service.getAnalytics();
        const result = { ok: true, analytics };
        logToolCall(toolName, "success", analytics);
        return toToolResult(result);
      } catch (error) {
        logToolCall(toolName, "error", { message: error instanceof Error ? error.message : String(error) });
        return toToolError(toolName, error);
      }
    }
  );
}

async function main() {
  const pool = await createDbPool();

  const userRepository = new UserRepository(pool);
  const orderRepository = new OrderRepository(pool);
  const service = new DatabaseService(userRepository, orderRepository);

  const server = new McpServer({
    name: "ai-database-assistant-mcp",
    version: "1.0.0"
  });

  registerTools(server, service);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI Database Assistant MCP server started on stdio");

  const shutdown = async () => {
    try {
      await pool.close();
    } catch {
      // Ignore shutdown errors.
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
