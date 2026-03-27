IF DB_ID(N'ai_assistant_db') IS NULL
BEGIN
  CREATE DATABASE ai_assistant_db;
END;
GO

USE ai_assistant_db;
GO

IF OBJECT_ID(N'dbo.users', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(120) NOT NULL,
    email NVARCHAR(255) NOT NULL UNIQUE,
    status NVARCHAR(20) NOT NULL CONSTRAINT CK_users_status CHECK (status IN (N'active', N'inactive')),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created_at DEFAULT (SYSUTCDATETIME())
  );

  CREATE INDEX IX_users_status ON dbo.users(status);
  CREATE INDEX IX_users_created_at ON dbo.users(created_at);
END;
GO

IF OBJECT_ID(N'dbo.orders', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.orders (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status NVARCHAR(20) NOT NULL CONSTRAINT CK_orders_status CHECK (status IN (N'pending', N'completed')),
    created_at DATETIME2 NOT NULL CONSTRAINT DF_orders_created_at DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_orders_users FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE
  );

  CREATE INDEX IX_orders_user_id ON dbo.orders(user_id);
  CREATE INDEX IX_orders_status ON dbo.orders(status);
  CREATE INDEX IX_orders_created_at ON dbo.orders(created_at);
END;
GO
