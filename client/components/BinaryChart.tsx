import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { MARKET_DURATION_MS, type PricePoint } from "@shared/binaryPrice";
import type { BinaryAsset } from "@shared/binaryAssets";
import { cn } from "@/lib/utils";

interface BinaryChartProps {
  asset: BinaryAsset;
  priceHistory: PricePoint[];
  targetPrice: number;
  currentPrice: number;
  isConnected: boolean;
}

export function BinaryChart({
  asset,
  priceHistory,
  targetPrice,
  currentPrice,
  isConnected,
}: BinaryChartProps) {
  const windowEnd = priceHistory[priceHistory.length - 1]?.timestamp ?? 0;
  const windowStart = windowEnd - MARKET_DURATION_MS;
  const chartData = useMemo(() => {
    const firstVisible = priceHistory.findIndex(
      (point) => point.timestamp >= windowStart,
    );
    // Leave a point before the window so the chart can clip the line at the left edge.
    return priceHistory
      .slice(Math.max(0, firstVisible - 1))
      .map(({ timestamp, price }) => ({ time: timestamp, price }));
  }, [priceHistory, windowStart]);

  // Dynamic Y-axis domain based on data range with hysteresis to prevent stuttering
  const { yMin, yMax } = useMemo(() => {
    if (chartData.length === 0) {
      const padding = targetPrice * 0.001;
      return { yMin: targetPrice - padding, yMax: targetPrice + padding };
    }
    const prices = chartData.map((d) => d.price);
    const allPrices = [...prices, targetPrice];
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);

    // We use a fixed percentage padding but round to the nearest $5 or $10
    // to prevent the "vibrating" Y-axis effect when prices move by cents.
    const range = max - min || 10;
    const padding = Math.max(range * 0.2, 5);

    return {
      yMin: Math.floor((min - padding) / 10) * 10,
      yMax: Math.ceil((max + padding) / 10) * 10,
    };
  }, [chartData, targetPrice]);

  const isAboveTarget = currentPrice >= targetPrice;
  const accentColor = isAboveTarget ? "#22c55e" : "#ef4444";
  const gradientId = "priceGradient";

  return (
    <div className="relative rounded-xl border border-border bg-card p-4 sm:p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img
              src={asset.icon}
              className={cn(
                "size-4 rounded-full object-contain drop-shadow-md",
                asset.symbol === "ETH" && "bg-indigo-200 p-0.5",
              )}
              alt=""
            />
            <span className="text-sm font-semibold text-zinc-400 tracking-wider uppercase">
              {asset.symbol}/USDT
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                isConnected
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                }`}
              />
              {isConnected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white tabular-nums">
            $
            {currentPrice.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            <span
              className={`ml-2 text-sm sm:text-base font-bold ${
                isAboveTarget ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {isAboveTarget ? "▲" : "▼"}{" "}
              {Math.abs(currentPrice - targetPrice).toFixed(2)}
            </span>
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Target:{" "}
            <span className="text-zinc-300 font-medium">
              $
              {targetPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[250px] sm:h-[320px] w-full">
        {chartData.length < 2 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center flex flex-col items-center gap-3">
              <img
                src="/animated-logo.svg"
                alt="Loading"
                className="w-16 h-16"
              />
              <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">
                Waiting for price data...
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>
              <XAxis
                dataKey="time"
                type="number"
                domain={[windowStart, windowEnd]}
                allowDataOverflow
                axisLine={false}
                tick={false}
              />
              <YAxis
                domain={[yMin, yMax]}
                axisLine={false}
                tickLine={false}
                ticks={[
                  yMin,
                  ...([yMin, yMax].includes(targetPrice) ? [] : [targetPrice]),
                  yMax,
                ]}
                tick={({ x, y, payload }: any) => {
                  const isTarget = Math.abs(payload.value - targetPrice) < 0.5;
                  return (
                    <text
                      x={x}
                      y={y}
                      dy={4}
                      textAnchor="start"
                      fontSize={isTarget ? 11 : 10}
                      fontWeight={isTarget ? 800 : 500}
                      fill={isTarget ? "#fbbf24" : "#71717a"}
                    >
                      ${payload.value.toLocaleString()}
                    </text>
                  );
                }}
                width={70}
                orientation="right"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(9, 9, 11, 0.9)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  padding: "8px 12px",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)",
                }}
                labelStyle={{
                  color: "#71717a",
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  marginBottom: 2,
                }}
                itemStyle={{ color: "#fff", fontSize: 14, fontWeight: 800 }}
                cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
                labelFormatter={(label) =>
                  new Date(label).toLocaleTimeString("en-IN", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })
                }
                formatter={(value: number) => [
                  `$${value.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`,
                  asset.symbol,
                ]}
              />
              <ReferenceLine
                y={targetPrice}
                stroke="rgba(251, 191, 36, 0.4)"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <Area
                type="basis"
                dataKey="price"
                stroke={accentColor}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: "#fff",
                  stroke: accentColor,
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
                filter="url(#glow)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
