#!/usr/bin/env bash
# ==============================================================================
# CloudLib In-Place EC2 Deployment / Update Script
# Use this script on EC2 to update CloudLib to a new release artifact from S3.
# ==============================================================================

set -euo pipefail

DEPLOYMENT_BUCKET="${1:-${DEPLOYMENT_BUCKET:-your-cloudlib-deployment-bucket}}"
RELEASE_ZIP_KEY="${2:-${RELEASE_ZIP_KEY:-cloudlib-release.zip}}"
AWS_REGION="${3:-${AWS_REGION:-eu-north-1}}"
APP_DIR="/opt/cloudlib"

echo "=== Updating CloudLib from s3://${DEPLOYMENT_BUCKET}/${RELEASE_ZIP_KEY} ==="

# 1. Download new release
echo "Downloading release archive..."
cd /tmp
aws s3 cp "s3://${DEPLOYMENT_BUCKET}/${RELEASE_ZIP_KEY}" /tmp/cloudlib-update.zip --region "${AWS_REGION}"

# 2. Extract into application directory
echo "Extracting release..."
unzip -o -q /tmp/cloudlib-update.zip -d "${APP_DIR}"
rm -f /tmp/cloudlib-update.zip

cd "${APP_DIR}"
chown -R ec2-user:ec2-user "${APP_DIR}"

# 3. Update backend dependencies & Prisma
echo "Installing backend dependencies..."
npm install --omit=dev
npx prisma generate

# 4. Safe database migration
if [[ -f "${APP_DIR}/backend/config/config.env" ]]; then
    export $(grep -v '^#' "${APP_DIR}/backend/config/config.env" | xargs) || true
fi
if [[ -n "${DATABASE_URL:-}" ]]; then
    echo "Applying database migrations..."
    npx prisma migrate deploy
fi

# 5. Build frontend
echo "Building React frontend..."
cd "${APP_DIR}/frontend"
npm install --omit=dev || npm install
export NODE_OPTIONS="--openssl-legacy-provider"
export DISABLE_ESLINT_PLUGIN="true"
npm run build

cd "${APP_DIR}"
chown -R ec2-user:ec2-user "${APP_DIR}"

# 6. Restart backend service
echo "Restarting cloudlib.service..."
systemctl restart cloudlib.service

# 7. Reload Nginx
echo "Reloading Nginx..."
nginx -t && systemctl reload nginx

# 8. Verify
sleep 3
if curl -s -f http://127.0.0.1:4000/api/v1/health > /dev/null 2>&1; then
    echo "✓ CloudLib backend is healthy and running!"
else
    echo "⚠️  Backend health check failed. Run 'journalctl -u cloudlib -n 20' for details."
fi

echo "=== Deployment update completed! ==="
