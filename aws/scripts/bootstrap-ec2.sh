#!/usr/bin/env bash
# ==============================================================================
# CloudLib EC2 User Data Bootstrap Script
# Operating System: Amazon Linux 2023
# Description: Automates the complete initial installation, configuration,
#              database migration, and service startup for CloudLib.
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# 1. USER CONFIGURATION PLACEHOLDERS
# ------------------------------------------------------------------------------
# Replace these values with your actual AWS resource names before launching EC2:
DEPLOYMENT_BUCKET="${DEPLOYMENT_BUCKET:-your-cloudlib-deployment-bucket}"
RELEASE_ZIP_KEY="${RELEASE_ZIP_KEY:-cloudlib-release.zip}"
AWS_REGION="${AWS_REGION:-eu-north-1}"
SECRET_ID="${SECRET_ID:-cloudlib/backend/env}"
APP_DIR="/opt/cloudlib"
LOG_FILE="/var/log/cloudlib-bootstrap.log"

# Redirect all stdout & stderr to log file as well as console
exec > >(tee -a "${LOG_FILE}") 2>&1

echo "========================================================================"
echo " CloudLib Deployment Bootstrap Started: $(date -u)"
echo " OS: Amazon Linux 2023 | Region: ${AWS_REGION}"
echo "========================================================================"

# ------------------------------------------------------------------------------
# 2. SYSTEM UPDATES & DEPENDENCIES
# ------------------------------------------------------------------------------
echo "[Step 1/10] Updating packages and installing system dependencies..."
dnf update -y
dnf install -y nginx unzip git tar

# Install Node.js 20 LTS
echo "[Step 2/10] Installing Node.js 20 LTS..."
dnf install -y nodejs20 npm

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"
echo "Nginx version: $(nginx -v 2>&1)"

# ------------------------------------------------------------------------------
# 3. PREPARE APPLICATION DIRECTORY
# ------------------------------------------------------------------------------
echo "[Step 3/10] Setting up application directory at ${APP_DIR}..."
mkdir -p "${APP_DIR}"
chown -R ec2-user:ec2-user "${APP_DIR}"

# ------------------------------------------------------------------------------
# 4. DOWNLOAD RELEASE ARTIFACT FROM S3 (USING IAM INSTANCE ROLE)
# ------------------------------------------------------------------------------
echo "[Step 4/10] Downloading deployment ZIP from s3://${DEPLOYMENT_BUCKET}/${RELEASE_ZIP_KEY}..."
cd /tmp
aws s3 cp "s3://${DEPLOYMENT_BUCKET}/${RELEASE_ZIP_KEY}" /tmp/cloudlib-release.zip --region "${AWS_REGION}"

echo "Extracting release ZIP to ${APP_DIR}..."
unzip -o -q /tmp/cloudlib-release.zip -d "${APP_DIR}"
rm -f /tmp/cloudlib-release.zip

cd "${APP_DIR}"
chown -R ec2-user:ec2-user "${APP_DIR}"

# Verify required project files
echo "Verifying project structure..."
if [[ ! -f "${APP_DIR}/package.json" || ! -f "${APP_DIR}/backend/server.js" || ! -f "${APP_DIR}/backend/package.json" ]]; then
    echo "❌ ERROR: Invalid deployment package. Missing package.json, backend/server.js, or backend/package.json!"
    exit 1
fi

# ------------------------------------------------------------------------------
# 5. RETRIEVE PRODUCTION ENVIRONMENT FROM AWS SECRETS MANAGER
# ------------------------------------------------------------------------------
echo "[Step 5/10] Fetching production secrets from AWS Secrets Manager (${SECRET_ID})..."
mkdir -p "${APP_DIR}/backend/config"

SECRET_OUTPUT=$(aws secretsmanager get-secret-value --secret-id "${SECRET_ID}" --query SecretString --output text --region "${AWS_REGION}" || true)

if [[ -n "${SECRET_OUTPUT}" && "${SECRET_OUTPUT}" != "None" ]]; then
    # Check if SecretString is JSON
    if echo "${SECRET_OUTPUT}" | grep -q '^[[:space:]]*{'; then
        echo "Parsing JSON secret into config.env..."
        node -e '
            const fs = require("fs");
            const raw = process.argv[1];
            try {
                const parsed = JSON.parse(raw);
                const lines = Object.entries(parsed).map(([k, v]) => `${k}=${v}`);
                fs.writeFileSync("'"${APP_DIR}"'/backend/config/config.env", lines.join("\n") + "\n");
                console.log("Successfully wrote JSON secret to backend/config/config.env");
            } catch (err) {
                console.error("Failed to parse JSON secret:", err.message);
                process.exit(1);
            }
        ' "${SECRET_OUTPUT}"
    else
        echo "Writing plaintext secret to backend/config/config.env..."
        echo "${SECRET_OUTPUT}" > "${APP_DIR}/backend/config/config.env"
    fi
    chmod 600 "${APP_DIR}/backend/config/config.env"
    chown ec2-user:ec2-user "${APP_DIR}/backend/config/config.env"
    echo "✓ Environment configuration saved securely."
else
    echo "⚠️  WARNING: Could not fetch secret ${SECRET_ID} or secret is empty."
    echo "Ensure CloudLib-EC2-Role has secretsmanager:GetSecretValue permission."
fi

# ------------------------------------------------------------------------------
# 6. INSTALL BACKEND DEPENDENCIES & PRISMA CLIENT
# ------------------------------------------------------------------------------
echo "[Step 6/10] Installing backend dependencies..."
cd "${APP_DIR}/backend"
npm install --omit=dev

echo "Generating Prisma Client..."
npx prisma generate

cd "${APP_DIR}"

# ------------------------------------------------------------------------------
# 7. APPLY POSTGRESQL DATABASE MIGRATIONS SAFELY
# ------------------------------------------------------------------------------
echo "[Step 7/10] Applying PostgreSQL migrations..."
if [[ -f "${APP_DIR}/backend/config/config.env" ]]; then
    export $(grep -v '^#' "${APP_DIR}/backend/config/config.env" | xargs) || true
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "Running 'prisma migrate deploy' to apply pending migrations safely without data loss..."
    cd "${APP_DIR}/backend"
    npx prisma migrate deploy || {
        echo "⚠️  Prisma migrate deploy encountered an error. Check database connectivity."
    }
    cd "${APP_DIR}"
else
    echo "⚠️  DATABASE_URL is not set yet. Skipping migration. Run 'npm run prisma:migrate' after setting DATABASE_URL."
fi

# ------------------------------------------------------------------------------
# 8. BUILD REACT FRONTEND
# ------------------------------------------------------------------------------
echo "[Step 8/10] Installing frontend dependencies and building production assets..."
cd "${APP_DIR}/frontend"
npm install --omit=dev || npm install
export NODE_OPTIONS="--openssl-legacy-provider"
export DISABLE_ESLINT_PLUGIN="true"
npm run build

echo "Frontend build completed. Verifying ${APP_DIR}/frontend/build/index.html..."
if [[ ! -f "${APP_DIR}/frontend/build/index.html" ]]; then
    echo "❌ ERROR: Frontend build failed to generate index.html!"
    exit 1
fi
echo "✓ Frontend build verified."

cd "${APP_DIR}"
chown -R ec2-user:ec2-user "${APP_DIR}"

# ------------------------------------------------------------------------------
# 9. CONFIGURE NGINX AND SYSTEMD SERVICE
# ------------------------------------------------------------------------------
echo "[Step 9/10] Configuring systemd service and Nginx reverse proxy..."

# Deploy systemd service unit
if [[ -f "${APP_DIR}/aws/systemd/cloudlib.service" ]]; then
    cp "${APP_DIR}/aws/systemd/cloudlib.service" /etc/systemd/system/cloudlib.service
else
    cat <<'SERVICE' > /etc/systemd/system/cloudlib.service
[Unit]
Description=CloudLib Backend Express Application
After=network.target

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=/opt/cloudlib
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=PATH=/usr/bin:/usr/local/bin:/bin
EnvironmentFile=-/opt/cloudlib/backend/config/config.env
ExecStart=/usr/bin/node backend/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cloudlib-backend
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE
fi

systemctl daemon-reload
systemctl enable cloudlib.service
systemctl restart cloudlib.service

# Deploy Nginx configuration
if [[ -f "${APP_DIR}/aws/nginx/cloudlib.conf" ]]; then
    cp "${APP_DIR}/aws/nginx/cloudlib.conf" /etc/nginx/conf.d/cloudlib.conf
    # Remove default server if present
    rm -f /etc/nginx/conf.d/default.conf || true
fi

# Test Nginx syntax
nginx -t
systemctl enable nginx
systemctl restart nginx

# ------------------------------------------------------------------------------
# 10. HEALTH CHECK VERIFICATION
# ------------------------------------------------------------------------------
echo "[Step 10/10] Running health checks..."
sleep 5

# Check Backend Port 4000
HEALTH_OK=false
for i in {1..12}; do
    if curl -s -f http://127.0.0.1:4000/api/v1/health > /dev/null 2>&1; then
        HEALTH_OK=true
        echo "✓ Backend API health check passed on port 4000!"
        break
    fi
    echo "Waiting for backend service to respond... ($i/12)"
    sleep 3
done

if [[ "${HEALTH_OK}" != "true" ]]; then
    echo "⚠️  Backend health check timed out. Checking systemd logs:"
    journalctl -u cloudlib.service -n 30 --no-pager
fi

# Check Nginx Port 80
if curl -s -f http://127.0.0.1/api/v1/health > /dev/null 2>&1; then
    echo "✓ Nginx reverse proxy health check passed on port 80!"
else
    echo "⚠️  Nginx proxy to /api/v1/health failed. Check /var/log/nginx/error.log."
fi

echo "========================================================================"
echo " CloudLib Deployment Bootstrap Finished: $(date -u)"
echo " Log file preserved at: ${LOG_FILE}"
echo "========================================================================"
