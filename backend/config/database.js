const prisma = require("./prisma");

const connectDatabase = async () => {
  try {
    await prisma.$connect();
    console.log("PostgreSQL connected with server via Prisma Client");
  } catch (error) {
    console.error("Database connection failed:", error.message);
  }
};

module.exports = connectDatabase;
