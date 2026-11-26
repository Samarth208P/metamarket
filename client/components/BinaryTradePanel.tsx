import { TradeModeSwitch } from "./TradeModeSwitch";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculatePotentialPayout, formatPaise } from "@shared/binaryPrice";
import type {
  BinaryMarket as BinaryMarketType,
  BinaryQuotes,
} from "@shared/binaryPrice";
import type { BinaryAsset } from "@shared/binaryAssets";
import { maxPurchaseAmount, pricePurchase } from "@shared/purchase";
import { ArrowUp, ArrowDown, TrendingUp, Loader2 } from "lucide-react";

interface BinaryTradePanelProps {
  asset: BinaryAsset;
  initialSide?: "up" | "down";
  market: BinaryMarketType | null;
  quotes?: BinaryQuotes;
}

const PRESET_AMOUNTS = [10, 50, 100, 500];

export function BinaryTradePanel({
  asset,
  initialSide = "up",
  market,
  quotes,
}: BinaryTradePanelProps) {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState<string>("");
  const [selectedSide, setSelectedSide] = useState(initialSide);
  const [isTrading, setIsTrading] = useState(false);
  const [timeRemainingMs, setTimeRemainingMs] = useState(0);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSellConfirming, setIsSellConfirming] = useState(false);
  const [pendingSellRatio, setPendingSellRatio] = useState<number>(1);

  // ── Countdown timer ────────────────────────────────────────────
  useEffect(() => {
    if (!market) return;
    const endTime = new Date(market.endTime).getTime();
    const tick = () => setTimeRemainingMs(Math.max(0, endTime - Date.now()));
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [market]);

  const sidePrices = quotes?.[tradeType];
  const buyPrice = quotes?.buy[selectedSide];
  const sellPrice = quotes?.sell[selectedSide];

  // ── User positions ─────────────────────────────────────────────
  const currentHolding = useMemo(() => {
    const positions =
      market?.trades.filter(
        (t) => t.userId === user?.id && t.side === selectedSide && !t.sold,
      ) ?? [];
    const invested = positions.reduce(
      (sum, t) => sum + t.amount + (t.fee ?? 0),
      0,
    );
    const shares = positions.reduce(
      (sum, t) => sum + calculatePotentialPayout(t.amount, t.entryProbability),
      0,
    );
    return {
      positions,
      invested,
      value: sellPrice ? shares * sellPrice : null,
    };
  }, [market, user?.id, selectedSide, sellPrice]);

  const numericAmount = Number(amount) || 0;
  const { fee, totalCost } = pricePurchase(numericAmount);
  const isMarketActive = market?.status === "active" && timeRemainingMs > 0;
  const canBuy =
    isMarketActive &&
    !!buyPrice &&
    !isTrading &&
    numericAmount >= 1 &&
    totalCost <= (user?.balance ?? 0);

  // ── Trade handler ──────────────────────────────────────────────
  const handleTrade = useCallback(async () => {
    if (!market || !user || !isMarketActive || !buyPrice || isTrading) return;
    if (numericAmount < 1) {
      toast({ title: "Minimum bet is ₹1", variant: "destructive" });
      return;
    }
    if (totalCost > (user.balance || 0)) {
      toast({ title: "Insufficient balance", variant: "destructive" });
      return;
    }

    setIsTrading(true);
    try {
      const res = await fetch(`/mapi/binary-markets/${market.id}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          side: selectedSide,
          amount: numericAmount,
          maxPrice: buyPrice,
        }),
      });

      const data = await res.json();
      void queryClient.invalidateQueries({
        queryKey: ["binary-market-active", market.assetPair],
      });
      if (!res.ok) throw new Error(data.error || "Trade failed");

      updateUser(data.user);
      toast({
        title: `${asset.symbol} ${selectedSide.toUpperCase()} position opened`,
        notificationKind: "trade",
        notificationHref: asset.path,
        description: `₹${data.totalCost.toFixed(2)} paid, including ₹${data.trade.fee.toFixed(2)} fee, at ${formatPaise(data.trade.entryProbability)} per share.`,
      });
      setAmount("");
      setIsConfirming(false);
    } catch (err: any) {
      toast({
        title: "Trade failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsTrading(false);
    }
  }, [
    asset,
    market,
    user,
    numericAmount,
    selectedSide,
    totalCost,
    buyPrice,
    isMarketActive,
    queryClient,
    isTrading,
    toast,
    updateUser,
  ]);

  // ── Sell handler ───────────────────────────────────────────────
  const handleSell = useCallback(
    async (ratio: number = 1) => {
      if (!market || !user || !isMarketActive || !sellPrice || isTrading)
        return;
      if (currentHolding.positions.length === 0) {
        toast({ title: "No position to sell", variant: "destructive" });
        return;
      }

      setIsTrading(true);
      try {
        const res = await fetch(`/mapi/binary-markets/${market.id}/sell`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            side: selectedSide,
            ratio,
            minPrice: sellPrice,
          }),
        });
        const data = await res.json();
        void queryClient.invalidateQueries({
          queryKey: ["binary-market-active", market.assetPair],
        });
        if (!res.ok) throw new Error(data.error || "Sell failed");

        updateUser(data.user);
        toast({
          notificationKind: "trade",
          notificationHref: asset.path,
          title:
            ratio >= 1
              ? `${asset.symbol} position closed`
              : `Sold ${Math.round(ratio * 100)}% of ${selectedSide.toUpperCase()}`,
          description: `You received ₹${data.cashOutValue.toFixed(2)}`,
        });
        setIsConfirming(false);
        setIsSellConfirming(false);
      } catch (err: any) {
        toast({
          title: "Sell failed",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setIsTrading(false);
      }
    },
    [
      asset,
      market,
      user,
      isTrading,
      isMarketActive,
      sellPrice,
      queryClient,
      selectedSide,
      currentHolding,
      toast,
      updateUser,
    ],
  );

  // ── Countdown display ──────────────────────────────────────────
  const mins = Math.floor(timeRemainingMs / 60000);
  const secs = Math.floor((timeRemainingMs % 60000) / 1000);

  const countdownDisplay = (
    <div className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-muted/50 border border-border/50">
      {!market || timeRemainingMs <= 0 ? (
        <>
          <Loader2 className="w-3.5 h-3.5 text-muted-foreground motion-safe:animate-spin mr-1" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Next round starting...
          </span>
        </>
      ) : (
        <>
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-2">
            Closes in
          </span>
          <div className="flex items-center gap-1 font-mono">
            <span className="bg-foreground/10 text-foreground text-sm font-black px-1.5 py-0.5 rounded">
              {String(mins).padStart(2, "0")}
            </span>
            <span className="text-muted-foreground font-bold">:</span>
            <span className="bg-foreground/10 text-foreground text-sm font-black px-1.5 py-0.5 rounded">
              {String(secs).padStart(2, "0")}
            </span>
          </div>
        </>
      )}
    </div>
  );

  // ── Max handler ────────────────────────────────────────────────
  const handleMax = () => {
    if (!user) return;
    if (tradeType === "buy") {
      setAmount(String(maxPurchaseAmount(user.balance)));
    } else {
      // For sell, max = 100% (will use ratio)
      setAmount("100");
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col overflow-hidden">
      {/* ── Trade controls ─────────────────────────────────────── */}
      <div className="p-6 flex flex-col gap-5">
        {countdownDisplay}

        <TradeModeSwitch
          value={tradeType}
          disabled={isTrading}
          onChange={(mode) => {
            setTradeType(mode);
            setIsConfirming(false);
            setIsSellConfirming(false);
            setAmount("");
          }}
        />

        {/* Outcome Selector — Up / Down */}
        <div className="grid grid-cols-2 gap-2">
          <button
            aria-pressed={selectedSide === "up"}
            onClick={() => setSelectedSide("up")}
            className={cn(
              "flex flex-col items-center py-4 rounded-xl border-2 transition-colors",
              selectedSide === "up"
                ? "border-yes bg-yes/15 ring-2 ring-yes/20"
                : "border-transparent bg-muted/50 hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "text-[10px] font-black mb-1 uppercase tracking-wider",
                selectedSide === "up" ? "text-yes" : "text-muted-foreground",
              )}
            >
              Up
            </span>
            <span className="text-xl font-black">
              {sidePrices ? formatPaise(sidePrices.up) : "—"}
            </span>
          </button>
          <button
            aria-pressed={selectedSide === "down"}
            onClick={() => setSelectedSide("down")}
            className={cn(
              "flex flex-col items-center py-4 rounded-xl border-2 transition-colors",
              selectedSide === "down"
                ? "border-no bg-no/15 ring-2 ring-no/20"
                : "border-transparent bg-muted/50 hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "text-[10px] font-black mb-1 uppercase tracking-wider",
                selectedSide === "down" ? "text-no" : "text-muted-foreground",
              )}
            >
              Down
            </span>
            <span className="text-xl font-black">
              {sidePrices ? formatPaise(sidePrices.down) : "—"}
            </span>
          </button>
        </div>

        {/* ── BUY MODE ──────────────────────────────────────────── */}
        {tradeType === "buy" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-medium uppercase tracking-wider">
                Amount in ₹
              </span>
              <span className="font-bold text-primary bg-primary/5 px-2 py-1 rounded-md">
                Balance: ₹{user?.balance?.toLocaleString() ?? 0}
              </span>
            </div>
            <div className="relative group">
              <Input
                type="number"
                placeholder="0"
                value={amount}
                disabled={isTrading}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 text-lg font-bold bg-muted/20 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-colors pr-16 rounded-xl"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <button
                  onClick={handleMax}
                  className="px-2 py-1 text-[10px] font-black uppercase bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors shadow-sm"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((val) => (
                <Button
                  key={val}
                  variant="outline"
                  size="sm"
                  className="h-8 text-[10px] font-bold border-border bg-muted/10 hover:bg-primary/10 hover:text-primary hover:border-primary/30 rounded-lg transition-colors"
                  onClick={() =>
                    setAmount((prev) => String((Number(prev) || 0) + val))
                  }
                >
                  +₹{val}
                </Button>
              ))}
            </div>

            {/* Quote box */}
            <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs">
              {numericAmount > 0 && buyPrice ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Potential Payout
                    </span>
                    <span className="font-bold text-yes">
                      ₹
                      {calculatePotentialPayout(
                        numericAmount,
                        buyPrice,
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Entry Price</span>
                    <span className="font-bold">{formatPaise(buyPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Purchase fee (₹1 + 0.1%)
                    </span>
                    <span className="font-bold">₹{fee.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total to pay</span>
                    <span className="font-bold">₹{totalCost.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground italic text-center">
                  {buyPrice
                    ? "Enter an amount to see potential returns."
                    : "Waiting for a live quote."}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SELL MODE ─────────────────────────────────────────── */}
        {tradeType === "sell" && (
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground font-medium uppercase tracking-wider">
                Sell Position
              </span>
              <span className="font-bold text-primary bg-primary/5 px-2 py-1 rounded-md">
                Cost basis ₹{currentHolding.invested.toFixed(2)}
              </span>
            </div>

            {currentHolding.positions.length > 0 && !sellPrice ? (
              <p className="text-sm text-muted-foreground">
                Waiting for a live sell quote.
              </p>
            ) : currentHolding.positions.length > 0 ? (
              <>
                {/* Current Position Card */}
                <div
                  className={cn(
                    "p-4 rounded-xl border flex items-center justify-between",
                    selectedSide === "up"
                      ? "border-yes/30 bg-yes/5"
                      : "border-no/30 bg-no/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {selectedSide === "up" ? (
                      <ArrowUp className="w-4 h-4 text-yes" />
                    ) : (
                      <ArrowDown className="w-4 h-4 text-no" />
                    )}
                    <span
                      className={cn(
                        "font-bold text-sm",
                        selectedSide === "up" ? "text-yes" : "text-no",
                      )}
                    >
                      {selectedSide.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black">
                      ₹{currentHolding.value.toFixed(2)}
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      Invested: ₹{currentHolding.invested.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Sell ratio buttons — stage ratio for confirmation */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "25%", ratio: 0.25 },
                    { label: "50%", ratio: 0.5 },
                    { label: "75%", ratio: 0.75 },
                    { label: "MAX", ratio: 1 },
                  ].map(({ label, ratio }) => (
                    <Button
                      key={label}
                      variant="outline"
                      size="sm"
                      disabled={isTrading}
                      className={cn(
                        "h-10 text-xs font-bold border-border bg-muted/10 hover:bg-primary/10 hover:text-primary hover:border-primary/30 rounded-lg transition-colors",
                        pendingSellRatio === ratio &&
                          isSellConfirming &&
                          "border-primary bg-primary/10 text-primary",
                      )}
                      onClick={() => {
                        setPendingSellRatio(ratio);
                        setIsSellConfirming(false);
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>

                {/* PnL Info */}
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Current Value</span>
                    <span className="font-bold">
                      ₹{currentHolding.value.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cost Basis</span>
                    <span className="font-bold">
                      ₹{currentHolding.invested.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/50 pt-2">
                    <span className="text-muted-foreground font-medium">
                      P&L
                    </span>
                    <span
                      className={cn(
                        "font-black text-sm",
                        currentHolding.value - currentHolding.invested >= 0
                          ? "text-yes"
                          : "text-no",
                      )}
                    >
                      {currentHolding.value - currentHolding.invested >= 0
                        ? "+"
                        : ""}
                      ₹
                      {(currentHolding.value - currentHolding.invested).toFixed(
                        2,
                      )}
                    </span>
                  </div>
                </div>
                {/* Sell estimate box */}
                <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Selling</span>
                    <span className="font-bold">
                      {Math.round(pendingSellRatio * 100)}% of{" "}
                      {selectedSide.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Est. Return</span>
                    <span className="font-bold text-yes">
                      ₹{(currentHolding.value * pendingSellRatio).toFixed(2)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-border bg-muted/10">
                <TrendingUp className="w-8 h-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No {selectedSide.toUpperCase()} position to sell
                </p>
                <button
                  onClick={() => setTradeType("buy")}
                  className="mt-3 text-xs font-bold text-primary hover:text-primary/80"
                >
                  Open a trade first
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sell Submit Button ───────────────────────────────────── */}
      {tradeType === "sell" && currentHolding.positions.length > 0 && (
        <div className="p-6 pt-0">
          <div className="flex flex-col gap-2">
            {isSellConfirming ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsSellConfirming(false)}
                  disabled={isTrading}
                  className="flex-1 h-12 font-bold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleSell(pendingSellRatio)}
                  disabled={isTrading || !isMarketActive || !sellPrice}
                  className={cn(
                    "flex-[2] h-12 text-base font-black uppercase tracking-widest",
                    selectedSide === "up"
                      ? "bg-yes text-white hover:bg-yes/90"
                      : "bg-no text-white hover:bg-no/90",
                  )}
                >
                  {isTrading ? (
                    <Loader2 className="w-5 h-5 motion-safe:animate-spin" />
                  ) : (
                    `Confirm Sell ${Math.round(pendingSellRatio * 100)}%`
                  )}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setIsSellConfirming(true)}
                disabled={!isMarketActive || !sellPrice || isTrading}
                className="w-full h-12 text-base font-bold bg-primary"
              >
                Review Sell — {Math.round(pendingSellRatio * 100)}%
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Submit Button ──────────────────────────────────────── */}
      {tradeType === "buy" && (
        <div className="p-6 pt-0">
          <div className="flex flex-col gap-2">
            {isConfirming ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsConfirming(false)}
                  disabled={isTrading}
                  className="flex-1 h-12 font-bold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleTrade}
                  disabled={!canBuy}
                  className={cn(
                    "flex-[2] h-12 text-base font-black uppercase tracking-widest",
                    selectedSide === "up"
                      ? "bg-yes text-white hover:bg-yes/90"
                      : "bg-no text-white hover:bg-no/90",
                  )}
                >
                  {isTrading ? (
                    <Loader2 className="w-5 h-5 motion-safe:animate-spin" />
                  ) : (
                    "Confirm Order"
                  )}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setIsConfirming(true)}
                disabled={!canBuy}
                className="w-full h-12 text-base font-bold bg-primary"
              >
                Review Purchase
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Footer info ────────────────────────────────────────── */}
      <div className="border-t border-border p-4 flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium uppercase tracking-wider">
          Balance
        </span>
        <span className="font-bold text-foreground">
          ₹
          {(user?.balance ?? 0).toLocaleString("en-IN", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>

      {/* Status Messages */}
      {!isMarketActive && market && (
        <div className="px-6 pb-4">
          <p className="text-xs text-muted-foreground text-center">
            {timeRemainingMs <= 0
              ? "⏳ Market settling... next round starts soon"
              : "Waiting for market to open..."}
          </p>
        </div>
      )}
    </div>
  );
}
