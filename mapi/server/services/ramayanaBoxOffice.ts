import {
  RAMAYANA_DAILY_SOURCE,
  ramayanaBoxOfficeSnapshot,
  type RamayanaBoxOffice,
} from "../../../shared/ramayana.ts";

export const refreshInterval = 60_000;

function plainText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&#8377;|&#x20b9;/gi, "\u20b9")
    .replace(/\s+/g, " ")
    .trim();
}

function cells(row: string, element: "th" | "td") {
  const pattern = new RegExp(
    "<" + element + "\\b[^>]*>([\\s\\S]*?)</" + element + ">",
    "gi",
  );
  return Array.from(row.matchAll(pattern), (cell) => plainText(cell[1]));
}

function amount(digits: string) {
  return Number(digits.replace(/,/g, ""));
}

function dailyFigures(html: string) {
  const table = html.match(
    /<table\b[^>]*\bclass=["'][^"']*\bbr-dw\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i,
  )?.[1];
  if (!table) return null;
  const header = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)?.[1] ?? "";
  const column = cells(header, "th").findIndex((name) =>
    /^worldwide$/i.test(name),
  );
  if (column < 1) return null;

  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
  const dailyGross: number[] = [];
  let pendingDay: number | null = null;
  for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const values = cells(row[1], "td");
    const day = Number(values[0]?.match(/^Day\s+(\d+)\b/i)?.[1]);
    if (!day) continue;
    if (day !== dailyGross.length + 1) break;
    const gross = values[column]?.match(
      /^\u20b9\s*([\d,]+(?:\.\d{1,2})?)\s*Cr$/i,
    );
    if (!gross) {
      pendingDay = day;
      break;
    }
    dailyGross.push(amount(gross[1]));
  }
  return { dailyGross, pendingDay };
}

export function parseRamayanaBoxOffice(
  html: string,
  previous = ramayanaBoxOfficeSnapshot,
): RamayanaBoxOffice | null {
  // The daily table can lag behind the desk's published worldwide total.
  const summary = html.match(
    /<h[1-6]\b[^>]*>\s*Overseas and worldwide\s*<\/h[1-6]>([\s\S]*?)(?=<table\b|<h[1-6]\b|<\/section>|$)/i,
  );
  const gross =
    summary &&
    plainText(summary[1]).match(
      /\u20b9\s*([\d,]+(?:\.\d{1,2})?)\s*Cr\s+Worldwide gross\b/i,
    );
  if (!gross || !Number.isFinite(amount(gross[1]))) return null;
  const daily = dailyFigures(html);
  const history =
    daily && daily.dailyGross.length >= previous.dailyGross.length
      ? daily
      : previous;
  return {
    worldwideGross: amount(gross[1]),
    checkedAt: Date.now(),
    dailyGross: history.dailyGross,
    pendingDay: history.pendingDay,
    sourceStatus: "current",
  };
}

let nextRefresh = 0;
let lastReport = ramayanaBoxOfficeSnapshot;
let refresh: Promise<RamayanaBoxOffice> | undefined;

async function refreshBoxOffice() {
  try {
    const source = new URL(RAMAYANA_DAILY_SOURCE);
    source.hash = "";
    const response = await fetch(source, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "text/html" },
    });
    if (!response.ok) throw new Error("Sacnilk returned an error");
    const report = parseRamayanaBoxOffice(await response.text(), lastReport);
    if (!report) throw new Error("Missing published worldwide gross");
    lastReport = report;
  } catch {
    lastReport = { ...lastReport, sourceStatus: "saved" };
  }
  nextRefresh = Date.now() + refreshInterval;
  return lastReport;
}

export function getRamayanaBoxOffice() {
  if (Date.now() < nextRefresh) return Promise.resolve(lastReport);
  refresh ??= refreshBoxOffice().finally(() => {
    refresh = undefined;
  });
  return refresh;
}

// Send the first snapshot immediately. Subsequent snapshots also act as heartbeats.
export function subscribeRamayanaBoxOffice(send: (data: string) => void) {
  let active = true;
  let timer: ReturnType<typeof setTimeout>;
  async function update() {
    const report = await getRamayanaBoxOffice();
    if (!active) return;
    send(JSON.stringify(report));
    timer = setTimeout(update, Math.max(1, nextRefresh - Date.now()));
  }
  void update();
  return () => {
    active = false;
    clearTimeout(timer);
  };
}
