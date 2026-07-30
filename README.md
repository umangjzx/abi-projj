# 🥛 Thuthi Dairy — Market Analysis & Product Recommendation System

A production-ready, full-stack web application for **Thuthi Dairy Private Limited** — a farm-fresh dairy storefront with a hybrid product recommendation engine and a full market-analysis / business-intelligence admin panel.

> Built as a modern, from-scratch alternative to [butterman.in](https://butterman.in/) — domain/business-flow reference only, no code, design, or content was copied.

---

## 📐 Architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Client Layer"]
        Browser["Customer / Admin Browser"]
    end

    subgraph Frontend["Frontend — React 18 + Vite (Vercel)"]
        Store["Customer Storefront\nHome · Search · Cart · Checkout · Orders"]
        Admin["Admin Panel\nDashboard · Analytics · CRUD · Reports"]
        Query["TanStack Query\n(cache + data fetching)"]
    end

    subgraph Backend["Backend — Node.js + Express (Render / Railway)"]
        API["REST API\n/api/v1/*"]
        Auth["Auth Module\nJWT + Refresh + OTP + RBAC"]
        Catalog["Catalog / Cart / Orders"]
        RecEngine["Recommendation Engine\nPopularity · Affinity · Collaborative\nPurchase History · Trending"]
        Analytics["Analytics & Forecast Engine\nKPIs · Seasonality · Linear Regression"]
        Reports["Report Generator\nPDF (PDFKit) · Excel (ExcelJS) · CSV"]
        Jobs["Scheduled Jobs\nSnapshots · Segments · Affinities"]
    end

    subgraph Data["Data Layer"]
        Postgres[("PostgreSQL\nvia Prisma ORM\n31 models")]
        Cloudinary["Cloudinary\n(product images)"]
        SMTP["SMTP / Mail\n(OTP, order emails)"]
    end

    Browser -->|HTTPS| Store
    Browser -->|HTTPS| Admin
    Store --> Query
    Admin --> Query
    Query -->|fetch + JWT| API

    API --> Auth
    API --> Catalog
    API --> RecEngine
    API --> Analytics
    API --> Reports

    Auth --> Postgres
    Catalog --> Postgres
    RecEngine --> Postgres
    Analytics --> Postgres
    Reports --> Postgres
    Jobs --> Postgres

    Catalog -.->|uploads| Cloudinary
    Auth -.->|verification / reset| SMTP

    style Client fill:#0d9488,color:#fff
    style Frontend fill:#0f766e,color:#fff
    style Backend fill:#134e4a,color:#fff
    style Data fill:#1e293b,color:#fff
```

### Request flow (checkout example)

```mermaid
sequenceDiagram
    participant U as Customer
    participant W as Storefront (React)
    participant A as API (Express)
    participant D as PostgreSQL

    U->>W: Click "Place order"
    W->>A: POST /api/v1/orders (JWT)
    A->>A: Validate cart, address, coupon
    A->>D: BEGIN TRANSACTION
    A->>D: Decrement stock (conditional update)
    A->>D: Create Order + OrderItems + Payment
    A->>D: Update coupon usage + customer totals
    A->>D: COMMIT
    A-->>W: 201 Created { order }
    A--)D: (async) recompute recommendations, affinities, notifications, email
    W-->>U: Redirect to order confirmation
```

---

## ✨ Features

### Customer Storefront
- Registration, login, email OTP verification, forgot/reset password
- Product catalog with search, category/price/rating/stock filters, sort
- Product detail page with variants, reviews, ratings, related products
- Cart, coupons, free-delivery threshold, GST calculation
- Checkout with saved addresses and multiple payment methods (UPI/Card/NetBanking/Wallet/COD)
- Order tracking with a live status timeline + PDF invoice download
- Wishlist, product comparison (up to 4), recently viewed
- **Personalized recommendations** on Home, Product page, Cart, Checkout and Dashboard
- Reviews & ratings, notifications, dark mode, fully responsive

### Admin Panel
- Real-time dashboard (revenue, orders, customers, AOV, inventory alerts)
- **Market Analysis**: sales trend, seasonal index, order heat map (weekday × hour), category performance, customer growth/retention/segments, top customers, revenue by city, payment mix, and a **statistical sales forecast** (linear regression + day-of-week seasonality with confidence bands)
- Product / category / inventory CRUD with stock ledger and low-stock alerts
- Order management with a guarded status-transition workflow
- Customer management with RFM-style segmentation (New/Active/Loyal/At-risk/Churned)
- Coupons & promotional offers management
- **Recommendation monitoring**: impression → click → cart → purchase funnel per strategy, top product affinities, coverage stats
- Reports: Sales / Revenue / Products / Customers / Inventory / Recommendation performance — exportable to **PDF, Excel, CSV**
- Full audit/activity log of every admin action

### Recommendation Engine (hybrid, explainable)
| Strategy | Signal |
|---|---|
| `POPULAR` | Recency-weighted bestsellers |
| `TRENDING` | 14-day sales velocity vs. prior 14 days |
| `PURCHASE_HISTORY` | Reorder prompts based on past orders |
| `CATEGORY_AFFINITY` | Unbought products in the customer's top categories |
| `FREQUENTLY_BOUGHT_TOGETHER` | Pre-computed item-to-item co-occurrence |
| `COLLABORATIVE` | User-user cosine similarity over purchase sets |
| `RECENTLY_VIEWED` | Category siblings of recently browsed items |

All strategies are blended per placement (Home/Product/Cart/Checkout/Dashboard/Search), de-duplicated, and every suggestion carries a human-readable reason (e.g. *"You've ordered this 6 times"*).

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Radix UI (ShadCN-style), React Router, TanStack Query, Framer Motion, Recharts |
| Backend | Node.js, Express, TypeScript, Zod validation |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (access + refresh), bcrypt, OTP email verification, CSRF double-submit |
| Storage | Cloudinary (falls back to local disk automatically if not configured) |
| Reports | PDFKit, ExcelJS |
| Deployment | Frontend → Vercel · Backend → Render/Railway · DB → managed PostgreSQL |

---

## 🔑 Demo Credentials

Seeded automatically by `npm run db:seed` (or `npm run db:setup`) — use these to log in immediately. **Every customer account uses the same password: `Customer@123`.**

### Admin

| Email | Password |
|---|---|
| `admin@thuthidairy.com` | `Admin@123` |

### Customers

All passwords are `Customer@123`. The `profile` column shows the buying behaviour seeded for that account (useful for testing the recommendation engine and RFM segmentation — `loyal` accounts have the richest order/recommendation history).

| Name | Email | Password | City | Profile |
|---|---|---|---|---|
| Priya Raghavan | `priya@example.com` | `Customer@123` | Coimbatore | loyal |
| Arun Kumar | `arun@example.com` | `Customer@123` | Coimbatore | loyal |
| Meena Lakshmi | `meena@example.com` | `Customer@123` | Tiruppur | regular |
| Vikram Shetty | `vikram@example.com` | `Customer@123` | Chennai | regular |
| Deepa Nair | `deepa@example.com` | `Customer@123` | Kochi | regular |
| Suresh Babu | `suresh@example.com` | `Customer@123` | Coimbatore | occasional |
| Ananya Iyer | `ananya@example.com` | `Customer@123` | Bengaluru | loyal |
| Rahul Menon | `rahul@example.com` | `Customer@123` | Chennai | occasional |
| Kavitha Subramanian | `kavitha@example.com` | `Customer@123` | Salem | regular |
| Joseph Thomas | `joseph@example.com` | `Customer@123` | Kochi | occasional |
| Sneha Patel | `sneha@example.com` | `Customer@123` | Bengaluru | regular |
| Karthik Rajan | `karthik@example.com` | `Customer@123` | Madurai | loyal |
| Divya Krishnan | `divya@example.com` | `Customer@123` | Coimbatore | regular |
| Mohammed Ashraf | `ashraf@example.com` | `Customer@123` | Tiruppur | occasional |
| Lakshmi Priya | `lakshmipriya@example.com` | `Customer@123` | Chennai | churned |
| Ganesh Moorthy | `ganesh@example.com` | `Customer@123` | Salem | churned |
| Aishwarya Balan | `aishwarya@example.com` | `Customer@123` | Coimbatore | new |
| Nitin Verma | `nitin@example.com` | `Customer@123` | Bengaluru | new |

> Source of truth: [`server/prisma/seed-data.ts`](server/prisma/seed-data.ts) (`CUSTOMER_SEEDS`). The admin dashboard, analytics, recommendations and reports only have meaningful data because the seed also generates ~12 months of synthetic order history, reviews, and recommendation telemetry on top of these accounts.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** ≥ 20
- **PostgreSQL** ≥ 14 (a local install, or use the bundled `docker-compose.yml`)
- npm (comes with Node)

### 1. Clone & install

```bash
git clone https://github.com/umangjzx/abi-projj.git
cd abi-projj
npm run install:all
```

### 2. Configure the database

**Option A — use your own local PostgreSQL:**

```bash
createdb thuthi_dairy
```

**Option B — use the bundled Docker Postgres** (no local install needed):

```bash
docker compose up -d postgres
```

### 3. Configure environment variables

```bash
cd server
cp .env.example .env
```

Edit `server/.env` and set at minimum:

```dotenv
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/thuthi_dairy?schema=public"
JWT_ACCESS_SECRET=<generate with the command below>
JWT_REFRESH_SECRET=<generate with the command below>
```

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> **Note:** if your Postgres password contains special characters (`@`, `#`, `%` …), URL-encode them in `DATABASE_URL` (e.g. `@` → `%40`).

SMTP and Cloudinary are **optional** in development:
- No `SMTP_HOST` → verification/reset emails are written to `server/storage/mail-outbox.log` instead of being sent.
- No Cloudinary credentials → uploaded images are stored on local disk under `server/uploads/`.

### 4. Run migrations + seed demo data

```bash
cd server
npm run db:setup
```

This runs `prisma migrate deploy` followed by the seed script, producing:
23 products, 18 customers, ~160+ orders across 12 months, reviews, coupons, offers, and recommendation telemetry — everything the dashboards need to show real numbers on first login.

### 5. Start both servers

From the **project root**:

```bash
npm run dev
```

This runs the API (port `5000`) and the Vite dev server (port `5173`) concurrently.

Or run them separately:

```bash
npm run dev:api   # http://localhost:5000
npm run dev:web   # http://localhost:5173
```

Then open **http://localhost:5173** and sign in with any credential from the table above.

---

## 📜 Useful Scripts

Run from the project root unless noted:

| Command | Description |
|---|---|
| `npm run install:all` | Install both `server` and `client` dependencies |
| `npm run dev` | Run API + web concurrently |
| `npm run build` | Production build of both apps |
| `npm run typecheck` | Type-check both apps |
| `npm run test` | Run backend unit tests |

Inside `server/`:

| Command | Description |
|---|---|
| `npm run db:setup` | Migrate + seed in one step |
| `npm run db:seed` | Re-seed demo data (wipes & regenerates) |
| `npm run migrate:dev` | Create/apply a new migration in development |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |
| `npm run db:reset` | Drop, recreate, migrate and seed the database |

---

## 📁 Project Structure

```
abi-proj/
├── client/                  # React storefront + admin panel
│   └── src/
│       ├── components/      # ui/, layout/, product/, store/, account/, admin/
│       ├── pages/           # store/, auth/, account/, admin/
│       ├── hooks/           # useCart, useCatalog, useAdmin, useWishlist
│       ├── context/         # AuthContext, ThemeContext, CompareContext
│       └── lib/             # api client, utils
│
├── server/                  # Express REST API
│   ├── prisma/
│   │   ├── schema.prisma    # 31 models: users, products, orders, recs, analytics…
│   │   ├── migrations/
│   │   └── seed.ts          # 12-month synthetic dataset generator
│   ├── src/
│   │   ├── modules/         # auth, catalog, cart, orders, recommendations,
│   │   │                    # analytics, reports, inventory, customers, offers…
│   │   ├── middleware/       # auth, rbac, validate, security (CSRF/rate-limit), audit
│   │   ├── jobs/             # scheduled snapshot/segment/affinity jobs
│   │   └── routes/           # route mount table
│   └── tests/                # unit tests (pricing engine, etc.)
│
└── docker-compose.yml        # optional local Postgres + Adminer + MailHog
```

---

## 🔌 API Overview

Base URL: `/api/v1`

| Prefix | Purpose |
|---|---|
| `/auth` | Register, login, verify-email, forgot/reset password, refresh, logout |
| `/products`, `/categories` | Catalog browsing + admin CRUD |
| `/cart`, `/wishlist`, `/addresses` | Customer shopping state |
| `/orders` | Checkout, tracking, invoice, admin status updates |
| `/coupons`, `/offers` | Promotions |
| `/reviews` | Ratings & reviews + moderation |
| `/recommendations` | Personalized feed, home rails, telemetry, admin monitoring |
| `/inventory` *(admin)* | Stock levels, adjustments, movement ledger |
| `/customers` *(admin)* | Customer list, detail, segmentation |
| `/analytics` *(admin)* | Dashboard KPIs, sales/product/customer analytics, forecast |
| `/reports` *(admin)* | Sales/Revenue/Product/Customer/Inventory/Recommendation reports (PDF/Excel/CSV) |
| `/admin` *(admin)* | Activity/audit log, runtime settings |
| `/uploads` *(admin)* | Image upload (Cloudinary or local disk) |

Every response follows the envelope:
```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "total": 42 } }
```

---

## 🧪 Testing

```bash
cd server
npm test
```

Runs the unit test suite for the pricing engine (subtotal, coupon discount capping, free-delivery threshold, GST-on-discounted-subtotal) using Node's built-in test runner — no database required.

For manual/E2E verification, sign in with the demo credentials above and walk through:
1. Browse → add to cart → apply a coupon (`WELCOME50`, `FRESH10`) → checkout → track order → download invoice
2. Admin → Market Analysis (all 4 tabs) → Reports → export a report → Recommendations → Rebuild model

---

## ☁️ Deployment

### Frontend → Vercel
```bash
cd client
vercel
```
Set the environment variable `VITE_API_URL` to your deployed API's base URL (e.g. `https://your-api.onrender.com/api/v1`).

### Backend → Render / Railway
1. Create a new **Web Service** pointing at the `server/` directory.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Add all variables from `server/.env.example` (use a strong, freshly generated `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`).
5. Provision a managed PostgreSQL instance and set `DATABASE_URL`.
6. Run `npm run db:setup` once (via a one-off job/shell) to migrate and seed.
7. Set `CORS_ORIGINS` and `CLIENT_URL` to your Vercel domain.

### Database
Any managed PostgreSQL works (Render Postgres, Railway, Neon, Supabase). Just point `DATABASE_URL` at it and run migrations.

---

## 🔒 Security Notes

- Passwords hashed with bcrypt; refresh tokens stored as SHA-256 digests (never in plaintext)
- CSRF double-submit protection on cookie-authenticated routes
- Rate limiting on auth endpoints (keyed by IP + email)
- Zod validation on every request boundary; Prisma parameterized queries (no SQL injection surface)
- Helmet security headers, strict CORS allow-list
- Full audit trail of every admin mutation in `activity_logs`

---

## 📄 License

Proprietary — built for Thuthi Dairy Private Limited.
