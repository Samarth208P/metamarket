import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Layout } from "@/components/Layout";
import { LmsrBetModal } from "@/components/LmsrBetModal";
import { marketCatalogKey } from "@/lib/markets";
import { useRamayanaBoxOffice } from "@/hooks/use-ramayana-box-office";
import { cn } from "@/lib/utils";
import type { Market } from "@shared/api";
import {
  RAMAYANA_DAILY_SOURCE,
  RAMAYANA_MARKET_ID,
  RAMAYANA_SOURCE,
  RAMAYANA_TARGET,
  type RamayanaBoxOffice,
} from "@shared/ramayana";
import "./ramayana-market.css";

const marketKey = ["market", RAMAYANA_MARKET_ID];
const crore = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const dailyCrore = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const shortDate = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function releaseDayDate(day: number) {
  return new Date(Date.UTC(2026, 10, 4 + day));
}

async function fetchReport<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/mapi${path}`, {
    credentials: "include",
    signal,
  });
  if (!response.ok) throw new Error("Unable to load Ramayana market");
  return response.json();
}

function BoxOfficeTracker({ report }: { report: RamayanaBoxOffice }) {
  const [chart, setChart] = useState<"daily" | "total">("total");
  let runningGross = 0;
  const days = report.dailyGross.map((gross, index) => {
    const day = index + 1;
    runningGross += Math.round(gross * 100);
    return {
      day: `Day ${day}`,
      date: releaseDayDate(day),
      gross,
      total: runningGross / 100,
    };
  });
  const latest = days[days.length - 1];
  const cumulative = chart === "total";

  return (
    <div className="min-w-0 space-y-5">
      <section className="ramayana-panel" aria-labelledby="box-office-chart">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="box-office-chart">Worldwide box office</h2>
            <p className="ramayana-muted mt-1 text-sm">
              Daily figures through {shortDate.format(latest.date)}
            </p>
          </div>
          <div className="ramayana-switch" role="group" aria-label="Chart view">
            <button
              type="button"
              aria-pressed={cumulative}
              onClick={() => setChart("total")}
            >
              Cumulative
            </button>
            <button
              type="button"
              aria-pressed={!cumulative}
              onClick={() => setChart("daily")}
            >
              Daily
            </button>
          </div>
        </div>
        <div className="mt-5 h-60 sm:h-72" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={days}
              margin={{ top: 15, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="ramayana-gold-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#e8ad5e" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#e8ad5e" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="#4a3528"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="day"
                tick={{ fill: "#c2a992", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
              />
              <YAxis
                domain={
                  cumulative
                    ? [0, (max: number) => Math.max(max, RAMAYANA_TARGET)]
                    : [0, "auto"]
                }
                tickFormatter={(value) => `₹${crore.format(value)}`}
                tick={{ fill: "#c2a992", fontSize: 11 }}
                width={54}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                labelStyle={{ color: "#f9e7d0" }}
                itemStyle={{ color: "#edbd77" }}
                contentStyle={{
                  background: "#211713",
                  border: "1px solid #715239",
                  borderRadius: 8,
                }}
                formatter={(value) => `₹${dailyCrore.format(Number(value))} cr`}
              />
              {cumulative ? (
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Cumulative worldwide gross"
                  stroke="#edbd77"
                  strokeWidth={2.5}
                  fill="url(#ramayana-gold-fill)"
                  isAnimationActive={false}
                />
              ) : (
                <Bar
                  dataKey="gross"
                  name="Daily worldwide gross"
                  fill="#d39b55"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              )}
              {cumulative && (
                <ReferenceLine
                  y={RAMAYANA_TARGET}
                  stroke="#edbd77"
                  strokeDasharray="6 5"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="ramayana-muted mt-3 text-xs">
          Worldwide theatrical gross in ₹ crore
          {cumulative && " · dashed line marks ₹2,000 crore"}
        </p>
      </section>

      <section
        className="ramayana-panel"
        aria-labelledby="daily-worldwide-gross"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="daily-worldwide-gross">Day-by-day gross</h2>
          <a
            className="ramayana-link"
            href={RAMAYANA_DAILY_SOURCE}
            target="_blank"
            rel="noreferrer"
          >
            Sacnilk day-wise data{" "}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="ramayana-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Date</th>
                <th scope="col">Daily gross</th>
                <th scope="col">Running total</th>
              </tr>
            </thead>
            <tbody>
              {days.map(({ day, date, gross, total }) => (
                <tr key={day}>
                  <th scope="row">{day}</th>
                  <td>
                    <time dateTime={date.toISOString().slice(0, 10)}>
                      {shortDate.format(date)}
                    </time>
                  </td>
                  <td>₹{dailyCrore.format(gross)} cr</td>
                  <td>₹{dailyCrore.format(total)} cr</td>
                </tr>
              ))}
              {report.pendingDay !== null && (
                <tr>
                  <th scope="row">Day {report.pendingDay}</th>
                  <td>{shortDate.format(releaseDayDate(report.pendingDay))}</td>
                  <td className="ramayana-muted" colSpan={2}>
                    Worldwide gross pending
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function RamayanaMarket() {
  const queryClient = useQueryClient();
  const [option, setOption] = useState<string>();
  const [tradeOpen, setTradeOpen] = useState(false);
  const {
    data: market,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: marketKey,
    queryFn: ({ signal }) =>
      fetchReport<Market>(`/markets/${RAMAYANA_MARKET_ID}`, signal),
    refetchInterval: 15_000,
  });
  const boxOffice = useRamayanaBoxOffice();
  const gross = boxOffice.worldwideGross;
  const progress = Math.min(gross / RAMAYANA_TARGET, 1);
  const remaining = Math.max(
    0,
    Math.round((RAMAYANA_TARGET - gross) * 100) / 100,
  );
  const active =
    market?.status === "active" &&
    (!market.endDate || new Date(market.endDate).getTime() > Date.now());
  const result = market?.options.find(
    (outcome) => outcome.id === market.resolvedOptionId,
  );

  return (
    <Layout>
      <div className="ramayana-market">
        <div className="ramayana-container">
          <Link to="/" className="ramayana-link mb-4">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to markets
          </Link>
          <section className="ramayana-hero" aria-labelledby="ramayana-title">
            <img
              className="ramayana-hero-image"
              src="/ramayana/studio.webp"
              alt=""
              width="1600"
              height="900"
              fetchPriority="high"
            />
            <div className="ramayana-hero-copy">
              <p className="ramayana-film-name">Ramayana: Part One</p>
              <h1 id="ramayana-title">
                Will Ramayana cross ₹2,000&nbsp;crore worldwide?
              </h1>
              <div className="ramayana-progress">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="ramayana-gross">
                    ₹{dailyCrore.format(gross)} <small>cr</small>
                  </span>
                  <span className="ramayana-muted text-sm">
                    Worldwide gross ·{" "}
                    {boxOffice.sourceStatus === "saved"
                      ? "Saved figure"
                      : "Sacnilk"}
                  </span>
                </div>
                <div
                  className="ramayana-progress-track"
                  role="progressbar"
                  aria-label="Progress toward ₹2,000 crore"
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <span style={{ transform: `scaleX(${progress})` }} />
                </div>
                <p className="ramayana-muted text-sm">
                  {remaining > 0
                    ? `₹${crore.format(remaining)} cr to the milestone`
                    : gross > RAMAYANA_TARGET
                      ? "Milestone crossed"
                      : "At ₹2,000 crore"}
                </p>
              </div>
            </div>
          </section>

          <div className="ramayana-content">
            <aside
              className="ramayana-trade ramayana-panel"
              aria-labelledby="trade-ramayana"
            >
              <h2 id="trade-ramayana">Trade this market</h2>
              {market ? (
                <>
                  <p className="ramayana-muted mt-1 text-sm">
                    {active
                      ? "Open until resolution"
                      : result
                        ? `Resolved ${result.name}`
                        : "Trading closed"}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {market.options.map((outcome) => (
                      <button
                        key={outcome.id}
                        type="button"
                        disabled={!active}
                        className={cn(
                          "ramayana-outcome",
                          outcome.id === "yes" && "ramayana-outcome-yes",
                        )}
                        onClick={() => {
                          setOption(outcome.id);
                          setTradeOpen(true);
                        }}
                        aria-label={`Trade ${outcome.name} at ${outcome.price.toFixed(0)} paise`}
                      >
                        {outcome.name} <span>{outcome.price.toFixed(0)}p</span>
                      </button>
                    ))}
                  </div>
                  <p className="ramayana-muted mt-3 text-xs">
                    ₹{crore.format(market.volume)} traded
                  </p>
                  <div className="ramayana-rules mt-5 pt-5">
                    <h3 className="font-semibold">Resolution rules</h3>
                    <p className="ramayana-muted mt-2 text-sm leading-relaxed">
                      {market.description}
                    </p>
                  </div>
                </>
              ) : (
                <p className="ramayana-muted mt-3 text-sm" role="status">
                  {isPending
                    ? "Loading market prices…"
                    : "Market prices are unavailable."}
                  {isError && (
                    <button
                      type="button"
                      className="ramayana-link ml-2"
                      onClick={() => void refetch()}
                    >
                      Retry
                    </button>
                  )}
                </p>
              )}
              <a
                href={RAMAYANA_SOURCE}
                target="_blank"
                rel="noreferrer"
                className="ramayana-link mt-4"
              >
                Sacnilk film report{" "}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </a>
            </aside>
            <BoxOfficeTracker report={boxOffice} />
          </div>
          <p className="ramayana-muted mt-5 text-xs">
            Film artwork by{" "}
            <a
              className="ramayana-link"
              href="https://www.primefocusstudios.com/projects/ramayana"
              target="_blank"
              rel="noreferrer"
            >
              Prime Focus Studios
            </a>
            .
          </p>
        </div>
      </div>
      {market && option && (
        <LmsrBetModal
          market={market}
          initialOptionId={option}
          isOpen={tradeOpen}
          onClose={() => setTradeOpen(false)}
          onDismissed={() => setOption(undefined)}
          onTrade={(_marketId, updatedMarket: Market) => {
            queryClient.setQueryData(marketKey, updatedMarket);
            void queryClient.invalidateQueries({ queryKey: marketCatalogKey });
          }}
        />
      )}
    </Layout>
  );
}
