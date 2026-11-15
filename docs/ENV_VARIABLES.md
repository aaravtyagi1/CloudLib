# CloudLib Environment Variables Reference

This document explains every configuration variable used by CloudLib, its sensitivity, where it belongs, and how it is sourced in production.

---

## Summary Table

| Variable Name | Purpose | Required? | Sensitive? | Location | Where It Comes From in Production |
|---|---|---|---|---|---|
| `NODE_ENV` | Sets application runtime mode | Yes | No | Express | AWS Secrets Manager / Systemd (`production`) |
| `PORT` | Local port Express listens on | Yes (default `4000`) | No | Express | AWS Secrets Manager / Systemd (`4000`) |
| `DATABASE_URL` | PostgreSQL connection string | Yes | **Yes** | Express | AWS RDS Endpoint + Credentials (Secrets Manager) |
| `JWT_SECRET` | Secret key for signing JWT tokens | Yes | **Yes** | Express | User-generated random 32+ char string (Secrets Manager) |
| `JWT_EXPIRE` | Expiry duration of user JWT | Yes (default `5d`) | No | Express | Secrets Manager / Defaults |
| `COOKIE_EXPIRE` | Expiry duration of session cookie | Yes (default `5`) | No | Express | Secrets Manager / Defaults |
| `AWS_REGION` | AWS Region for S3 and Secrets Manager | Yes | No | Express | EC2 Region (e.g. `eu-north-1` or `us-east-1`) |
| `S3_UPLOAD_BUCKET` | Private S3 bucket for images/avatars | Yes | No | Express | Name of created S3 uploads bucket |
| `AWS_BACKEND_SECRET_ID` | Secret ID in AWS Secrets Manager | Optional | No | Express | Default `cloudlib/backend/env` |
| `FRONTEND_URL` | Frontend origin for CORS | Optional | No | Express | EC2 Public IP / Domain (e.g. `http://54.x.x.x`) |
| `BACKEND_URL` | Backend origin for absolute links | Optional | No | Express | EC2 Public IP / Domain (e.g. `http://54.x.x.x:4000`) |
| `CORS_ORIGIN` | Allowed CORS origins | Optional | No | Express | EC2 Public IP / Domain |
| `GENERATE_SOURCEMAP` | Disables sourcemap generation in build | Optional | No | React only | `.env` (`false` reduces memory usage) |
| `DISABLE_ESLINT_PLUGIN` | Disables ESLint blocking in build | Optional | No | React only | `.env` (`true` prevents webpack build failures) |

---

## Detailed Variable Specifications

### 1. `DATABASE_URL`
- **Component:** Backend (Express + Prisma)
- **Required:** Yes
- **Sensitive:** **YES (Contains database password)**
- **Format:**
  `postgresql://<USERNAME>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>?schema=public`
- **Example RDS Value:**
  `postgresql://cloudlib_admin:MySecurePass123!@cloudlib-postgres.c123456789.eu-north-1.rds.amazonaws.com:5432/ecommerce?schema=public`
- **Notes:** Used by Prisma Client for all CRUD operations, authentication, and migrations. Never commit to Git or expose to React.

### 2. `JWT_SECRET`
- **Component:** Backend
- **Required:** Yes (in production)
- **Sensitive:** **YES**
- **Example:** `k9X$vL2#mP8*qR5!tY1^wZ4@bN7&jC3(`
- **Notes:** Used to cryptographically sign JSON Web Tokens for authenticated users and admins.

### 3. `AWS_REGION`
- **Component:** Backend
- **Required:** Yes
- **Sensitive:** No
- **Example:** `eu-north-1`
- **Notes:** Configures `@aws-sdk/client-s3` and `@aws-sdk/client-secrets-manager`.

### 4. `S3_UPLOAD_BUCKET`
- **Component:** Backend
- **Required:** Yes
- **Sensitive:** No
- **Example:** `cloudlib-uploads-1234567890`
- **Notes:** The target private Amazon S3 bucket where product images and user profile pictures are stored. All objects are accessed via signed URLs or backend resolution.

### 5. `AWS_BACKEND_SECRET_ID`
- **Component:** Backend
- **Required:** Optional (defaults to `cloudlib/backend/env`)
- **Sensitive:** No
- **Example:** `cloudlib/backend/env`
- **Notes:** Specifies the AWS Secrets Manager Secret ID retrieved at boot using the IAM instance profile (`CloudLib-EC2-Role`).

---

## Production Security Best Practices

1. **No Hardcoded Keys:** Production EC2 instances must use the IAM instance role `CloudLib-EC2-Role`. Never set `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` in production files.
2. **Secrets Manager:** All sensitive backend variables should reside in AWS Secrets Manager (`cloudlib/backend/env`).
3. **Frontend Isolation:** The React frontend receives only public configuration. Database credentials, JWT secrets, and AWS secrets are never bundled into the client build.
