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
- **Market Analysis**: sales trend, seasonal index, order heat map (weekday × hour), category performance, customer growth/retention/segments, **RFM scoring**, **K-Means customer clustering**, top customers, revenue by city, payment mix, and a **statistical sales forecast** (linear regression + day-of-week seasonality with confidence bands)
- Product / category / inventory CRUD with stock ledger and low-stock alerts
- **ABC (Pareto) inventory analysis** — classifies every SKU into A/B/C by revenue contribution, right inside the Inventory page
- Order management with a guarded status-transition workflow
- Customer management with rule-based RFM segmentation (New/Active/Loyal/At-risk/Churned) *and* unsupervised K-Means clusters for comparison
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
| `CATEGORY_AFFINITY` | Unbought products in the customer's top categories (content-based) |
| `FREQUENTLY_BOUGHT_TOGETHER` | Pre-computed item-to-item co-occurrence |
| `COLLABORATIVE` | User-user cosine similarity over purchase sets |
| `RECENTLY_VIEWED` | Category siblings of recently browsed items |

All strategies are blended per placement (Home/Product/Cart/Checkout/Dashboard/Search) into a genuine **hybrid recommendation system**, de-duplicated, and every suggestion carries a human-readable reason (e.g. *"You've ordered this 6 times"*).

### Data science & algorithms used

| Technique | Implementation |
|---|---|
| Collaborative filtering | User-user cosine similarity over shared purchase history (`recommendation.service.ts`) |
| Content-based filtering | Category-affinity recommendations + TF-IDF product search (below) |
| Hybrid recommendation system | Weighted blend of all 7 strategies above, per placement |
| RFM analysis (Recency, Frequency, Monetary) | Quintile-scored 1–5 per dimension, combined into a 3–15 score and named segment (`customer-intelligence.service.ts`) |
| K-Means clustering | Custom Lloyd's-algorithm implementation with k-means++ seeding over min-max-scaled RFM features (`lib/kmeans.ts`) |
| Time series / trend analysis | Linear-regression sales forecast with day-of-week seasonality and confidence bands; 14-day trending velocity; monthly seasonal index |
| Top-N ranking | Best-sellers, top customers, top affinities, top converting products |
| ABC (Pareto) inventory analysis | SKUs ranked by revenue, classified A/B/C at 80%/95% cumulative share (`abc.service.ts`) |
| TF-IDF + cosine similarity search | Product search ranked by term-frequency/inverse-document-frequency over name/description/tags, not plain substring match (`lib/tfidf.ts`) |
| BCrypt password hashing | `bcryptjs`, used for every stored password |



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
**9 categories, 51 products, 92 variants**, 18 customers, ~160+ orders across 12 months, reviews, coupons, offers, and recommendation telemetry — everything the dashboards, ABC analysis and RFM/K-Means clustering need to show real numbers on first login.

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
| `/analytics` *(admin)* | Dashboard KPIs, sales/product/customer analytics, forecast, ABC inventory analysis (`/analytics/inventory/abc`), RFM scoring (`/analytics/customers/rfm`), K-Means clustering (`/analytics/customers/clusters`) |
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

This repo ships with ready-to-use deployment configs — **[render.yaml](render.yaml)** (Blueprint for the API + a free managed Postgres) and **[client/vercel.json](client/vercel.json)** (SPA rewrites for the frontend). Free-tier options for all three pieces:

| Piece | Where | Free tier notes |
|---|---|---|
| Frontend | **Vercel** | Unlimited hobby tier, deploys from GitHub automatically |
| Backend API | **Render** | 750 free hrs/month; sleeps after 15 min idle (first request after a nap takes ~30–50s to wake) |
| Database | **Neon** or Render's free Postgres | Neon's free tier has no expiry; Render's free Postgres auto-deletes after 90 days |

### Backend → Render (Blueprint, recommended)
1. In the Render dashboard: **New +** → **Blueprint** → point at this GitHub repo. Render reads [render.yaml](render.yaml) and provisions the web service + database together, generating `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` automatically.
2. Once live, open a shell on the service (or run locally against the Render `DATABASE_URL`) and run `npm run db:seed` once to load the demo dataset — migrations already ran automatically as part of the start command.
3. After the frontend is deployed (below), come back and set `CORS_ORIGINS` and `CLIENT_URL` to your Vercel domain, then redeploy.

<details>
<summary>Manual setup (Render, Railway, or any other host)</summary>

1. Create a new **Web Service** pointing at the `server/` directory.
2. Build command: `npm install && npm run build`
3. Start command: `npx prisma migrate deploy && npm start`
4. Add all variables from [`server/.env.example`](server/.env.example) (use a strong, freshly generated `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`).
5. Provision a managed PostgreSQL instance and set `DATABASE_URL`.
6. Run `npm run db:seed` once (via a one-off job/shell) to load demo data.
7. Set `CORS_ORIGINS` and `CLIENT_URL` to your frontend domain.
</details>

### Frontend → Vercel
```bash
cd client
vercel
```
`vercel.json` is already configured with the SPA rewrite Vite apps need for client-side routing. Set the environment variable `VITE_API_URL` (see [`client/.env.example`](client/.env.example)) in the Vercel project settings to your deployed API's base URL, e.g. `https://thuthi-dairy-api.onrender.com/api/v1`.

### Database
Any managed PostgreSQL works (Render Postgres, Neon, Railway, Supabase). Just point `DATABASE_URL` at it and run `npx prisma migrate deploy`.

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
