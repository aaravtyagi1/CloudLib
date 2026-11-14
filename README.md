# CloudLib — Full-Stack E-Commerce Platform (AWS Deployment Ready)

CloudLib is a production-grade full-stack e-commerce web application engineered for deployment on Amazon Web Services (AWS).

---

## Technology Stack

| Tier | Technology | Description |
|---|---|---|
| **Frontend** | React.js (v17), Redux, Material-UI | Single Page Application with client-side routing and state management |
| **Backend** | Node.js, Express.js | REST API with JWT authentication, rate-limiting, and error handling |
| **Database** | PostgreSQL | Relational database hosted locally or on **Amazon RDS** |
| **ORM** | Prisma ORM (v5) | Type-safe database client, schema migrations, and relational queries |
| **File Storage** | Amazon S3 | Private bucket storage with presigned URLs for products and avatars |
| **Web Server / Proxy** | Nginx | Reverse proxy, static asset caching, and security header management |
| **Process Manager** | Systemd | Self-healing service daemon on Amazon Linux 2023 |
| **Secrets Management** | AWS Secrets Manager | Production credential management (`cloudlib/backend/env`) |
| **Cloud IAM** | AWS IAM Instance Role | Role-based authorization (`CloudLib-EC2-Role`) |
| **Payments** | Stripe API | Secure card payments via Stripe Payment Intents |
| **Email** | Nodemailer (SMTP) | Password recovery and email notifications |

---

## Project Structure

```text
CloudLib/
├── frontend/                     # React.js SPA source code
│   ├── src/                      # Components, Redux actions/reducers
│   ├── public/                   # Static HTML, manifest, favicons
│   ├── package.json              # Frontend scripts & dependencies
│   └── .env.example              # Frontend environment template
│
├── backend/                      # Node.js Express API source code
│   ├── config/                   # Prisma, Database, Secrets, Validator
│   ├── controllers/              # Route controllers (Product, User, Order, Payment)
│   ├── middleware/               # Auth, error handling, async wrappers
│   ├── routes/                   # Express API routes (/api/v1/*)
│   ├── utils/                    # S3 utility, JWT, user helpers, errors
│   └── server.js                 # Backend entry point (Port 4000)
│
├── prisma/                       # Database schema and migrations
│   ├── schema.prisma             # PostgreSQL schema definition
│   └── migrations/               # Production SQL migration history
│
├── aws/                          # AWS deployment configuration & automation
│   ├── scripts/
│   │   ├── bootstrap-ec2.sh      # EC2 User Data bootstrap automation
│   │   ├── deploy.sh             # In-place deployment script
│   │   └── verify-deployment.sh  # Automated health check suite
│   ├── nginx/
│   │   └── cloudlib.conf         # Production Nginx reverse proxy config
│   ├── systemd/
│   │   └── cloudlib.service      # Systemd service unit definition
│   └── iam/
│       └── ec2-role-policy.json  # IAM policy for CloudLib-EC2-Role
│
├── docs/                         # Comprehensive documentation
│   ├── AWS_DEPLOYMENT.md         # AWS Console step-by-step deployment guide
│   ├── ENV_VARIABLES.md          # Environment variable reference
│   └── TROUBLESHOOTING.md       # Diagnostic commands and resolutions
│
├── scripts/                      # Developer and DevOps scripts
│   ├── package-release.js        # Deployment ZIP packager & validator
│   ├── test-routes.js            # Express API test suite
│   └── migrate-mongo-to-postgres.js # Legacy MongoDB data migration
│
├── .env.example                  # Backend environment template
├── .gitignore                    # Git ignore rules (secrets protected)
├── .gitattributes                # Archive export rules
├── package.json                  # Root backend scripts & dependencies
└── README.md                     # Project documentation
```

---

## Local Development Setup

### Prerequisites
- Node.js (v18+)
- Local PostgreSQL instance or Docker PostgreSQL container

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/aaravtyagi1/CloudLib.git
cd CloudLib

# Install backend dependencies & generate Prisma client
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### 2. Configure Environment Variables
Copy `.env.example` to `backend/config/config.env` or `.env`:
```bash
cp .env.example backend/config/config.env
```
Fill in your local PostgreSQL `DATABASE_URL` and `JWT_SECRET`.

### 3. Run Database Migrations
```bash
npm run prisma:migrate
```

### 4. Start Development Servers
```bash
# Terminal 1: Backend API (runs on http://localhost:4000)
npm run dev

# Terminal 2: React Frontend (runs on http://localhost:3000)
cd frontend && npm start
```

---

## Testing & Verification

Run the route verification and middleware test suite:
```bash
npm test
```

Generate the verified deployment ZIP:
```bash
node scripts/package-release.js
```

---

## AWS Production Deployment

CloudLib is ready for zero-downtime deployment on AWS EC2, S3, and RDS PostgreSQL:

1. Follow the step-by-step instructions in [docs/AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md).
2. Configure environment values using [docs/ENV_VARIABLES.md](docs/ENV_VARIABLES.md).
3. If any issues arise, consult [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

## License

ISC License.
