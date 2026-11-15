# AWS Deployment Guide for CloudLib

This guide provides step-by-step instructions for deploying CloudLib on Amazon Web Services (AWS) using the AWS Management Console.

---

## Architecture Overview

```
                      Internet
                         │
                         ▼
             [ Amazon EC2 Instance ]
             │  - Nginx (Port 80)
             │      ├── Serves React Production Build (/opt/cloudlib/frontend/build)
             │      └── Reverse Proxies /api/v1 -> Express API (Port 4000)
             │  - Node.js Express App (Port 4000)
             │  - IAM Instance Role (CloudLib-EC2-Role)
             │
             ├──► [ AWS Secrets Manager ] (cloudlib/backend/env)
             │
             ├──► [ Amazon S3 Uploads Bucket ] (Private: avatars, product images)
             │
             └──► [ Amazon RDS PostgreSQL ] (Private Subnet, Port 5432)
```

---

## Step 1: Create Amazon S3 Buckets

You need **two private S3 buckets** (or one bucket with distinct prefixes):
1. **Deployment Bucket:** Holds `cloudlib-release.zip`
2. **Uploads Bucket:** Stores application files (product images, user avatars)

### In AWS Management Console:
1. Navigate to **Amazon S3** (`Services > Storage > S3`).
2. Click **Create bucket**.
3. **Deployment Bucket:**
   - **Bucket name:** `cloudlib-deployments-<your-account-id>` (e.g. `cloudlib-deploy-1234567890`)
   - **AWS Region:** Select your preferred region (e.g. `eu-north-1` Stockholm or `us-east-1` N. Virginia).
   - **Block Public Access settings:** Keep **Block all public access** checked (ENABLED).
   - **Bucket Versioning:** Recommended: Enable.
   - Click **Create bucket**.
4. **Uploads Bucket:**
   - Click **Create bucket**.
   - **Bucket name:** `cloudlib-uploads-<your-account-id>` (e.g. `cloudlib-uploads-1234567890`)
   - **AWS Region:** Same region as above.
   - **Block Public Access settings:** Keep **Block all public access** checked (ENABLED). Keep buckets private; files are securely accessed via backend presigned URLs.
   - **CORS Configuration (Uploads Bucket only):**
     - Open the bucket > **Permissions** tab > scroll down to **Cross-origin resource sharing (CORS)** > Click **Edit**.
     - Paste:
       ```json
       [
         {
           "AllowedHeaders": ["*"],
           "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
           "AllowedOrigins": ["*"],
           "ExposeHeaders": ["ETag"]
         }
       ]
       ```
     - Click **Save changes**.

---

## Step 2: Upload Deployment ZIP to S3

1. In the S3 Console, open your **Deployment Bucket** (`cloudlib-deployments-...`).
2. Click **Upload** > **Add files**.
3. Select `cloudlib-release.zip` generated from your repository.
4. Click **Upload**.
5. Note the S3 URI: `s3://your-deployment-bucket/cloudlib-release.zip`.

---

## Step 3: Create the IAM Instance Role (`CloudLib-EC2-Role`)

This role allows your EC2 instance to download the deployment ZIP, read Secrets Manager, and read/write to your S3 uploads bucket without embedding AWS access keys.

### 1. Create the Custom Policy:
1. Navigate to **IAM** (`Services > Security, Identity, & Compliance > IAM`).
2. Click **Policies** > **Create policy**.
3. Select the **JSON** tab.
4. Paste the contents from [`aws/iam/ec2-role-policy.json`](../aws/iam/ec2-role-policy.json), replacing:
   - `YOUR_DEPLOYMENT_BUCKET_NAME` with your deployment bucket name.
   - `YOUR_UPLOADS_BUCKET_NAME` with your uploads bucket name.
   - `YOUR_ACCOUNT_ID` with your 12-digit AWS Account ID.
   - `eu-north-1` with your AWS region if different.
5. Click **Next**.
6. **Policy name:** `CloudLib-EC2-App-Policy`.
7. Click **Create policy**.

### 2. Create the Role:
1. In IAM, click **Roles** > **Create role**.
2. **Trusted entity type:** Select **AWS service**.
3. **Common use cases:** Select **EC2** > Click **Next**.
4. **Add permissions:** Search for and select:
   - `CloudLib-EC2-App-Policy` (your custom policy created above)
   - `AmazonSSMManagedInstanceCore` (optional, for secure AWS Systems Manager session access without SSH keys)
5. Click **Next**.
6. **Role name:** `CloudLib-EC2-Role`.
7. Click **Create role**.

---

## Step 4: Create Secrets Manager Secret (`cloudlib/backend/env`)

1. Navigate to **AWS Secrets Manager** (`Services > Security > Secrets Manager`).
2. Click **Store a new secret**.
3. **Secret type:** Select **Other type of secret**.
4. **Key/value pairs** or **Plaintext**:
   - You can enter Key/Value pairs, or click **Plaintext** and paste your environment configuration.
   - Required keys:
     ```
     NODE_ENV=production
     PORT=4000
     DATABASE_URL=postgresql://<RDS_USER>:<RDS_PASSWORD>@<RDS_ENDPOINT>:5432/<RDS_DB_NAME>?schema=public
     JWT_SECRET=<RANDOM_STRONG_32_CHAR_STRING>
     JWT_EXPIRE=5d
     COOKIE_EXPIRE=5
     AWS_REGION=eu-north-1
     S3_UPLOAD_BUCKET=cloudlib-uploads-<account-id>
     ```
5. Click **Next**.
6. **Secret name:** `cloudlib/backend/env`.
7. Click **Next** > **Next** (leave automatic rotation disabled initially) > Click **Store**.

---

## Step 5: Configure Amazon RDS PostgreSQL

### 1. RDS Security Group:
1. Navigate to **EC2** > **Security Groups** > **Create security group**.
2. **Security group name:** `cloudlib-rds-sg`.
3. **VPC:** Select your target VPC (default VPC or custom VPC).
4. **Inbound rules:**
   - **Type:** PostgreSQL (TCP 5432)
   - **Source:** Custom > Select the EC2 Security Group ID (`cloudlib-ec2-sg`) created in Step 6.
5. Click **Create security group**.

### 2. Launch RDS PostgreSQL:
1. Navigate to **Amazon RDS** > **Databases** > **Create database**.
2. **Engine type:** **PostgreSQL** (version 15 or 16).
3. **Templates:** **Free tier** (or Production / Dev/Test).
4. **DB instance identifier:** `cloudlib-postgres`.
5. **Master username:** `postgres` (or `cloudlib_admin`).
6. **Master password:** Set a strong password (and save it for your `DATABASE_URL`).
7. **Instance configuration:** `db.t4g.micro` or `db.t3.micro`.
8. **Connectivity:**
   - **VPC:** Same VPC as EC2.
   - **Public access:** **No** (keeps database private).
   - **VPC security group:** Choose **Existing** > Select `cloudlib-rds-sg`.
9. **Additional configuration:**
   - **Initial database name:** `ecommerce` (or `cloudlib`).
10. Click **Create database**.
11. Once the database status changes to **Available**, copy the **Endpoint** (e.g. `cloudlib-postgres.c123456789.eu-north-1.rds.amazonaws.com`).
12. Update `DATABASE_URL` in your AWS Secrets Manager secret:
    ```
    DATABASE_URL=postgresql://postgres:<PASSWORD>@<ENDPOINT>:5432/ecommerce?schema=public
    ```

---

## Step 6: Launch Amazon EC2 Instance

### 1. EC2 Security Group:
1. Go to **EC2** > **Security Groups** > **Create security group**.
2. **Name:** `cloudlib-ec2-sg`.
3. **Inbound rules:**
   - **HTTP (TCP 80):** Source `0.0.0.0/0` (public web traffic)
   - **HTTPS (TCP 443):** Source `0.0.0.0/0` (for future SSL)
   - **SSH (TCP 22):** Source `My IP` (recommended for secure SSH access)
4. Click **Create security group**.

### 2. Launch Instance:
1. Navigate to **EC2** > **Instances** > **Launch instances**.
2. **Name:** `CloudLib-Production-Server`.
3. **Application and OS Images:** **Amazon Linux 2023 AMI** (AL2023 x86_64).
4. **Instance type:** `t3.small` or `t3.medium` (recommended for compiling React and running Node.js). `t3.micro` requires swap memory for webpack builds.
5. **Key pair:** Choose your existing key pair or create one.
6. **Network settings:**
   - **VPC:** Same VPC as RDS.
   - **Subnet:** Select a **Public subnet**.
   - **Auto-assign public IP:** **Enable**.
   - **Security groups:** Select `cloudlib-ec2-sg`.
7. **Configure storage:** At least 20 GiB gp3.
8. **Advanced details:**
   - **IAM instance profile:** Select `CloudLib-EC2-Role`.
   - **User data:** Scroll down to **User data** and paste the contents of [`aws/scripts/bootstrap-ec2.sh`](../aws/scripts/bootstrap-ec2.sh).
   - **Edit the configuration variables at the top of the user data script**:
     ```bash
     DEPLOYMENT_BUCKET="your-actual-deployment-bucket-name"
     RELEASE_ZIP_KEY="cloudlib-release.zip"
     AWS_REGION="eu-north-1"
     SECRET_ID="cloudlib/backend/env"
     ```
9. Click **Launch instance**.

---

## Step 7: Verify the Deployment

1. Wait 3–5 minutes for the EC2 instance to launch, execute the user data script, run database migrations, and start services.
2. In the EC2 Console, select the instance and copy its **Public IPv4 address**.
3. Open a browser and navigate to:
   - `http://<EC2-PUBLIC-IP>/` -> React Frontend
   - `http://<EC2-PUBLIC-IP>/api/v1/health` -> `{"status":"ok","service":"CloudLib API",...}`
4. To verify via SSH:
   ```bash
   ssh -i your-key.pem ec2-user@<EC2-PUBLIC-IP>
   sudo bash /opt/cloudlib/aws/scripts/verify-deployment.sh
   ```
5. View bootstrap logs on EC2:
   ```bash
   tail -f /var/log/cloudlib-bootstrap.log
   ```
6. View backend systemd logs:
   ```bash
   journalctl -u cloudlib.service -f
   ```

---

## Step 8: Updating the Application Later

To deploy updates without recreating the instance:
1. Make your code changes and commit them.
2. Build a new release:
   ```bash
   node scripts/package-release.js
   ```
3. Upload `cloudlib-release.zip` to your S3 deployment bucket:
   ```bash
   aws s3 cp cloudlib-release.zip s3://your-deployment-bucket/cloudlib-release.zip
   ```
4. On your EC2 instance, execute the in-place deployment script:
   ```bash
   sudo bash /opt/cloudlib/aws/scripts/deploy.sh your-deployment-bucket cloudlib-release.zip
   ```
