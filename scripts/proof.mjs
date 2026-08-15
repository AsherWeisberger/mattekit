import { chromium } from "playwright-core";
import { existsSync } from "fs";

const chrome = "/opt/google/chrome/chrome";
const base = process.env.MK_URL || "http://127.0.0.1:4174/";
const sample = "/tmp/mattekit-sample.jpg";
if (!existsSync(sample)) throw new Error("missing sample " + sample);

const browser = await chromium.launch({
  executablePath: chrome,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const hero = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const hp = await hero.newPage();
await hp.goto(base, { waitUntil: "networkidle" });
await hp.getByText("Keep").first().waitFor({ timeout: 20000 });
await hp.waitForTimeout(1400);
await hp.screenshot({ path: "/workspace/mattekit/proof-hero.png" });
console.log("wrote hero");
await hero.close();

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("console", (m) => console.log("PAGE", m.type(), m.text()));
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(base, { waitUntil: "networkidle" });
await page.setInputFiles("input[type=file]", sample);
await page.getByText("After", { exact: true }).first().waitFor({ timeout: 300000 });
await page.waitForTimeout(900);
const swatches = page.locator(".swatch");
if (await swatches.count() > 8) await swatches.nth(8).click();
await page.waitForTimeout(700);
await page.screenshot({ path: "/workspace/mattekit/proof-desktop.png" });
console.log("wrote desktop");

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await page.screenshot({ path: "/workspace/mattekit/proof-phone.png" });
console.log("wrote phone");

await browser.close();
