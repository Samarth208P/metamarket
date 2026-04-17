import { useMemo, useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import type { PricePoint } from "@/hooks/use-binance-feed";

interface BinaryChartProps {
  priceHistory: PricePoint[];
  targetPrice: number;
  currentPrice: number;
  isConnected: boolean;
  frozenAtTime?: number;
  frozenPrice?: number;
}

export function BinaryChart({
  priceHistory,
  targetPrice,
  currentPrice,
  isConnected,
  frozenAtTime,
  frozenPrice,
}: BinaryChartProps) {
  const [now, setNow] = useState(Date.now());
  
  useEffect(() => {
    let frameId: number;
    const loop = () => {
      setNow(Date.now());
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const delayedTime = frozenAtTime ? frozenAtTime : (now - 1000);
  const displayCurrentPrice = frozenPrice !== undefined ? frozenPrice : currentPrice;

  const chartData = useMemo(() => {
    return priceHistory
      .filter((point) => point.timestamp <= delayedTime)
      .map((point) => ({
        time: point.timestamp, // use raw timestamp for sliding axis
        price: point.price,
        timestamp: point.timestamp,
      }));
  }, [priceHistory, delayedTime]);

  // Dynamic Y-axis domain based on data range
  const { yMin, yMax } = useMemo(() => {
    if (chartData.length === 0) {
      const padding = targetPrice * 0.001;
      return { yMin: targetPrice - padding, yMax: targetPrice + padding };
    }
    const prices = chartData.map((d) => d.price);
    const allPrices = [...prices, targetPrice];
    const min = Math.min(...allPrices);
    const max = Math.max(...allPrices);
    const range = max - min || targetPrice * 0.001;
    const padding = range * 0.15;
    return {
      yMin: Math.floor(min - padding),
      yMax: Math.ceil(max + padding),
    };
  }, [chartData, targetPrice]);

  const plottedPrice = chartData.length > 0 ? chartData[chartData.length - 1].price : displayCurrentPrice;
  const isAboveTargetVisual = plottedPrice >= targetPrice;
  const isAboveTargetLive = displayCurrentPrice >= targetPrice;
  
  const accentColor = isAboveTargetVisual ? "#22c55e" : "#ef4444";
  const liveAccentColor = isAboveTargetLive ? "#34d399" : "#f87171"; // emerald-400 / red-400
  const gradientId = "priceGradient";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 backdrop-blur-xl p-4 sm:p-6 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <img src="/bitcoin-logo.svg" className="w-4 h-4 drop-shadow-md" alt="BTC" />
            <span className="text-sm font-semibold text-zinc-400 tracking-wider uppercase">
              BTC/USDT
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
                  isConnected
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-red-400"
                }`}
              />
              {isConnected ? "LIVE" : "OFFLINE"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl sm:text-3xl font-bold tracking-tight text-white tabular-nums">
            ${displayCurrentPrice.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            <span
              className={`ml-2 text-sm sm:text-base font-bold ${
                isAboveTargetLive ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {isAboveTargetLive ? "▲" : "▼"}{" "}
              {Math.abs(displayCurrentPrice - targetPrice).toFixed(2)}
            </span>
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            Target:{" "}
            <span className="text-zinc-300 font-medium">
              ${targetPrice.toLocaleString("en-US", {
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
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-zinc-500">
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
                  <stop
                    offset="0%"
                    stopColor={accentColor}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor={accentColor}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                type="number"
                domain={[delayedTime - 30000, delayedTime]}
                axisLine={false}
                tick={false}
              />
              <YAxis
                domain={[yMin, yMax]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: "#71717a" }}
                tickFormatter={(v) => `$${v.toLocaleString()}`}
                width={72}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(24, 24, 27, 0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "12px",
                  padding: "8px 12px",
                  backdropFilter: "blur(8px)",
                }}
                labelStyle={{ color: "#a1a1aa", fontSize: 11, marginBottom: 4 }}
                itemStyle={{ color: "#fff", fontSize: 13, fontWeight: 600 }}
                labelFormatter={(label) => new Date(label).toLocaleTimeString("en-IN", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
                formatter={(value: number) => [
                  `$${value.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`,
                  "BTC Price",
                ]}
              />
              <ReferenceLine
                y={targetPrice}
                stroke="#fbbf24"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                label={{
                  value: "TARGET",
                  position: "insideTopLeft",
                  fill: "#fbbf24",
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={accentColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: accentColor,
                  stroke: "#18181b",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

    </motion.div>
  );
}
