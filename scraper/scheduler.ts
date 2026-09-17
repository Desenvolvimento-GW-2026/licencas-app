import "dotenv/config";
import cron from "node-cron";
import { scrapeAmbisis } from "./ambisis";

// Runs daily at 06:00 São Paulo time (UTC-3 → 09:00 UTC)
cron.schedule("0 9 * * *", async () => {
  console.log(`[scheduler] Starting scrape at ${new Date().toISOString()}`);
  try {
    const n = await scrapeAmbisis();
    console.log(`[scheduler] Completed: ${n} records`);
  } catch (err) {
    console.error("[scheduler] Error:", err);
  }
}, { timezone: "America/Sao_Paulo" });

console.log("[scheduler] Running. Next scrape at 06:00 America/Sao_Paulo.");
