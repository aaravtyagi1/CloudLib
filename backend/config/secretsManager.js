/**
 * AWS Secrets Manager Loader
 * Retrieves production configuration from AWS Secrets Manager secret:
 * default: "cloudlib/backend/env"
 *
 * Supports both JSON (key-value) and plaintext dotenv format.
 * Never logs sensitive secret values.
 */

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

async function loadSecrets() {
  const secretId = process.env.AWS_BACKEND_SECRET_ID || "cloudlib/backend/env";
  const region = process.env.AWS_REGION || "eu-north-1";

  // In local development or if AWS_BACKEND_SECRET_ID is explicitly disabled ("none" or "disabled")
  if (
    process.env.NODE_ENV !== "production" &&
    !process.env.AWS_BACKEND_SECRET_ID
  ) {
    return false;
  }

  if (process.env.AWS_BACKEND_SECRET_ID === "disabled" || process.env.AWS_BACKEND_SECRET_ID === "none") {
    return false;
  }

  console.log(`[SecretsManager] Attempting to load configuration from secret: "${secretId}" in region: "${region}"...`);

  try {
    const client = new SecretsManagerClient({ region });
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretId,
      })
    );

    if (!response.SecretString) {
      console.warn(`[SecretsManager] Secret "${secretId}" contained no SecretString.`);
      return false;
    }

    const raw = response.SecretString.trim();

    // 1. Try parsing as JSON first
    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const parsed = JSON.parse(raw);
        let loadedCount = 0;
        for (const [key, value] of Object.entries(parsed)) {
          if (value !== undefined && value !== null) {
            process.env[key] = String(value);
            loadedCount++;
          }
        }
        console.log(`[SecretsManager] Successfully loaded ${loadedCount} environment variables from JSON secret.`);
        return true;
      } catch (e) {
        // Fall back to line-by-line parsing if JSON parse failed
      }
    }

    // 2. Parse as dotenv KEY=VALUE lines
    const lines = raw.split(/\r?\n/);
    let loadedCount = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const equalIndex = trimmed.indexOf("=");
      if (equalIndex > 0) {
        const key = trimmed.slice(0, equalIndex).trim();
        let val = trimmed.slice(equalIndex + 1).trim();

        // Strip surrounding quotes if present
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }

        process.env[key] = val;
        loadedCount++;
      }
    }

    console.log(`[SecretsManager] Successfully loaded ${loadedCount} environment variables from dotenv secret.`);
    return true;
  } catch (error) {
    // If Secrets Manager access fails (e.g. no IAM role attached or not in AWS), log a safe warning
    console.warn(`[SecretsManager] Could not load secret "${secretId}": ${error.message}`);
    console.warn(`[SecretsManager] Proceeding with existing environment / config.env file.`);
    return false;
  }
}

module.exports = { loadSecrets };
