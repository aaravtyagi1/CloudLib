# CloudLib Deployment Troubleshooting Guide

This guide provides targeted solutions for issues that may arise during AWS deployment or local testing.

---

## Quick Diagnostic Commands (on EC2)

```bash
# 1. View User Data bootstrap installation log
sudo cat /var/log/cloudlib-bootstrap.log

# 2. View Backend Express application logs
sudo journalctl -u cloudlib.service -n 50 --no-pager -f

# 3. View Nginx access & error logs
sudo tail -n 50 /var/log/nginx/error.log
sudo tail -n 50 /var/log/nginx/access.log

# 4. Run automated verification suite
sudo bash /opt/cloudlib/aws/scripts/verify-deployment.sh

# 5. Check listening ports
sudo ss -tulpn | grep -E ':(80|4000|5432)'
```

---

## 1. Amazon S3 Issues

### Issue: `AccessDenied` when uploading or downloading files
- **Symptoms:** `403 Forbidden` or `AccessDenied` error during image upload in product management or user registration.
- **Root Causes:**
  1. The EC2 instance IAM role `CloudLib-EC2-Role` does not have permission on the target S3 bucket.
  2. The S3 bucket name in `S3_UPLOAD_BUCKET` does not match the bucket ARN in the IAM policy.
- **Resolution:**
  - Verify your IAM role policy in IAM Console:
    ```json
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_ACTUAL_BUCKET_NAME/*"
    }
    ```
  - Verify that `CloudLib-EC2-Role` is attached to your EC2 instance (`EC2 Console > Actions > Security > Modify IAM role`).
  - Check the bucket name in your Secrets Manager secret `S3_UPLOAD_BUCKET`.

### Issue: `S3 upload failed: S3_UPLOAD_BUCKET environment variable is not configured`
- **Symptoms:** Server logs show missing bucket variable.
- **Resolution:** Add `S3_UPLOAD_BUCKET=your-bucket-name` to your AWS Secrets Manager secret (`cloudlib/backend/env`) or `/opt/cloudlib/backend/config/config.env`, then restart the service:
  ```bash
  sudo systemctl restart cloudlib.service
  ```

---

## 2. Amazon RDS PostgreSQL Issues

### Issue: `RDS connection timeout` / Prisma Cannot reach database
- **Symptoms:** Prisma fails to connect or logs show `Can't reach database server at cloudlib-postgres...:5432`.
- **Root Causes:**
  1. EC2 cannot reach RDS over port 5432 due to security group rules.
  2. RDS instance is in a different VPC without VPC peering.
  3. RDS is still in `Creating` status.
- **Resolution:**
  - Check the **RDS Security Group** (`cloudlib-rds-sg`): It must have an Inbound Rule allowing TCP port 5432 with Source set to the **EC2 Security Group** (`cloudlib-ec2-sg`).
  - Test direct TCP connectivity from EC2:
    ```bash
    nc -zv your-rds-endpoint.rds.amazonaws.com 5432
    ```
  - Verify that both EC2 and RDS reside in the **same VPC**.

### Issue: `PostgreSQL authentication failed for user`
- **Symptoms:** `P1000: Authentication failed against database server`.
- **Resolution:**
  - Verify the username and password in `DATABASE_URL`.
  - If your database password contains special characters (e.g. `@`, `:`, `/`, `?`, `#`), they must be **URL-encoded** (e.g. `@` becomes `%40`, `#` becomes `%23`).

### Issue: `Prisma migration failure`
- **Symptoms:** `prisma migrate deploy` fails with an error during EC2 bootstrap.
- **Resolution:**
  - Run the migration manually on EC2 to inspect the output:
    ```bash
    cd /opt/cloudlib
    DATABASE_URL="postgresql://user:pass@host:5432/ecommerce?schema=public" npx prisma migrate deploy
    ```
  - If schema tables were already created manually, mark the initial migration as applied:
    ```bash
    npx prisma migrate resolve --applied "0_init"
    ```

---

## 3. Nginx and Proxy Issues

### Issue: `502 Bad Gateway` on `/api/v1/...`
- **Symptoms:** Nginx returns `502 Bad Gateway` when React tries to call API endpoints.
- **Root Causes:**
  1. The Node.js Express backend is stopped or crashed.
  2. Express is running on a different port than 4000.
- **Resolution:**
  - Check backend status:
    ```bash
    sudo systemctl status cloudlib.service
    ```
  - Test if Express is responding locally on port 4000:
    ```bash
    curl -I http://127.0.0.1:4000/api/v1/health
    ```
  - If Express crashed, view the crash stack trace:
    ```bash
    sudo journalctl -u cloudlib.service -n 50 --no-pager
    ```

### Issue: React routes return 404 on page refresh (e.g. `/products`, `/account`)
- **Symptoms:** Refreshing any React page other than `/` returns an Nginx 404 page.
- **Resolution:** Ensure `try_files $uri $uri/ /index.html;` is present in `/etc/nginx/conf.d/cloudlib.conf` inside the `location /` block.

---

## 4. EC2 User Data and Bootstrap Issues

### Issue: EC2 instance launches but application does not start
- **Symptoms:** Navigating to EC2 public IP shows nothing or standard Apache test page.
- **Resolution:**
  - Connect to EC2 via SSH and check the bootstrap log:
    ```bash
    sudo cat /var/log/cloudlib-bootstrap.log
    ```
  - Common reasons:
    1. Deployment bucket name placeholder was not replaced in the user data script.
    2. S3 release ZIP was not uploaded before launching EC2.
    3. IAM role `CloudLib-EC2-Role` was not attached to the instance at launch.

---

## 5. React Frontend Build Issues

### Issue: `ERR_OSSL_EVP_UNSUPPORTED` during `react-scripts build`
- **Symptoms:** Build crashes with OpenSSL digital envelope unsupported error on Node >= 17.
- **Resolution:** CloudLib includes automatic handling via `NODE_OPTIONS="--openssl-legacy-provider"`. In any custom build step, run:
  ```bash
  export NODE_OPTIONS="--openssl-legacy-provider"
  export DISABLE_ESLINT_PLUGIN="true"
  npm run build
  ```

### Issue: `Environment key "jest/globals" is unknown`
- **Symptoms:** Webpack compilation fails during ESLint validation.
- **Resolution:** This was resolved by updating `frontend/package.json` to extend only `["react-app"]` and setting `DISABLE_ESLINT_PLUGIN=true` in `frontend/.env`.

---

## 6. Migration & Legacy Data Issues

### Issue: Legacy Cloudinary images in existing database records
- **Symptoms:** Existing products have image URLs starting with `https://res.cloudinary.com/...`.
- **Resolution:**
  - The S3 resolution utility in `backend/utils/s3.js` automatically checks if an image URL starts with `http://` or `https://`.
  - Cloudinary URLs are passed directly through to the client without alteration.
  - New uploads are stored in Amazon S3 as clean object keys (`products/uuid.jpg`).
  - No database migration or data alteration is required for existing Cloudinary image records.
