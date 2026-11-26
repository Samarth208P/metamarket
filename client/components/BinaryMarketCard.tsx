import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Bookmark } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  activeBinaryMarketQuery,
  binaryMarketCategory,
  binaryMarketTitle,
  binaryPriceHistoryQuery,
} from "@/lib/binary-markets";
import { cn } from "@/lib/utils";
import {
  BINARY_ASSETS,
  type BinaryAsset,
  type BinaryAssetPair,
} from "@shared/binaryAssets";
import {
  formatPaise,
  MARKET_DURATION_MS,
  type PricePoint,
} from "@shared/binaryPrice";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const outcomes = [
  {
    side: "up",
    label: "Up",
    icon: ArrowUp,
    colors:
      "border-emerald-400/20 bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/20 dark:text-emerald-300",
  },
  {
    side: "down",
    label: "Down",
    icon: ArrowDown,
    colors:
      "border-rose-400/20 bg-rose-400/10 text-rose-700 hover:bg-rose-400/20 dark:text-rose-300",
  },
] as const;

export function BinaryMarketCard({
  assetPair,
  isBookmarked,
  onToggleBookmark,
}: {
  assetPair: BinaryAssetPair;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}) {
  const asset = BINARY_ASSETS[assetPair];
  const active = useQuery(activeBinaryMarketQuery(assetPair));
  const history = useQuery(binaryPriceHistoryQuery(assetPair));
  const endTime = Date.parse(active.data?.market?.endTime ?? "");
  const [expiredRound, setExpiredRound] = useState<number>();

  useEffect(() => {
    if (!Number.isFinite(endTime) || endTime <= Date.now()) return;
    const timeout = window.setTimeout(
      () => setExpiredRound(endTime),
      endTime - Date.now(),
    );
    return () => window.clearTimeout(timeout);
  }, [endTime]);

  const livePrice = active.data?.livePrice;
  const latestPoint = history.data?.[history.data.length - 1];
  const windowStart = (latestPoint?.timestamp ?? 0) - MARKET_DURATION_MS;
  const points = useMemo(
    () =>
      history.data?.filter(({ timestamp }) => timestamp >= windowStart) ?? [],
    [history.data, windowStart],
  );
  const spot = livePrice > 0 ? livePrice : latestPoint?.price;
  const isRoundOpen =
    active.data?.market?.status === "active" &&
    endTime > Date.now() &&
    endTime !== expiredRound;
  const quotes =
    isRoundOpen && livePrice > 0 && !active.isError
      ? active.data?.quotes?.buy
      : undefined;
  const quoteStatus = active.isPending
    ? "Loading quotes"
    : active.isError || isRoundOpen
      ? "Quotes unavailable"
      : "Waiting for next round";

  return (
    <article
      className="flex min-h-[17.5rem] flex-1 flex-col gap-3 p-4 sm:p-5 lg:min-h-[20rem]"
      style={{ "--asset-color": asset.accent } as CSSProperties}
    >
      <header className="flex items-start justify-between gap-2">
        <Link
          to={asset.path}
          className="flex min-w-0 items-center gap-3 rounded-md text-foreground hover:text-primary dark:hover:text-[var(--asset-color)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <img
            src={asset.icon}
            alt=""
            className={cn(
              "size-10 shrink-0 rounded-full object-contain",
              asset.symbol === "ETH" && "bg-indigo-200 p-1.5",
            )}
          />
          <div className="min-w-0">
            <h3 className="text-base font-bold leading-snug tracking-tight lg:text-lg">
              {binaryMarketTitle(asset)}
            </h3>
            <span className="text-xs text-muted-foreground">
              {binaryMarketCategory}
            </span>
          </div>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Bookmark ${asset.symbol} market`}
          aria-pressed={isBookmarked}
          onClick={onToggleBookmark}
          className="shrink-0 rounded-full text-muted-foreground hover:bg-muted"
        >
          <Bookmark
            aria-hidden="true"
            className={cn(isBookmarked && "fill-current text-primary")}
          />
        </Button>
      </header>

      <Link
        to={asset.path}
        aria-label={`View ${asset.symbol} price chart`}
        className="flex min-h-32 flex-1 flex-col gap-2 rounded-xl border border-border bg-background/75 px-3 py-2.5 transition-colors hover:border-muted-foreground/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-4 sm:py-3"
      >
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">
              {asset.symbol}/USDT
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums leading-none tracking-tight text-foreground lg:text-2xl">
              {spot === undefined ? "—" : usd.format(spot)}
            </p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">Last 5 min</p>
        </div>
        {points.length >= 2 ? (
          <MarketSparkline
            asset={asset}
            points={points}
            windowStart={windowStart}
          />
        ) : (
          <p className="flex flex-1 items-center justify-center text-center text-xs text-muted-foreground">
            {history.isPending ? "Loading chart" : "Chart unavailable"}
          </p>
        )}
      </Link>

      <div>
        {!quotes && (
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {quoteStatus}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {outcomes.map(({ side, label, icon: Icon, colors }) => (
            <Link
              key={side}
              to={`${asset.path}?side=${side}`}
              className={cn(
                "flex min-h-12 items-center justify-between gap-2 rounded-lg border px-3 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                colors,
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </span>
              <span className="text-base font-bold tabular-nums">
                {quotes ? formatPaise(quotes[side]) : "—"}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}

function MarketSparkline({
  asset,
  points,
  windowStart,
}: {
  asset: BinaryAsset;
  points: PricePoint[];
  windowStart: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = points[points.length - 1];

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!context) return;

    function draw() {
      const { width, height } = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.scale(scale, scale);

      const prices = points.map(({ price }) => price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const padding = 5;
      const span = max - min;
      const range = Math.max(span, 1);
      const plot = points.map(({ timestamp, price }) => ({
        x:
          padding +
          ((timestamp - windowStart) / MARKET_DURATION_MS) *
            (width - padding * 2),
        y:
          height / 2 -
          ((price - (min + span / 2)) / range) * (height - padding * 2),
      }));

      context.strokeStyle = "rgba(148, 163, 184, 0.24)";
      context.setLineDash([3, 4]);
      context.beginPath();
      for (const y of [height * 0.25, height * 0.75]) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.stroke();
      context.setLineDash([]);

      const first = plot[0];
      const last = plot[plot.length - 1];
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const { x, y } of plot.slice(1)) context.lineTo(x, y);
      context.strokeStyle = asset.accent;
      context.lineWidth = 2;
      context.lineJoin = "round";
      context.stroke();

      context.beginPath();
      context.arc(last.x, last.y, 3, 0, Math.PI * 2);
      context.fillStyle = asset.accent;
      context.fill();
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [asset.accent, points, windowStart]);

  return (
    <div className="relative min-h-0 flex-1">
      <canvas
        role="img"
        aria-label={`${asset.name} price over the last five minutes, from ${usd.format(points[0].price)} to ${usd.format(latest.price)}`}
        ref={canvasRef}
        className="absolute inset-0 size-full"
      />
    </div>
  );
}
