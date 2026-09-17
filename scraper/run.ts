import "dotenv/config";
import { scrapeAmbisis } from "./ambisis";

scrapeAmbisis()
  .then((n) => {
    console.log(`Done: ${n} records`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Scrape failed:", err);
    process.exit(1);
  });
