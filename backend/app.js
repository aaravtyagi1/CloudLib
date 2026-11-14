const express = require("express");
const app = express();
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const fileUpload = require("express-fileupload");
const path = require("path");
const fs = require("fs");

// Ensure environment variables are loaded if app.js is imported directly (e.g. In tests)
if (!process.env.PORT) {
  const configEnvPath = path.resolve(__dirname, "./config/config.env");
  const rootEnvPath = path.resolve(__dirname, "../.env");
  if (fs.existsSync(configEnvPath)) {
    require("dotenv").config({ path: configEnvPath });
  } else if (fs.existsSync(rootEnvPath)) {
    require("dotenv").config({ path: rootEnvPath });
  } else {
    require("dotenv").config();
  }
}

const errorMiddleware = require("./middleware/error");

// Body parser with limits accommodating base64 images
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 } }));

// Health Check Endpoint (used by EC2 User Data, ALB, and monitoring)
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "CloudLib API",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Route Imports
const product = require("./routes/productRoute");
const user = require("./routes/userRoute");
const order = require("./routes/orderRoute");
const payment = require("./routes/paymentRoute");

app.use("/api/v1", product);
app.use("/api/v1", user);
app.use("/api/v1", order);
app.use("/api/v1", payment);

// Serve Frontend Static Build if present
const frontendBuildPath = path.resolve(__dirname, "../frontend/build");
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(frontendBuildPath, "index.html"));
  });
}

// Middleware for Errors
app.use(errorMiddleware);

module.exports = app;
