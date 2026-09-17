import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const AMBISIS_URL = "https://app.ambisis.com.br";
const EMAIL = process.env.AMBISIS_EMAIL ?? "gabriel.barbosa@generalwater.com.br";
const PASSWORD = process.env.AMBISIS_PASSWORD ?? "Gabriel@123";

interface ScrapedLicense {
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

function parseDate(str: string | null): Date | null {
  if (!str || str.trim() === "" || str.trim() === "—") return null;
  const [d, m, y] = str.trim().split("/");
  if (!d || !m || !y) return null;
  const dt = new Date(`${y}-${m}-${d}T00:00:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 30000 * Math.pow(2, attempt - 1); // 30s, 60s, 120s
      console.warn(
        `[scraper] attempt ${attempt}/${retries} failed — retrying in ${delay / 1000}s:`,
        (err as Error).message
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

async function doScrape(page: import("playwright").Page): Promise<number> {
  const ts = () => new Date().toISOString();

  console.log(`[scraper] ${ts()} logging in`);
  await page.goto(`${AMBISIS_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"], input[type="email"]', EMAIL);
  await page.fill('input[name="password"], input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|empreendimento|licen/i, { timeout: 30000 });

  console.log(`[scraper] ${ts()} navigating to dashboard`);
  await page.goto(
    `${AMBISIS_URL}/dashboards-inteligentes/dashboards?dashboard=padrao`,
    { waitUntil: "domcontentloaded", timeout: 60000 }
  );

  await page.waitForSelector("table, [class*='table'], [class*='grid']", { timeout: 30000 });
  console.log(`[scraper] ${ts()} table found — extracting rows`);

  const rows = await page.$$eval(
    "table tbody tr, [class*='table'] [class*='row'], [class*='grid'] [class*='row']",
    (trs) =>
      trs.map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td, [class*='cell']")).map(
          (td) => td.textContent?.trim() ?? ""
        );
        return cells;
      })
  );

  const licenses: ScrapedLicense[] = rows
    .filter((r) => r.length >= 5)
    .map((cells) => ({
      nome_empreendimento: cells[0] ?? "",
      cnpj: cells[1] || null,
      cliente: cells[2] || null,
      numero_poco: cells[3] || null,
      requerimento_atual: cells[4] || null,
      requerimento_anterior: cells[5] || null,
      portaria: cells[6] || null,
      validade: cells[7] || null,
      status: cells[8] || null,
      data_protocolo: cells[9] || null,
    }));

  console.log(`[scraper] ${ts()} ${licenses.length} rows parsed — upserting`);

  let upserted = 0;
  for (const lic of licenses) {
    if (!lic.nome_empreendimento) continue;
    await prisma.license.upsert({
      where: {
        cnpj_numero_poco: {
          cnpj: lic.cnpj ?? "",
          numero_poco: lic.numero_poco ?? "",
        },
      },
      update: {
        nome_empreendimento: lic.nome_empreendimento,
        cliente: lic.cliente,
        requerimento_atual: lic.requerimento_atual,
        requerimento_anterior: lic.requerimento_anterior,
        portaria: lic.portaria,
        validade: parseDate(lic.validade),
        status: lic.status,
        data_protocolo: parseDate(lic.data_protocolo),
        scraped_at: new Date(),
      },
      create: {
        nome_empreendimento: lic.nome_empreendimento,
        cnpj: lic.cnpj,
        cliente: lic.cliente,
        numero_poco: lic.numero_poco,
        requerimento_atual: lic.requerimento_atual,
        requerimento_anterior: lic.requerimento_anterior,
        portaria: lic.portaria,
        validade: parseDate(lic.validade),
        status: lic.status,
        data_protocolo: parseDate(lic.data_protocolo),
      },
    });
    upserted++;
  }

  return upserted;
}

export async function scrapeAmbisis(): Promise<number> {
  const ts = () => new Date().toISOString();
  console.log(`[scraper] ${ts()} starting`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();

  try {
    const upserted = await withRetry(() => doScrape(page));
    console.log(`[scraper] ${ts()} done — ${upserted} records upserted`);
    return upserted;
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
}
