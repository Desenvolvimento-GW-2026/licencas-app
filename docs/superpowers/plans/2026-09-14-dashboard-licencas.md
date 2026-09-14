# Dashboard de Licenças de Poços — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js dashboard that scrapes license data from Ambisis daily (06:00) and displays it with color-coded deadline alerts and filters by client/status/period.

**Architecture:** Next.js 14 App Router for frontend + API; Playwright headless scraper runs as a separate scheduler process sharing the same SQLite database; both run in Docker containers on Oracle Cloud Free Tier VM behind Nginx + SSL.

**Tech Stack:** Next.js 14, Prisma + SQLite, NextAuth.js (credentials), Playwright, node-cron, Docker Compose, Nginx, Certbot, Cloudflare DNS.

---

## File Map

```
AMBISIS/
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx          ← login page (GW branded)
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx                 ← auth guard
│   │   │   └── page.tsx                   ← dashboard main page
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   └── licenses/route.ts          ← GET with filters
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── SummaryCards.tsx
│   │   ├── Filters.tsx
│   │   └── LicenseTable.tsx
│   ├── lib/
│   │   ├── db.ts                          ← Prisma singleton
│   │   ├── auth.ts                        ← NextAuth config
│   │   └── license-utils.ts              ← getDaysUntilExpiry, getRowClass, getStatusBadge
│   └── scraper/
│       ├── scrape-ambisis.ts              ← Playwright scraper
│       ├── scheduler.ts                   ← node-cron 06:00
│       └── run.ts                         ← manual trigger entrypoint
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── __tests__/
│   └── license-utils.test.ts
├── Dockerfile
├── Dockerfile.scraper
├── docker-compose.yml
├── nginx.conf
├── .env.example
└── package.json
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd "C:\Users\bruce.damascena\OneDrive - General Water\Área de Trabalho\AMBISIS"
npx create-next-app@latest . --typescript --no-tailwind --app --eslint --no-src-dir --import-alias "@/*"
```

When prompted: choose defaults. Answer No to Tailwind.

- [ ] **Step 2: Install production dependencies**

```bash
npm install prisma @prisma/client next-auth@beta bcryptjs playwright node-cron
npm install --save-dev @types/bcryptjs @types/node-cron tsx
```

- [ ] **Step 3: Install test dependencies**

```bash
npm install --save-dev jest @jest/globals ts-jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 4: Add jest config**

Create `jest.config.ts`:
```typescript
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testMatch: ["**/__tests__/**/*.test.ts"],
};

export default config;
```

- [ ] **Step 5: Add scripts to `package.json`**

Edit `package.json` scripts section:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "jest",
    "scrape": "tsx src/scraper/run.ts",
    "scheduler": "tsx src/scraper/scheduler.ts",
    "db:seed": "tsx prisma/seed.ts",
    "db:migrate": "prisma migrate dev"
  }
}
```

- [ ] **Step 6: Replace `src/app/globals.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Open Sans', Arial, sans-serif; font-size: 14px; color: #333; }
```

- [ ] **Step 7: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Licenças de Poços — General Water",
  description: "Monitoramento de outorgas e licenças de poços",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```
Expected: `ready - started server on 0.0.0.0:3000`

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with deps"
```

---

### Task 2: Prisma Schema + Database

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`

- [ ] **Step 1: Initialize Prisma**

```bash
npx prisma init --datasource-provider sqlite
```

Expected: creates `prisma/schema.prisma` and `.env` with `DATABASE_URL`.

- [ ] **Step 2: Write schema**

Replace entire `prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model License {
  id                    Int       @id @default(autoincrement())
  nome_empreendimento   String
  cnpj                  String?
  cliente               String?
  numero_poco           String?
  requerimento_atual    String?
  requerimento_anterior String?
  portaria              String?
  validade              DateTime?
  status                String?
  data_protocolo        DateTime?
  scraped_at            DateTime  @default(now()) @updatedAt

  @@unique([cnpj, numero_poco])
}

model User {
  id            Int      @id @default(autoincrement())
  email         String   @unique
  password_hash String
  name          String?
  created_at    DateTime @default(now())
}
```

- [ ] **Step 3: Set DATABASE_URL in `.env`**

```
DATABASE_URL="file:./dev.db"
```

- [ ] **Step 4: Run migration**

```bash
npx prisma migrate dev --name init
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Create Prisma singleton**

Create `src/lib/db.ts`:
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error"] : [] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 6: Commit**

```bash
git add prisma/ src/lib/db.ts .env
git commit -m "feat: add Prisma schema and SQLite database"
```

---

### Task 3: License Utilities (TDD)

**Files:**
- Create: `src/lib/license-utils.ts`, `__tests__/license-utils.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/license-utils.test.ts`:
```typescript
import { getDaysUntilExpiry, getRowClass, getStatusBadge } from "@/lib/license-utils";

describe("getDaysUntilExpiry", () => {
  it("returns null for null input", () => {
    expect(getDaysUntilExpiry(null)).toBeNull();
  });

  it("returns negative number for past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 5);
    const result = getDaysUntilExpiry(past);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });

  it("returns 0 for today", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    expect(getDaysUntilExpiry(today)).toBe(0);
  });

  it("returns 120 for date 120 days from now", () => {
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 120);
    expect(getDaysUntilExpiry(future)).toBe(120);
  });

  it("returns 180 for date 180 days from now", () => {
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 180);
    expect(getDaysUntilExpiry(future)).toBe(180);
  });
});

describe("getRowClass", () => {
  it("returns empty string for null validade", () => {
    expect(getRowClass(null)).toBe("");
  });

  it("returns row-expired for yesterday", () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(getRowClass(past)).toBe("row-expired");
  });

  it("returns row-critical for exactly 120 days", () => {
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 120);
    expect(getRowClass(future)).toBe("row-critical");
  });

  it("returns row-warning for 121 days", () => {
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 121);
    expect(getRowClass(future)).toBe("row-warning");
  });

  it("returns row-warning for exactly 180 days", () => {
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 180);
    expect(getRowClass(future)).toBe("row-warning");
  });

  it("returns empty string for 181 days", () => {
    const future = new Date();
    future.setHours(0, 0, 0, 0);
    future.setDate(future.getDate() + 181);
    expect(getRowClass(future)).toBe("");
  });
});

describe("getStatusBadge", () => {
  it("returns vigente badge correctly", () => {
    const badge = getStatusBadge("vigente");
    expect(badge.label).toBe("Vigente");
    expect(badge.bg).toBe("#d1fae5");
    expect(badge.color).toBe("#065f46");
  });

  it("returns em_renovacao badge correctly", () => {
    const badge = getStatusBadge("em_renovacao");
    expect(badge.label).toBe("Em Renovação");
  });

  it("returns fallback for null", () => {
    const badge = getStatusBadge(null);
    expect(badge.bg).toBe("#f5f5f5");
    expect(badge.label).toBe("—");
  });

  it("returns fallback for unknown status", () => {
    const badge = getStatusBadge("unknown_status");
    expect(badge.bg).toBe("#f5f5f5");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npm test
```
Expected: `Cannot find module '@/lib/license-utils'`

- [ ] **Step 3: Implement license-utils**

Create `src/lib/license-utils.ts`:
```typescript
export function getDaysUntilExpiry(validade: Date | null): number | null {
  if (!validade) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const val = new Date(validade);
  val.setHours(0, 0, 0, 0);
  return Math.floor((val.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getRowClass(validade: Date | null): "row-expired" | "row-critical" | "row-warning" | "" {
  const days = getDaysUntilExpiry(validade);
  if (days === null) return "";
  if (days < 0) return "row-expired";
  if (days <= 120) return "row-critical";
  if (days <= 180) return "row-warning";
  return "";
}

interface BadgeStyle {
  bg: string;
  color: string;
  label: string;
}

const STATUS_MAP: Record<string, BadgeStyle> = {
  vigente:                  { bg: "#d1fae5", color: "#065f46", label: "Vigente" },
  em_renovacao:             { bg: "#dbeafe", color: "#1d4ed8", label: "Em Renovação" },
  vencida:                  { bg: "#f5f5f5", color: "#757575", label: "Vencida" },
  autorizacao_perfuracao:   { bg: "#ffedd5", color: "#c2410c", label: "Aut. Perfuração" },
  em_retificacao:           { bg: "#fef9c3", color: "#92400e", label: "Em Retificação" },
  a_solicitar:              { bg: "#ede9fe", color: "#6b21a8", label: "A Solicitar" },
  cancelada:                { bg: "#fee2e2", color: "#7f1d1d", label: "Cancelada" },
};

const FALLBACK_BADGE: BadgeStyle = { bg: "#f5f5f5", color: "#757575", label: "—" };

export function getStatusBadge(status: string | null): BadgeStyle {
  if (!status) return FALLBACK_BADGE;
  return STATUS_MAP[status] ?? { ...FALLBACK_BADGE, label: status };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test
```
Expected: `Tests: 13 passed, 13 total`

- [ ] **Step 5: Commit**

```bash
git add src/lib/license-utils.ts __tests__/license-utils.test.ts
git commit -m "feat: add license utility functions with tests"
```

---

### Task 4: NextAuth Setup + Middleware

**Files:**
- Create: `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `middleware.ts`

- [ ] **Step 1: Add NEXTAUTH_SECRET to `.env`**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output, then add to `.env`:
```
NEXTAUTH_SECRET=<output-from-above>
NEXTAUTH_URL=http://localhost:3000
```

- [ ] **Step 2: Create auth config**

Create `src/lib/auth.ts`:
```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (!user) return null;
        const valid = await compare(credentials.password as string, user.password_hash);
        if (!valid) return null;
        return { id: String(user.id), email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
});
```

- [ ] **Step 3: Create NextAuth API route**

Create `src/app/api/auth/[...nextauth]/route.ts`:
```typescript
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Create middleware**

Create `middleware.ts` at project root:
```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 5: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth middleware.ts .env
git commit -m "feat: add NextAuth credentials auth with JWT sessions"
```

---

### Task 5: Seed Script (Create Admin User)

**Files:**
- Create: `prisma/seed.ts`

- [ ] **Step 1: Add seed env vars to `.env`**

```
SEED_EMAIL=bruce@generalwater.com.br
SEED_PASSWORD=SuaSenhaAqui123
```

- [ ] **Step 2: Create seed script**

Create `prisma/seed.ts`:
```typescript
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL;
  const password = process.env.SEED_PASSWORD;

  if (!email || !password) {
    throw new Error("Set SEED_EMAIL and SEED_PASSWORD in .env before seeding");
  }

  const password_hash = await hash(password, 12);

  const user = await db.user.upsert({
    where: { email },
    update: { password_hash },
    create: { email, password_hash, name: "Admin" },
  });

  console.log(`[seed] user ready: ${user.email} (id=${user.id})`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
```

- [ ] **Step 3: Run seed**

```bash
npm run db:seed
```
Expected: `[seed] user ready: bruce@generalwater.com.br (id=1)`

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat: add seed script for admin user"
```

---

### Task 6: API Route `/api/licenses`

**Files:**
- Create: `src/app/api/licenses/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/licenses/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const busca = searchParams.get("busca") ?? "";
  const cliente = searchParams.get("cliente") ?? "";
  const status = searchParams.get("status") ?? "";
  const mes = searchParams.get("mes") ?? "";
  const ano = searchParams.get("ano") ?? "";

  const where: Parameters<typeof db.license.findMany>[0]["where"] = {};

  if (cliente) where.cliente = cliente;
  if (status) where.status = status;
  if (busca) {
    where.OR = [
      { nome_empreendimento: { contains: busca } },
      { cnpj: { contains: busca } },
    ];
  }

  let licenses = await db.license.findMany({
    where,
    orderBy: { validade: "asc" },
  });

  if (mes) {
    const mesInt = parseInt(mes);
    licenses = licenses.filter(
      (l) => l.validade && new Date(l.validade).getMonth() + 1 === mesInt
    );
  }
  if (ano) {
    const anoInt = parseInt(ano);
    licenses = licenses.filter(
      (l) => l.validade && new Date(l.validade).getFullYear() === anoInt
    );
  }

  const lastSyncRow = await db.license.findFirst({
    orderBy: { scraped_at: "desc" },
    select: { scraped_at: true },
  });

  const clientesRows = await db.license.findMany({
    select: { cliente: true },
    distinct: ["cliente"],
    where: { cliente: { not: null } },
    orderBy: { cliente: "asc" },
  });

  return NextResponse.json({
    licenses,
    lastSync: lastSyncRow?.scraped_at ?? null,
    clientes: clientesRows.map((c) => c.cliente).filter(Boolean),
  });
}
```

- [ ] **Step 2: Test the route manually**

```bash
npm run dev
```

In another terminal:
```bash
curl http://localhost:3000/api/licenses
```
Expected: `{"error":"Unauthorized"}` with status 401.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/licenses/route.ts
git commit -m "feat: add licenses API route with filters"
```

---

### Task 7: Login Page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Create login page**

Create `src/app/(auth)/login/page.tsx`:
```tsx
"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setError("Email ou senha incorretos.");
      setLoading(false);
    } else {
      router.push("/");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 14px",
    border: "1.5px solid #e2e5ec",
    borderRadius: 8,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color .15s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: ".5px",
    marginBottom: 5,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 2px 16px rgba(61,57,126,.12)", padding: "40px 48px", width: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <img
            src="https://generalwater.com.br/wp-content/uploads/2023/09/Logo-General-Water.png"
            alt="General Water"
            style={{ height: 48, objectFit: "contain", marginBottom: 12 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <p style={{ color: "#666", fontSize: 13, margin: 0 }}>Licenças de Poços</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Senha</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
          </div>
          {error && <p style={{ color: "#dc2626", fontSize: 12, marginBottom: 12 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", background: "#3D397E", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, fontFamily: "inherit" }}
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#aaa" }}>General Water — Uso Interno</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test login flow**

```bash
npm run dev
```

Open `http://localhost:3000` — expect redirect to `/login`.
Enter `bruce@generalwater.com.br` and the seed password — expect redirect to `/`.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "feat: add login page with General Water branding"
```

---

### Task 8: SummaryCards Component

**Files:**
- Create: `src/components/SummaryCards.tsx`

- [ ] **Step 1: Create component**

Create `src/components/SummaryCards.tsx`:
```tsx
"use client";

interface License {
  validade: string | Date | null;
  status: string | null;
}

interface Card {
  key: string;
  label: string;
  value: number;
  bg: string;
  bar: string;
  color: string;
}

interface Props {
  licenses: License[];
  activeFilter: string | null;
  onFilter: (filter: string | null) => void;
}

export function SummaryCards({ licenses, activeFilter, onFilter }: Props) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  function daysTo(validade: string | Date | null): number | null {
    if (!validade) return null;
    const val = new Date(validade);
    val.setHours(0, 0, 0, 0);
    return Math.floor((val.getTime() - now.getTime()) / 86400000);
  }

  const counts = {
    total:    licenses.length,
    vigente:  licenses.filter((l) => l.status === "vigente").length,
    renovacao: licenses.filter((l) => l.status === "em_renovacao").length,
    warning:  licenses.filter((l) => { const d = daysTo(l.validade); return d !== null && d > 120 && d <= 180; }).length,
    critical: licenses.filter((l) => { const d = daysTo(l.validade); return d !== null && d >= 0 && d <= 120; }).length,
    vencida:  licenses.filter((l) => { const d = daysTo(l.validade); return d !== null && d < 0; }).length,
  };

  const cards: Card[] = [
    { key: "total",    label: "Total",       value: counts.total,    bg: "#f5f4ff", bar: "#3D397E", color: "#3D397E" },
    { key: "vigente",  label: "Vigentes",    value: counts.vigente,  bg: "#d1fae5", bar: "#10b981", color: "#065f46" },
    { key: "renovacao",label: "Renovação",   value: counts.renovacao,bg: "#dbeafe", bar: "#2563eb", color: "#1d4ed8" },
    { key: "warning",  label: "≤ 180 dias",  value: counts.warning,  bg: "#fefce8", bar: "#eab308", color: "#92400e" },
    { key: "critical", label: "≤ 120 dias",  value: counts.critical, bg: "#fef2f2", bar: "#dc2626", color: "#b91c1c" },
    { key: "vencida",  label: "Vencidas",    value: counts.vencida,  bg: "#f5f5f5", bar: "#757575", color: "#374151" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
      {cards.map((card) => (
        <div
          key={card.key}
          onClick={() => onFilter(activeFilter === card.key ? null : card.key)}
          style={{
            background: card.bg,
            borderRadius: 10,
            padding: "16px 18px",
            textAlign: "center",
            cursor: "pointer",
            border: "1px solid #e2e5ec",
            position: "relative",
            overflow: "hidden",
            outline: activeFilter === card.key ? "3px solid #47A5AE" : "none",
            outlineOffset: 2,
            transition: "transform .1s, box-shadow .1s",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: card.bar }} />
          <strong style={{ display: "block", fontSize: 32, fontWeight: 700, lineHeight: 1.1, marginTop: 4, color: card.color }}>
            {card.value}
          </strong>
          <span style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: ".5px", marginTop: 4, display: "block" }}>
            {card.label}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SummaryCards.tsx
git commit -m "feat: add SummaryCards component with clickable filters"
```

---

### Task 9: Filters Component

**Files:**
- Create: `src/components/Filters.tsx`

- [ ] **Step 1: Create component**

Create `src/components/Filters.tsx`:
```tsx
"use client";

interface Props {
  busca: string;
  setBusca: (v: string) => void;
  cliente: string;
  setCliente: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  mes: string;
  setMes: (v: string) => void;
  ano: string;
  setAno: (v: string) => void;
  clientes: string[];
  onClear: () => void;
}

const STATUS_OPTIONS = [
  { value: "vigente",                label: "Vigente" },
  { value: "em_renovacao",           label: "Em Renovação" },
  { value: "vencida",                label: "Vencida" },
  { value: "autorizacao_perfuracao", label: "Aut. Perfuração" },
  { value: "em_retificacao",         label: "Em Retificação" },
  { value: "a_solicitar",            label: "A Solicitar" },
  { value: "cancelada",              label: "Cancelada" },
];

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const selectStyle: React.CSSProperties = {
  padding: "9px 14px",
  border: "1.5px solid #e2e5ec",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#666",
  textTransform: "uppercase",
  letterSpacing: ".5px",
};

export function Filters({ busca, setBusca, cliente, setCliente, status, setStatus, mes, setMes, ano, setAno, clientes, onClear }: Props) {
  const currentYear = new Date().getFullYear();
  const anos = Array.from({ length: 6 }, (_, i) => String(currentYear - 1 + i));

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 4 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={labelStyle}>Buscar</label>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Nome ou CNPJ..."
          style={{ ...selectStyle, width: 240 }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={labelStyle}>Cliente</label>
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} style={{ ...selectStyle, minWidth: 160 }}>
          <option value="">Todos</option>
          {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={labelStyle}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...selectStyle, minWidth: 160 }}>
          <option value="">Todos</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={labelStyle}>Mês</label>
        <select value={mes} onChange={(e) => setMes(e.target.value)} style={{ ...selectStyle, minWidth: 90 }}>
          <option value="">Todos</option>
          {MESES.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={labelStyle}>Ano</label>
        <select value={ano} onChange={(e) => setAno(e.target.value)} style={{ ...selectStyle, minWidth: 90 }}>
          <option value="">Todos</option>
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      <button
        onClick={onClear}
        style={{ height: 38, padding: "0 18px", background: "#fff", color: "#666", border: "1.5px solid #e2e5ec", borderRadius: 8, fontSize: 13, fontFamily: "inherit", cursor: "pointer", fontWeight: 700 }}
      >
        Limpar
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Filters.tsx
git commit -m "feat: add Filters component with client/status/period selects"
```

---

### Task 10: LicenseTable Component

**Files:**
- Create: `src/components/LicenseTable.tsx`

- [ ] **Step 1: Create component**

Create `src/components/LicenseTable.tsx`:
```tsx
"use client";
import { getRowClass, getStatusBadge } from "@/lib/license-utils";

export interface License {
  id: number;
  nome_empreendimento: string;
  cnpj: string | null;
  cliente: string | null;
  numero_poco: string | null;
  requerimento_atual: string | null;
  requerimento_anterior: string | null;
  portaria: string | null;
  validade: string | null;
  status: string | null;
  data_protocolo: string | null;
}

interface Props {
  licenses: License[];
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

const HEADERS = ["Empreendimento", "CNPJ", "Nº Poço", "Req. Atual", "Req. Anterior", "Portaria", "Validade", "Status", "Protocolo"];

export function LicenseTable({ licenses }: Props) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid #e2e5ec", borderRadius: "0 0 8px 8px", maxHeight: "calc(100vh - 340px)", overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {HEADERS.map((h) => (
              <th
                key={h}
                style={{
                  background: "#3D397E",
                  color: "#fff",
                  padding: "11px 13px",
                  textAlign: "left",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  fontSize: 11,
                  letterSpacing: ".5px",
                  textTransform: "uppercase",
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {licenses.length === 0 && (
            <tr>
              <td colSpan={9} style={{ padding: 48, textAlign: "center", color: "#aaa" }}>
                Nenhuma licença encontrada.
              </td>
            </tr>
          )}
          {licenses.map((l, i) => {
            const rowClass = getRowClass(l.validade ? new Date(l.validade) : null);
            const badge = getStatusBadge(l.status);
            const isExpired = rowClass === "row-expired";

            const rowBg =
              isExpired ? "#374151" :
              rowClass === "row-critical" ? "#fef2f2" :
              rowClass === "row-warning" ? "#fefce8" :
              i % 2 === 0 ? "#fff" : "#fafbff";

            const borderLeft =
              rowClass === "row-critical" ? "4px solid #dc2626" :
              rowClass === "row-warning" ? "4px solid #eab308" :
              undefined;

            const textColor = isExpired ? "#9CA3AF" : "#444";

            const tdBase: React.CSSProperties = {
              padding: "9px 13px",
              borderBottom: "1px solid #eaedf5",
              verticalAlign: "middle",
              color: textColor,
            };

            return (
              <tr key={l.id} style={{ background: rowBg, borderLeft }}>
                <td style={{ ...tdBase, maxWidth: 200, whiteSpace: "normal", lineHeight: 1.4 }}>{l.nome_empreendimento}</td>
                <td style={{ ...tdBase, fontFamily: "monospace", fontSize: 12, color: isExpired ? "#9CA3AF" : "#3D397E", fontWeight: 700, whiteSpace: "nowrap" }}>{l.cnpj ?? "—"}</td>
                <td style={tdBase}>{l.numero_poco ?? "—"}</td>
                <td style={tdBase}>{l.requerimento_atual ?? "—"}</td>
                <td style={tdBase}>{l.requerimento_anterior ?? "—"}</td>
                <td style={tdBase}>{l.portaria ?? "—"}</td>
                <td style={{ ...tdBase, whiteSpace: "nowrap", fontWeight: 600 }}>{fmtDate(l.validade)}</td>
                <td style={tdBase}>
                  <span style={{ padding: "3px 11px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", display: "inline-block", background: badge.bg, color: badge.color }}>
                    {badge.label}
                  </span>
                </td>
                <td style={{ ...tdBase, whiteSpace: "nowrap" }}>{fmtDate(l.data_protocolo)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LicenseTable.tsx
git commit -m "feat: add LicenseTable with color-coded expiry rows and status badges"
```

---

### Task 11: Dashboard Page

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Create dashboard layout (server-side auth guard)**

Create `src/app/(dashboard)/layout.tsx`:
```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  return <>{children}</>;
}
```

- [ ] **Step 2: Create dashboard page**

Create `src/app/(dashboard)/page.tsx`:
```tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import { signOut } from "next-auth/react";
import { SummaryCards } from "@/components/SummaryCards";
import { Filters } from "@/components/Filters";
import { LicenseTable, type License } from "@/components/LicenseTable";

function fmtSync(dt: string | null): string {
  if (!dt) return "Nunca";
  return new Date(dt).toLocaleString("pt-BR");
}

export default function DashboardPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [clientes, setClientes] = useState<string[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState("");
  const [status, setStatus] = useState("");
  const [mes, setMes] = useState("");
  const [ano, setAno] = useState("");
  const [cardFilter, setCardFilter] = useState<string | null>(null);

  const fetchLicenses = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (busca) p.set("busca", busca);
    if (cliente) p.set("cliente", cliente);
    if (status) p.set("status", status);
    if (mes) p.set("mes", mes);
    if (ano) p.set("ano", ano);
    const res = await fetch(`/api/licenses?${p}`);
    const data = await res.json();
    setLicenses(data.licenses ?? []);
    setClientes(data.clientes ?? []);
    setLastSync(data.lastSync ?? null);
    setLoading(false);
  }, [busca, cliente, status, mes, ano]);

  useEffect(() => { fetchLicenses(); }, [fetchLicenses]);

  function handleClear() {
    setBusca(""); setCliente(""); setStatus(""); setMes(""); setAno(""); setCardFilter(null);
  }

  return (
    <div style={{ fontFamily: "'Open Sans', Arial, sans-serif", background: "#f4f5f9", minHeight: "100vh", fontSize: 14, color: "#333" }}>

      {/* ── Header ── */}
      <header style={{ background: "linear-gradient(135deg,#3D397E 0%,#2e2a6e 100%)", color: "#fff", padding: "10px 40px 8px", boxShadow: "0 3px 12px rgba(61,57,126,.35)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <img
              src="https://generalwater.com.br/wp-content/uploads/2023/09/Logo-General-Water.png"
              alt="General Water"
              style={{ height: 38, objectFit: "contain", filter: "brightness(0) invert(1)" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <div style={{ width: 1, height: 32, background: "rgba(255,255,255,.2)" }} />
            <div>
              <strong style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 1 }}>Licenças de Poços</strong>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>General Water — Monitoramento de Outorgas</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ background: "#47A5AE", borderRadius: 20, padding: "5px 16px", fontSize: 11, fontWeight: 700, letterSpacing: ".5px", textTransform: "uppercase" }}>Uso Interno</span>
            <button onClick={() => signOut()} style={{ background: "transparent", border: "1px solid rgba(255,255,255,.3)", color: "rgba(255,255,255,.7)", borderRadius: 6, padding: "4px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Sair</button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)", display: "flex", flexWrap: "wrap", gap: "3px 10px", alignItems: "center", borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: 6, marginTop: 2 }}>
          <span>Atualiza todo dia às <strong style={{ color: "rgba(255,255,255,.9)" }}>06:00</strong></span>
          <span style={{ opacity: .35 }}>|</span>
          <span>Última sync: <strong style={{ color: "rgba(255,255,255,.9)" }}>{fmtSync(lastSync)}</strong></span>
          <span style={{ opacity: .35 }}>|</span>
          <span>General Water — Licenças | Desenvolvido pelo <strong style={{ color: "#47A5AE" }}>Setor de Desenvolvimento</strong></span>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: "28px auto", padding: "0 24px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Summary Cards ── */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 4, height: 18, background: "#47A5AE", borderRadius: 3 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#3D397E", textTransform: "uppercase", letterSpacing: ".7px" }}>Resumo</span>
          </div>
          <SummaryCards licenses={licenses} activeFilter={cardFilter} onFilter={setCardFilter} />
        </div>

        {/* ── Table Card ── */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "24px 28px", boxShadow: "0 1px 6px rgba(0,0,0,.07)", border: "1px solid #e2e5ec" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ width: 4, height: 18, background: "#47A5AE", borderRadius: 3 }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#3D397E", textTransform: "uppercase", letterSpacing: ".7px", flex: 1 }}>Licenças</span>
            <span style={{ fontSize: 12, color: "#666" }}>
              <strong style={{ color: "#333" }}>{licenses.length}</strong> registros
            </span>
          </div>
          <Filters
            busca={busca} setBusca={setBusca}
            cliente={cliente} setCliente={setCliente}
            status={status} setStatus={setStatus}
            mes={mes} setMes={setMes}
            ano={ano} setAno={setAno}
            clientes={clientes}
            onClear={handleClear}
          />
          <div style={{ marginTop: 12 }}>
            {loading
              ? <div style={{ padding: 48, textAlign: "center", color: "#aaa" }}>Carregando...</div>
              : <LicenseTable licenses={licenses} />
            }
          </div>
        </div>
      </main>

      <footer style={{ textAlign: "center", padding: "16px 20px 20px", color: "#aaa", fontSize: 11, letterSpacing: ".3px" }}>
        General Water — Licenças de Poços | Desenvolvido pelo Setor de Desenvolvimento
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Test full dashboard**

```bash
npm run dev
```

1. Open `http://localhost:3000` → redirects to `/login`
2. Login with seed credentials → dashboard loads
3. Empty state shows "Nenhuma licença encontrada"
4. Header shows "Última sync: Nunca"

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/
git commit -m "feat: add dashboard page with header, cards, filters, and table"
```

---

### Task 12: Map Ambisis Selectors (Discovery Task)

**Files:**
- Create: `src/scraper/scrape-ambisis.ts` (skeleton + selectors discovered here)

This task requires manually navigating Ambisis with a debug browser session to identify the correct page and element selectors.

- [ ] **Step 1: Add Ambisis credentials to `.env`**

```
AMBISIS_EMAIL=gabriel.barbosa@generalwater.com.br
AMBISIS_PASSWORD=Gabriel@123
```

- [ ] **Step 2: Create debug script to explore Ambisis**

Create `src/scraper/debug-ambisis.ts`:
```typescript
import { chromium } from "playwright";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();

  await page.goto("https://app.ambisis.com.br/login");
  console.log("Page title:", await page.title());

  // Find email/password inputs
  const inputs = await page.$$eval("input", (els) =>
    els.map((el) => ({ type: el.type, name: el.name, id: el.id, placeholder: el.placeholder }))
  );
  console.log("Inputs found:", JSON.stringify(inputs, null, 2));
}

main().catch(console.error);
```

- [ ] **Step 3: Run debug script — OBSERVE BROWSER WINDOW**

```bash
npm run -- tsx src/scraper/debug-ambisis.ts
```

A Chromium window opens. Observe:
1. What are the input field names/IDs for email and password?
2. After navigating to the login page, find the submit button selector.
3. After login, navigate to the licenses/poços section manually.
4. Right-click on the license table → Inspect Element → note the CSS selectors for rows and cells.
5. Note the column order (Nome, CNPJ, Nº Poço, Requerimento, Portaria, Validade, Status, Protocolo, Cliente).

Record findings in a comment block for the next step.

- [ ] **Step 4: Create scraper with discovered selectors**

Create `src/scraper/scrape-ambisis.ts`:

```typescript
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
dotenv.config();

const db = new PrismaClient();

const AMBISIS_URL = "https://app.ambisis.com.br";

// ── Selectors (fill in after Task 12 Step 3) ──────────────────────────────
// Replace these with actual selectors discovered during debug session
const SEL = {
  emailInput:    'input[type="email"]',     // UPDATE IF DIFFERENT
  passwordInput: 'input[type="password"]',  // UPDATE IF DIFFERENT
  submitButton:  'button[type="submit"]',   // UPDATE IF DIFFERENT
  licensesNav:   "",   // e.g. 'a[href*="licencas"]' — FILL IN
  tableRows:     "",   // e.g. 'table tbody tr'        — FILL IN
  // Column indices (0-based) — FILL IN AFTER INSPECTION:
  COL_NOME:        0,
  COL_CNPJ:        1,
  COL_POCO:        2,
  COL_REQ_ATUAL:   3,
  COL_REQ_ANT:     4,
  COL_PORTARIA:    5,
  COL_VALIDADE:    6,
  COL_STATUS:      7,
  COL_PROTOCOLO:   8,
  COL_CLIENTE:     9,
};
// ─────────────────────────────────────────────────────────────────────────

function parseDate(str: string | undefined): Date | null {
  if (!str) return null;
  // Handle DD/MM/YYYY or YYYY-MM-DD
  const parts = str.trim().split(/[/\-]/);
  if (parts.length !== 3) return null;
  const [a, b, c] = parts;
  const dateStr = a.length === 4
    ? `${a}-${b}-${c}`            // YYYY-MM-DD
    : `${c}-${b}-${a}`;           // DD/MM/YYYY → YYYY-MM-DD
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export async function scrapeAmbisis(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "pt-BR" });
  const page = await context.newPage();

  try {
    // 1. Login
    await page.goto(`${AMBISIS_URL}/login`, { waitUntil: "networkidle" });
    await page.fill(SEL.emailInput, process.env.AMBISIS_EMAIL!);
    await page.fill(SEL.passwordInput, process.env.AMBISIS_PASSWORD!);
    await page.click(SEL.submitButton);
    await page.waitForURL(`${AMBISIS_URL}/**`, { timeout: 15000 });
    console.log("[scraper] logged in");

    // 2. Navigate to licenses section
    if (SEL.licensesNav) {
      await page.click(SEL.licensesNav);
      await page.waitForLoadState("networkidle");
    } else {
      throw new Error("SEL.licensesNav not set — complete Task 12 Step 3 first");
    }

    // 3. Collect all paginated data
    const allRows: Record<string, string>[] = [];

    let hasNextPage = true;
    while (hasNextPage) {
      await page.waitForSelector(SEL.tableRows, { timeout: 10000 });

      const rows = await page.$$eval(SEL.tableRows, (trs, sel) =>
        trs.map((tr) => {
          const cells = tr.querySelectorAll("td");
          const cell = (i: number) => cells[i]?.textContent?.trim() ?? "";
          return {
            nome_empreendimento: cell(sel.COL_NOME),
            cnpj:                cell(sel.COL_CNPJ),
            numero_poco:         cell(sel.COL_POCO),
            requerimento_atual:  cell(sel.COL_REQ_ATUAL),
            requerimento_anterior: cell(sel.COL_REQ_ANT),
            portaria:            cell(sel.COL_PORTARIA),
            validade:            cell(sel.COL_VALIDADE),
            status:              cell(sel.COL_STATUS),
            data_protocolo:      cell(sel.COL_PROTOCOLO),
            cliente:             cell(sel.COL_CLIENTE),
          };
        }),
        sel
      );

      allRows.push(...rows);

      // Try to go to next page (update selector if different)
      const nextBtn = await page.$('button[aria-label="próxima página"], a.next-page');
      if (nextBtn && await nextBtn.isEnabled()) {
        await nextBtn.click();
        await page.waitForLoadState("networkidle");
      } else {
        hasNextPage = false;
      }
    }

    console.log(`[scraper] found ${allRows.length} rows`);

    // 4. Upsert to database
    let updated = 0;
    let created = 0;
    for (const row of allRows) {
      if (!row.nome_empreendimento) continue;
      const data = {
        nome_empreendimento:   row.nome_empreendimento,
        cnpj:                  row.cnpj || null,
        cliente:               row.cliente || null,
        numero_poco:           row.numero_poco || null,
        requerimento_atual:    row.requerimento_atual || null,
        requerimento_anterior: row.requerimento_anterior || null,
        portaria:              row.portaria || null,
        validade:              parseDate(row.validade),
        status:                normalizeStatus(row.status) || null,
        data_protocolo:        parseDate(row.data_protocolo),
        scraped_at:            new Date(),
      };

      const key = { cnpj: data.cnpj ?? "", numero_poco: data.numero_poco ?? "" };
      const existing = await db.license.findUnique({ where: { cnpj_numero_poco: key } });
      if (existing) {
        await db.license.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await db.license.create({ data });
        created++;
      }
    }

    console.log(`[scraper] done — created: ${created}, updated: ${updated}`);
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}

function normalizeStatus(raw: string): string {
  const map: Record<string, string> = {
    "vigente":                  "vigente",
    "em renovação":             "em_renovacao",
    "em renovacao":             "em_renovacao",
    "vencida":                  "vencida",
    "autorização de perfuração":"autorizacao_perfuracao",
    "autorizacao de perfuracao":"autorizacao_perfuracao",
    "em retificação":           "em_retificacao",
    "em retificacao":           "em_retificacao",
    "à solicitar licença":      "a_solicitar",
    "a solicitar licenca":      "a_solicitar",
    "cancelada":                "cancelada",
  };
  return map[raw.toLowerCase()] ?? raw.toLowerCase().replace(/\s+/g, "_");
}
```

- [ ] **Step 5: Create manual run entrypoint**

Create `src/scraper/run.ts`:
```typescript
import { scrapeAmbisis } from "./scrape-ambisis";

scrapeAmbisis()
  .then(() => { console.log("done"); process.exit(0); })
  .catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: Test scraper (after filling selectors)**

```bash
npm run scrape
```
Expected: `[scraper] logged in` → `[scraper] found N rows` → `[scraper] done`

Then verify data in database:
```bash
npx prisma studio
```
Open `http://localhost:5555` and check the `License` table has rows.

- [ ] **Step 7: Commit**

```bash
git add src/scraper/
git commit -m "feat: add Playwright scraper for Ambisis license data"
```

---

### Task 13: Scheduler

**Files:**
- Create: `src/scraper/scheduler.ts`

- [ ] **Step 1: Create scheduler**

Create `src/scraper/scheduler.ts`:
```typescript
import cron from "node-cron";
import { scrapeAmbisis } from "./scrape-ambisis";

const CRON_EXPRESSION = "0 6 * * *";
const TIMEZONE = "America/Sao_Paulo";

console.log(`[scheduler] started — will run at 06:00 São Paulo time (${CRON_EXPRESSION})`);

cron.schedule(
  CRON_EXPRESSION,
  async () => {
    console.log(`[scheduler] ${new Date().toISOString()} — starting scrape`);
    try {
      await scrapeAmbisis();
    } catch (err) {
      console.error("[scheduler] scrape failed:", err);
    }
  },
  { timezone: TIMEZONE }
);

// Keep process alive
setInterval(() => {}, 1 << 30);
```

- [ ] **Step 2: Test scheduler starts**

```bash
npm run scheduler
```
Expected: `[scheduler] started — will run at 06:00 São Paulo time (0 6 * * *)` — process stays alive.

Press Ctrl+C to stop.

- [ ] **Step 3: Commit**

```bash
git add src/scraper/scheduler.ts
git commit -m "feat: add node-cron scheduler running daily at 06:00 São Paulo"
```

---

### Task 14: Docker Setup

**Files:**
- Create: `Dockerfile`, `Dockerfile.scraper`, `docker-compose.yml`, `nginx.conf`, `.env.example`

- [ ] **Step 1: Create Next.js Dockerfile**

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm install prisma @prisma/client

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

> Note: Add `output: "standalone"` to `next.config.ts`:
```typescript
const nextConfig = { output: "standalone" };
export default nextConfig;
```

- [ ] **Step 2: Create scraper Dockerfile**

Create `Dockerfile.scraper`:
```dockerfile
FROM mcr.microsoft.com/playwright:v1.47.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/scraper ./src/scraper
COPY prisma ./prisma
RUN npx prisma generate
RUN npx playwright install chromium --with-deps
CMD ["npx", "tsx", "src/scraper/scheduler.ts"]
```

- [ ] **Step 3: Create docker-compose.yml**

Create `docker-compose.yml`:
```yaml
version: "3.9"

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: licencas-web
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    env_file: .env.prod
    volumes:
      - db_data:/data
    environment:
      - DATABASE_URL=file:/data/licencas.db

  scraper:
    build:
      context: .
      dockerfile: Dockerfile.scraper
    container_name: licencas-scraper
    restart: unless-stopped
    env_file: .env.prod
    volumes:
      - db_data:/data
    environment:
      - DATABASE_URL=file:/data/licencas.db

  nginx:
    image: nginx:alpine
    container_name: licencas-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro

volumes:
  db_data:
```

- [ ] **Step 4: Create nginx.conf**

Create `nginx.conf`:
```nginx
server {
    listen 80;
    server_name licencas.desenvolvimentogw.com.br;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name licencas.desenvolvimentogw.com.br;

    ssl_certificate     /etc/letsencrypt/live/licencas.desenvolvimentogw.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/licencas.desenvolvimentogw.com.br/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 10M;

    location / {
        proxy_pass         http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

- [ ] **Step 5: Create .env.example**

Create `.env.example`:
```
DATABASE_URL=file:/data/licencas.db
NEXTAUTH_URL=https://licencas.desenvolvimentogw.com.br
NEXTAUTH_SECRET=generate-with-openssl-rand-hex-32
AMBISIS_EMAIL=gabriel.barbosa@generalwater.com.br
AMBISIS_PASSWORD=Gabriel@123
SEED_EMAIL=bruce@generalwater.com.br
SEED_PASSWORD=DefineYourPasswordHere
```

- [ ] **Step 6: Add .env files to .gitignore**

Edit `.gitignore`, add:
```
.env
.env.prod
dev.db
```

- [ ] **Step 7: Commit**

```bash
git add Dockerfile Dockerfile.scraper docker-compose.yml nginx.conf .env.example .gitignore next.config.ts
git commit -m "feat: add Docker Compose setup with Nginx reverse proxy"
```

---

### Task 15: Deploy to Oracle Cloud VM

This task runs on the Oracle Cloud VM via SSH, not on the local machine.

- [ ] **Step 1: SSH into Oracle VM**

```bash
ssh ubuntu@<ORACLE_VM_IP>
```

- [ ] **Step 2: Install Docker and Docker Compose**

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

- [ ] **Step 3: Open firewall ports (Oracle Cloud Console)**

In Oracle Cloud Console → Networking → VCN → Security Lists:
- Add ingress rule: TCP port 80 from 0.0.0.0/0
- Add ingress rule: TCP port 443 from 0.0.0.0/0

Also on the VM:
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

- [ ] **Step 4: Copy project to VM**

On local machine:
```bash
git init
git remote add oracle ubuntu@<ORACLE_VM_IP>:/home/ubuntu/licencas.git
git push oracle main
```

Or use `scp`:
```bash
scp -r "C:\Users\bruce.damascena\OneDrive - General Water\Área de Trabalho\AMBISIS" ubuntu@<ORACLE_VM_IP>:/home/ubuntu/licencas
```

- [ ] **Step 5: Add Cloudflare DNS record**

In Cloudflare dashboard → DNS → Add record:
```
Type: A
Name: licencas
Content: <ORACLE_VM_IP>
Proxy: OFF (grey cloud) — needed for Certbot
TTL: Auto
```

- [ ] **Step 6: Get SSL certificate with Certbot**

On Oracle VM:
```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone \
  -d licencas.desenvolvimentogw.com.br \
  --email bruce@generalwater.com.br \
  --agree-tos --non-interactive
```

Expected: `Certificate is saved at: /etc/letsencrypt/live/licencas.desenvolvimentogw.com.br/fullchain.pem`

- [ ] **Step 7: Create .env.prod on VM**

```bash
cd /home/ubuntu/licencas
cp .env.example .env.prod
nano .env.prod   # fill in real values
# Generate NEXTAUTH_SECRET:
openssl rand -hex 32
```

- [ ] **Step 8: Build and start**

```bash
docker compose up -d --build
```

Expected: 3 containers running (`licencas-web`, `licencas-scraper`, `licencas-nginx`).

- [ ] **Step 9: Run database migration and seed on VM**

```bash
docker exec licencas-web npx prisma migrate deploy
docker exec licencas-web npm run db:seed
```

- [ ] **Step 10: Enable Cloudflare proxy (orange cloud)**

In Cloudflare DNS → click the grey cloud next to the `licencas` record → turn orange.

- [ ] **Step 11: Verify deployment**

Open `https://licencas.desenvolvimentogw.com.br` in browser.
Expected: redirect to `/login`, login works, dashboard loads.

- [ ] **Step 12: Set up Certbot auto-renewal**

```bash
sudo crontab -e
```
Add:
```
0 3 * * * certbot renew --quiet && docker exec licencas-nginx nginx -s reload
```

- [ ] **Step 13: Final commit with deploy notes**

```bash
git add -A
git commit -m "feat: complete dashboard deploy — licencas.desenvolvimentogw.com.br"
```

---

## Summary

| Task | Deliverable |
|---|---|
| 1 | Next.js 14 project scaffolded with all deps |
| 2 | SQLite schema with License + User models |
| 3 | license-utils.ts with 13 passing tests |
| 4 | NextAuth credentials login + JWT middleware |
| 5 | Seed script to create admin user |
| 6 | GET /api/licenses with all filters |
| 7 | Login page (/login) with GW branding |
| 8 | SummaryCards (6 counters, clickable) |
| 9 | Filters (busca, cliente, status, mês, ano) |
| 10 | LicenseTable with color-coded rows + badges |
| 11 | Dashboard page (full layout) |
| 12 | Playwright scraper + selector mapping |
| 13 | node-cron scheduler (06:00 São Paulo) |
| 14 | Docker Compose + Nginx + SSL |
| 15 | Oracle Cloud VM deploy |
