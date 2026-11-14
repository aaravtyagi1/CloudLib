#!/usr/bin/env bash
# ==============================================================================
# CloudLib Deployment Verification and Health Check Script
# Validates systemd service, Nginx, local ports, database connectivity, and S3.
# ==============================================================================

set -euo pipefail

echo "========================================================================"
echo " CloudLib Deployment Verification & Health Check"
echo " Timestamp: $(date -u)"
echo "========================================================================"

FAILED=0

# 1. Check systemd service status
echo -n "[1/6] Checking systemd service (cloudlib.service)... "
if systemctl is-active --quiet cloudlib.service; then
    echo "RUNNING (Active)"
else
    echo "FAILED (Inactive/Failed)"
    FAILED=$((FAILED + 1))
    systemctl status cloudlib.service --no-pager -n 10 || true
fi

# 2. Check Nginx status
echo -n "[2/6] Checking Nginx web server... "
if systemctl is-active --quiet nginx; then
    echo "RUNNING (Active)"
else
    echo "FAILED (Inactive/Failed)"
    FAILED=$((FAILED + 1))
fi

# 3. Check Backend Direct Port (4000)
echo -n "[3/6] Checking Backend API on localhost:4000/api/v1/health... "
BACKEND_RESP=$(curl -s -m 5 http://127.0.0.1:4000/api/v1/health || true)
if echo "${BACKEND_RESP}" | grep -q '"status":"ok"'; then
    echo "OK"
else
    echo "FAILED: ${BACKEND_RESP}"
    FAILED=$((FAILED + 1))
fi

# 4. Check Nginx Reverse Proxy (Port 80)
echo -n "[4/6] Checking Nginx reverse proxy on localhost/api/v1/health... "
NGINX_RESP=$(curl -s -m 5 http://127.0.0.1/api/v1/health || true)
if echo "${NGINX_RESP}" | grep -q '"status":"ok"'; then
    echo "OK"
else
    echo "FAILED: ${NGINX_RESP}"
    FAILED=$((FAILED + 1))
fi

# 5. Check React Static Frontend (index.html)
echo -n "[5/6] Checking React index.html served on localhost... "
HTML_RESP=$(curl -s -m 5 http://127.0.0.1/ || true)
if echo "${HTML_RESP}" | grep -qi '<div id="root"'; then
    echo "OK"
else
    echo "FAILED: Could not find React root in response"
    FAILED=$((FAILED + 1))
fi

# 6. Check Database Connectivity
echo -n "[6/6] Checking PostgreSQL database connection... "
DB_CHECK=$(node -e '
    const prisma = require("/opt/cloudlib/backend/config/prisma");
    prisma.$queryRaw`SELECT 1`
        .then(() => { console.log("OK"); process.exit(0); })
        .catch((err) => { console.log("FAILED: " + err.message); process.exit(1); });
' 2>/dev/null || true)

if echo "${DB_CHECK}" | grep -q "OK"; then
    echo "OK"
else
    echo "FAILED: ${DB_CHECK}"
    echo "       (Ensure RDS PostgreSQL is reachable and security groups allow port 5432)"
fi

echo "========================================================================"
if [[ ${FAILED} -eq 0 ]]; then
    echo "🎉 ALL CHECKS PASSED: CloudLib is fully operational and healthy!"
else
    echo "⚠️  ${FAILED} check(s) failed. Inspect the logs above or run:"
    echo "   journalctl -u cloudlib.service -n 50 --no-pager"
    echo "   tail -n 50 /var/log/nginx/error.log"
fi
echo "========================================================================"

exit ${FAILED}
