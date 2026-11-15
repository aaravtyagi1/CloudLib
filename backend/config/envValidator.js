/**
 * Environment Variable Validation Utility
 * Validates critical environment variables and provides clear, actionable startup feedback.
 */

function validateEnv() {
  const missingCritical = [];
  const warnings = [];

  // 1. Port
  if (!process.env.PORT) {
    process.env.PORT = "4000";
  }

  // 2. Database URL
  if (!process.env.DATABASE_URL) {
    missingCritical.push({
      key: "DATABASE_URL",
      message: "PostgreSQL connection string is required (e.g. postgresql://user:pass@host:5432/db?schema=public).",
    });
  } else if (
    !process.env.DATABASE_URL.startsWith("postgresql://") &&
    !process.env.DATABASE_URL.startsWith("postgres://")
  ) {
    warnings.push({
      key: "DATABASE_URL",
      message: "DATABASE_URL does not start with 'postgresql://' or 'postgres://'. Ensure it is a valid PostgreSQL connection string.",
    });
  }

  // 3. JWT Secret
  if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === "production") {
      missingCritical.push({
        key: "JWT_SECRET",
        message: "JWT_SECRET is required in production for secure token signing.",
      });
    } else {
      process.env.JWT_SECRET = "dev_jwt_secret_change_in_production";
      warnings.push({
        key: "JWT_SECRET",
        message: "JWT_SECRET was not provided. Using a default development fallback.",
      });
    }
  }

  // 4. Expiration defaults
  if (!process.env.JWT_EXPIRE) {
    process.env.JWT_EXPIRE = "5d";
  }
  if (!process.env.COOKIE_EXPIRE) {
    process.env.COOKIE_EXPIRE = "5";
  }

  // 5. AWS / S3 Configuration
  const s3Bucket = process.env.S3_UPLOAD_BUCKET || process.env.AWS_BUCKET_NAME;
  if (!s3Bucket) {
    warnings.push({
      key: "S3_UPLOAD_BUCKET",
      message: "S3_UPLOAD_BUCKET is not set. Image/file uploads to Amazon S3 will fail until this is configured.",
    });
  }

  if (!process.env.AWS_REGION) {
    process.env.AWS_REGION = "eu-north-1";
  }

  // Print summary
  if (missingCritical.length > 0) {
    console.error("\n=======================================================");
    console.error("❌ CRITICAL CONFIGURATION ERROR: MISSING REQUIRED ENV VARS");
    console.error("=======================================================");
    missingCritical.forEach((err) => {
      console.error(` • ${err.key}: ${err.message}`);
    });
    console.error("=======================================================\n");

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Application cannot start in production without: ${missingCritical.map((m) => m.key).join(", ")}`
      );
    }
  }

  if (warnings.length > 0 && process.env.NODE_ENV !== "test") {
    console.warn("\n-------------------------------------------------------");
    console.warn("⚠️  ENVIRONMENT CONFIGURATION WARNINGS");
    console.warn("-------------------------------------------------------");
    warnings.forEach((warn) => {
      console.warn(` • ${warn.key}: ${warn.message}`);
    });
    console.warn("-------------------------------------------------------\n");
  }

  return {
    valid: missingCritical.length === 0,
    missingCritical,
    warnings,
  };
}

module.exports = validateEnv;
