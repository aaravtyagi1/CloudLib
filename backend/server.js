const path = require("path");
const fs = require("fs");

// Config - load local env file if present
const configEnvPath = path.resolve(__dirname, "./config/config.env");
const rootEnvPath = path.resolve(__dirname, "../.env");

if (fs.existsSync(configEnvPath)) {
  require("dotenv").config({ path: configEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  require("dotenv").config({ path: rootEnvPath });
} else {
  require("dotenv").config();
}

const { loadSecrets } = require("./config/secretsManager");
const validateEnv = require("./config/envValidator");
const connectDatabase = require("./config/database");

// Handling Uncaught Exception
process.on("uncaughtException", (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  console.error(err.stack);
  console.error("Shutting down server due to Uncaught Exception");
  process.exit(1);
});

async function startServer() {
  // Attempt to load production secrets from AWS Secrets Manager if on AWS
  await loadSecrets();

  // Validate environment variables
  validateEnv();

  // Connect to PostgreSQL database via Prisma
  await connectDatabase();

  const app = require("./app");
  const PORT = process.env.PORT || 4000;

  const server = app.listen(PORT, () => {
    console.log(`CloudLib Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode`);
    console.log(`Health check available at http://localhost:${PORT}/api/v1/health`);
  });

  // Handling Unhandled Promise Rejection
  process.on("unhandledRejection", (err) => {
    console.error(`Unhandled Rejection: ${err.message}`);
    console.error(err.stack);
    console.error("Shutting down server due to Unhandled Promise Rejection");

    server.close(() => {
      process.exit(1);
    });
  });

  // Graceful shutdown on SIGTERM / SIGINT (for systemd and Docker)
  const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}. Gracefully shutting down CloudLib server...`);
    server.close(async () => {
      try {
        const prisma = require("./config/prisma");
        await prisma.$disconnect();
        console.log("Database connection closed.");
      } catch (err) {
        console.error("Error during database disconnect:", err.message);
      }
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

startServer();
