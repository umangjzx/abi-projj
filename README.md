# 🥛 Thuthi Dairy — Market Analysis & Product Recommendation System

A production-ready, full-stack web application for **Thuthi Dairy Private Limited** — a farm-fresh dairy storefront with a hybrid product recommendation engine and a full market-analysis / business-intelligence admin panel.

> Built as a modern, from-scratch alternative to [butterman.in](https://butterman.in/) — domain/business-flow reference only, no code, design, or content was copied.

---

## 🌐 Live Deployment

| Piece | URL | Host |
|---|---|---|
| Storefront + Admin | **https://abi-projj.vercel.app** | Vercel |
| REST API | **https://thuthi-dairy-api.onrender.com/api/v1** | Render (free web service, Singapore region) |
| Database | Render-managed PostgreSQL (`thuthi_dairy_db`, Singapore region) | Render |

Sign in at the live URL above with any credential from [Demo Credentials](#-demo-credentials). Render's free tier sleeps after 15 minutes of inactivity — the first request after a nap takes ~30–50s to wake the API before the rest of the app responds normally.

---

## 📑 Table of Contents

- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Database Schema](#️-database-schema)
- [Demo Credentials](#-demo-credentials)
- [Getting Started](#-getting-started)
- [Useful Scripts](#-useful-scripts)
- [Project Structure](#-project-structure)
- [API Overview](#-api-overview)
- [Testing](#-testing)
- [Deployment](#️-deployment)
- [Security Notes](#-security-notes)

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

    subgraph Backend["Backend — Node.js + Express (Render)"]
        API["REST API\n/api/v1/*"]
        Auth["Auth Module\nJWT + Refresh + OTP + RBAC"]
        Catalog["Catalog / Cart / Orders"]
        RecEngine["Recommendation Engine\nPopularity · Affinity · Collaborative\nPurchase History · Trending"]
        Analytics["Analytics & Forecast Engine\nKPIs · Seasonality · Linear Regression"]
        Reports["Report Generator\nPDF (PDFKit) · Excel (ExcelJS) · CSV"]
        Jobs["Scheduled Jobs\nSnapshots · Segments · Affinities"]
    end

    subgraph Data["Data Layer"]
        Postgres[("PostgreSQL\nvia Prisma ORM\n30 models")]
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

## 🗄️ Database Schema

30 Prisma models ([`server/prisma/schema.prisma`](server/prisma/schema.prisma)), grouped by domain:

| Domain | Models |
|---|---|
| Identity & auth | `Role`, `User`, `OtpToken`, `RefreshToken` |
| Customer profile | `Address` |
| Catalog | `Category`, `Product`, `ProductImage`, `ProductVariant` |
| Inventory | `Inventory`, `InventoryMovement` |
| Shopping | `Cart`, `CartItem`, `WishlistItem`, `RecentlyViewed` |
| Promotions | `Coupon`, `CouponRedemption`, `Offer` |
| Orders & payments | `Order`, `OrderItem`, `OrderStatusEvent`, `Payment` |
| Feedback | `Rating`, `Review` |
| Recommendations | `Recommendation`, `RecommendationEvent`, `ProductAffinity` |
| Analytics & ops | `AnalyticsSnapshot`, `Notification`, `ActivityLog` |

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

<details>
<summary><strong>Full environment variable reference</strong> (click to expand)</summary>

#### `server/.env` (from [`server/.env.example`](server/.env.example))

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `production` skips devDependency install on some hosts — see [render.yaml](render.yaml) note |
| `PORT` | `5000` | API listen port |
| `API_PREFIX` | `/api/v1` | Base path mounted for all routes |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allow-list of browser origins |
| `CLIENT_URL` | `http://localhost:5173` | Used in emails (verification/reset links) |
| `DATABASE_URL` | — | Postgres connection string (Prisma) |
| `JWT_ACCESS_SECRET` | — | Signs short-lived access tokens (≥32 chars) |
| `JWT_REFRESH_SECRET` | — | Signs long-lived refresh tokens (≥32 chars) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Refresh token lifetime |
| `BCRYPT_ROUNDS` | `10` | Password hashing cost factor |
| `OTP_TTL_MINUTES` | `10` | Email OTP validity window |
| `OTP_MAX_ATTEMPTS` | `5` | Max wrong-OTP attempts before lockout |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | Block login until email is verified |
| `SMTP_HOST` | *(empty)* | Leave empty to log mail to file instead of sending |
| `SMTP_PORT` | `1025` | SMTP port (`1025` = MailHog via docker-compose) |
| `SMTP_SECURE` | `false` | Use TLS for SMTP |
| `SMTP_USER` / `SMTP_PASS` | *(empty)* | SMTP auth credentials |
| `MAIL_FROM` | `"Thuthi Dairy <no-reply@thuthidairy.com>"` | From-address on outgoing mail |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | *(empty)* | Leave empty to store uploads on local disk instead |
| `CLOUDINARY_FOLDER` | `thuthi-dairy` | Cloudinary folder for uploaded images |
| `LOG_LEVEL` | `info` | Pino logger verbosity |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | General API rate-limit window |
| `RATE_LIMIT_MAX` | `600` | Max requests per window (general) |
| `AUTH_RATE_LIMIT_MAX` | `25` | Max requests per window on `/auth/*` |
| `DELIVERY_FEE` | `25` | Flat delivery fee (₹) |
| `FREE_DELIVERY_THRESHOLD` | `499` | Order subtotal (₹) above which delivery is free |
| `TAX_PERCENT` | `5` | GST percentage applied at checkout |
| `LOW_STOCK_THRESHOLD` | `15` | Default per-variant low-stock threshold |

#### `client/.env` (from [`client/.env.example`](client/.env.example))

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | *(unset — proxied to `localhost:5000` in dev)* | Deployed API base URL, **must** include `/api/v1` in production |

</details>

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
│   │   ├── schema.prisma    # 30 models: users, products, orders, recs, analytics…
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

Base URL: `/api/v1` (locally `http://localhost:5000/api/v1`, live `https://thuthi-dairy-api.onrender.com/api/v1`)

Every response follows the envelope:
```json
{ "success": true, "data": { ... }, "meta": { "page": 1, "total": 42 } }
```

Errors follow: `{ "success": false, "error": { "code": "...", "message": "..." } }`.

<details>
<summary><strong>Full endpoint reference</strong> — every route, method, and auth requirement (click to expand)</summary>

### `/auth`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/register` | public (rate-limited) | Register new account |
| POST | `/login` | public (rate-limited) | Log in and issue session |
| POST | `/verify-email` | public (rate-limited) | Verify email with OTP |
| POST | `/resend-otp` | public (rate-limited) | Resend OTP code |
| POST | `/forgot-password` | public (rate-limited) | Request password reset |
| POST | `/reset-password` | public (rate-limited) | Reset password with token |
| POST | `/refresh` | public (CSRF check) | Refresh access token from cookie |
| POST | `/logout` | public (CSRF check) | Log out and clear session |
| GET | `/me` | requireAuth | Get current user profile |
| PATCH | `/me` | requireAuth | Update current user profile |
| POST | `/change-password` | requireAuth (rate-limited) | Change own password |

### `/categories`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | public | List categories |
| GET | `/:id` | public | Get category by id |
| POST | `/` | admin | Create category |
| PATCH | `/:id` | admin | Update category |
| DELETE | `/:id` | admin | Delete category |

### `/products`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/suggest` | public | Search-as-you-type suggestions |
| GET | `/filters` | public | Available filter metadata |
| GET | `/` | optional | List products (search/filter/sort/paginate) |
| GET | `/:id` | optional | Get product detail |
| GET | `/:id/related` | public | Related products |
| POST | `/` | admin | Create product |
| PATCH | `/:id` | admin | Update product |
| PATCH | `/:id/featured` | admin | Toggle featured flag |
| DELETE | `/:id` | admin | Delete product |

### `/cart` *(all routes require auth)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Get current user's cart |
| POST | `/items` | Add item to cart |
| PATCH | `/items/:id` | Update cart item quantity |
| DELETE | `/items/:id` | Remove cart item |
| DELETE | `/` | Clear cart |
| POST | `/coupon` | Apply coupon to cart |
| DELETE | `/coupon` | Remove coupon from cart |

### `/coupons`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/available` | auth | Coupons usable on current cart |
| POST | `/preview` | auth | Preview discount for a code |
| GET | `/` | admin | List all coupons |
| POST | `/` | admin | Create coupon |
| PATCH | `/:id` | admin | Update coupon |
| DELETE | `/:id` | admin | Delete coupon |

### `/wishlist` *(all routes require auth)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List wishlist items |
| GET | `/ids` | Wishlisted product ids only |
| POST | `/` | Add product to wishlist |
| POST | `/toggle` | Toggle product in/out of wishlist |
| DELETE | `/:productId` | Remove one product |
| DELETE | `/` | Clear entire wishlist |

### `/addresses` *(all routes require auth)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List own addresses |
| POST | `/` | Create new address |
| PATCH | `/:id` | Update own address |
| POST | `/:id/default` | Set as default address |
| DELETE | `/:id` | Delete own address |

### `/orders` *(all routes require auth)*
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/all` | admin | List all orders |
| PATCH | `/:id/status` | admin | Update order status (guarded transitions) |
| GET | `/` | auth | List own orders |
| GET | `/stats` | auth | Own order statistics |
| POST | `/` | auth | Place a new order (checkout) |
| GET | `/track/:orderNumber` | auth | Track order by order number |
| GET | `/:id` | auth | Get order detail |
| GET | `/:id/invoice` | auth | Download PDF invoice |
| POST | `/:id/cancel` | auth | Cancel own order |

### `/inventory` *(admin, all routes)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List inventory with filters |
| GET | `/summary` | Inventory summary stats |
| GET | `/alerts` | Low-stock alerts |
| GET | `/movements` | Stock movement history |
| POST | `/:variantId/adjust` | Adjust stock quantity for a variant |
| PATCH | `/:variantId/threshold` | Set low-stock threshold for a variant |

### `/reviews`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | optional | List product reviews |
| POST | `/` | auth | Create a review |
| PATCH | `/:id` | auth | Edit own review |
| DELETE | `/:id` | auth | Delete own review (admin: any) |
| GET | `/mine` | auth | Own reviews + pending-review products |
| POST | `/:id/helpful` | auth | Mark review as helpful |
| PATCH | `/:id/moderate` | admin | Approve/reject review, add admin reply |

### `/recommendations`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | optional | Personalized recommendation feed |
| GET | `/home` | optional | Homepage rails (featured/bestsellers/trending) |
| GET | `/recently-viewed` | auth | List recently viewed products |
| DELETE | `/recently-viewed` | auth | Clear browsing history |
| POST | `/track` | optional | Track impression/click/cart event |
| GET | `/admin/performance` | admin | Recommendation performance stats |
| GET | `/admin/slots` | admin | Active recommendation slots |
| GET | `/admin/affinities` | admin | Top product affinities |
| GET | `/admin/coverage` | admin | Recommendation coverage stats |
| POST | `/admin/rebuild` | admin | Manually rebuild recommendation model |

### `/analytics` *(admin, all routes)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/me` | Own customer dashboard overview *(auth, not admin)* |
| GET | `/dashboard` | Admin dashboard overview |
| GET | `/kpis` | KPI metrics |
| GET | `/sales` | Sales time series |
| GET | `/sales/monthly` | Monthly sales totals |
| GET | `/seasonal` | Seasonal trend analysis |
| GET | `/heatmap` | Order heat map (weekday × hour) |
| GET | `/products` | Product performance metrics |
| GET | `/products/demand` | Product demand metrics |
| GET | `/categories` | Category performance metrics |
| GET | `/customers/growth` | Customer growth series |
| GET | `/customers/retention` | Customer retention rate |
| GET | `/customers/segments` | Customer segment breakdown |
| GET | `/customers/top` | Top customers by value |
| GET | `/customers/locations` | Customer geographic breakdown |
| GET | `/orders/status` | Order status breakdown |
| GET | `/payments` | Payment method breakdown |
| GET | `/forecast` | Statistical demand/sales forecast |
| GET | `/snapshots` | Historical metric snapshots |
| GET | `/inventory/abc` | ABC (Pareto) inventory classification |
| GET | `/customers/rfm` | RFM customer scoring |
| GET | `/customers/clusters` | K-Means customer clustering |
| POST | `/snapshots/rebuild` | Rebuild daily snapshots manually |

### `/reports` *(admin, all routes)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List available report types |
| GET | `/:type` | JSON preview of a report |
| GET | `/:type/export` | Export report as PDF/Excel/CSV (rate-limited) |

### `/offers`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/active` | public | List active storefront offers |
| GET | `/` | admin | List all offers |
| POST | `/` | admin | Create offer |
| PATCH | `/:id` | admin | Update offer |
| DELETE | `/:id` | admin | Delete offer + its banner image |

### `/notifications` *(all routes require auth)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List own notifications |
| GET | `/unread-count` | Unread notification count |
| PATCH | `/:id/read` | Mark notification as read |
| POST | `/read-all` | Mark all as read |
| DELETE | `/:id` | Delete a notification |

### `/customers` *(admin, all routes)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List customers |
| GET | `/:id` | Get customer detail |
| PATCH | `/:id/status` | Activate/deactivate customer |
| POST | `/segments/recompute` | Recompute RFM/behavioural segments |
| POST | `/counters/resync` | Resync customer order counters |

### `/uploads` *(admin, all routes)*
| Method | Path | Purpose |
|---|---|---|
| POST | `/image` | Upload a single image |
| POST | `/images` | Upload up to 8 images |
| DELETE | `/` | Delete an uploaded image |
| GET | `/config` | Upload provider/limits config |

### `/admin` *(admin, all routes)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/activity` | Audit/activity log |
| GET | `/settings` | Effective runtime configuration |

</details>

### Scheduled jobs (`server/src/jobs/scheduler.ts`)

An in-process `setInterval` scheduler (no external cron dependency — fine for a single-instance deployment; every job is idempotent and safe to re-run):

| Job | Interval | Purpose |
|---|---|---|
| Daily analytics snapshot | 1h (runs on start) | Rewrites today's + yesterday's analytics snapshot |
| Recompute customer segments | 12h (runs on start) | Recomputes NEW/ACTIVE/LOYAL/AT_RISK/CHURNED segments |
| Rebuild product affinities | 6h | Recomputes item-to-item co-occurrence pairs |
| Clear expired recommendation slots | 2h | Removes stale personalized-slot cache entries |
| Low-stock sweep | 6h | Flags low-stock variants, notifies admins (max once/24h) |
| Purge stale tokens | 12h | Deletes expired refresh tokens + old OTP tokens |

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

**This project is already deployed live** — see [Live Deployment](#-live-deployment) at the top for URLs. The steps below are for redeploying, forking, or standing up your own copy.

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
