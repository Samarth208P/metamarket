import {
  RAMAYANA_DAILY_SOURCE,
  ramayanaBoxOfficeSnapshot,
  type RamayanaBoxOffice,
} from "../../../shared/ramayana.ts";

function cells(row: string, element: "th" | "td") {
  return Array.from(
    row.matchAll(
      new RegExp(`<${element}\\b[^>]*>([\\s\\S]*?)<\/${element}>`, "gi"),
    ),
    (cell) => cell[1].replace(/<[^>]*>/g, " ").trim(),
  );
}

function grossInHundredths(value = "") {
  const match = value.match(
    /^(?:₹|&#8377;|&#x20b9;)\s*([\d,]+(?:\.\d{1,2})?)\s*Cr$/i,
  );
  return match ? Math.round(Number(match[1].replace(/,/g, "")) * 100) : null;
}

export function parseRamayanaBoxOffice(html: string): RamayanaBoxOffice | null {
  const table = html.match(
    /<table\b[^>]*\bclass=["'][^"']*\bbr-dw\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i,
  )?.[1];
  if (!table) return null;

  const header = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i)?.[1] ?? "";
  const worldwideColumn = cells(header, "th").indexOf("Worldwide");
  if (worldwideColumn < 1) return null;

  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "";
  const dailyGross: number[] = [];
  let pendingDay: number | null = null;
  for (const row of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const values = cells(row[1], "td");
    const day = Number(values[0]?.match(/^Day\s+(\d+)\b/i)?.[1]);
    if (!day) continue;
    if (day !== dailyGross.length + 1 || pendingDay !== null) return null;

    const gross = grossInHundredths(values[worldwideColumn]);
    if (gross === null) {
      if (!values[0].includes("live estimate")) return null;
      pendingDay = day;
    } else {
      dailyGross.push(gross);
    }
  }

  const footer = table.match(/<tfoot\b[^>]*>([\s\S]*?)<\/tfoot>/i)?.[1] ?? "";
  const total = grossInHundredths(cells(footer, "td")[worldwideColumn]);
  if (
    dailyGross.length < ramayanaBoxOfficeSnapshot.dailyGross.length ||
    dailyGross.reduce((sum, gross) => sum + gross, 0) !== total
  ) {
    return null;
  }

  return {
    dailyGross: dailyGross.map((gross) => gross / 100),
    pendingDay,
    sourceStatus: "current",
  };
}

const refreshInterval = 15 * 60 * 1000;
const retryInterval = 5 * 60 * 1000;
let nextRefresh = 0;
let lastReport = ramayanaBoxOfficeSnapshot;
let refresh: Promise<RamayanaBoxOffice> | undefined;

async function refreshBoxOffice() {
  try {
    const source = new URL(RAMAYANA_DAILY_SOURCE);
    source.hash = "";
    const response = await fetch(source, {
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) throw new Error("Sacnilk returned an error");
    const report = parseRamayanaBoxOffice(await response.text());
    if (!report || report.dailyGross.length < lastReport.dailyGross.length) {
      throw new Error("Incomplete worldwide box office report");
    }
    lastReport = report;
    nextRefresh = Date.now() + refreshInterval;
  } catch {
    lastReport = { ...lastReport, sourceStatus: "saved" };
    nextRefresh = Date.now() + retryInterval;
  }
  return lastReport;
}

export function getRamayanaBoxOffice() {
  if (Date.now() < nextRefresh) return Promise.resolve(lastReport);
  refresh ??= refreshBoxOffice().finally(() => {
    refresh = undefined;
  });
  return refresh;
}
