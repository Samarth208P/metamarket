import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  calculateLiveProbability,
  calculatePotentialPayout,
  formatPaise,
  formatCountdown,
} from "@shared/binaryPrice";
import type { BinaryMarket as BinaryMarketType } from "@shared/binaryPrice";
import { ArrowUp, ArrowDown, Clock, Zap, TrendingUp, Trophy } from "lucide-react";

interface BinaryTradePanelProps {
  market: BinaryMarketType | null;
  currentPrice: number;
  recentPrices: number[];
  isConnected: boolean;
  isFrozen?: boolean;
  onGoLive?: () => void;
}

const PRESET_AMOUNTS = [10, 25, 50, 100];

export function BinaryTradePanel({
  market,
  currentPrice,
  recentPrices,
  isConnected,
  isFrozen,
  onGoLive,
}: BinaryTradePanelProps) {
  const { user, updateBalance, refreshUser } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>("25");
  const [isTrading, setIsTrading] = useState(false);
  const [timeRemainingMs, setTimeRemainingMs] = useState(0);
  const [lastPUp, setLastPUp] = useState(0.5);
  const [confirmSide, setConfirmSide] = useState<"up" | "down" | null>(null);

  // Update countdown timer
  useEffect(() => {
    if (!market) return;
    const endTime = new Date(market.endTime).getTime();

    const tick = () => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeRemainingMs(remaining);
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [market]);

  // Calculate live probabilities
  const { pUp, pDown, activeVolatility, momentumBias } = useMemo(() => {
    if (!market || currentPrice <= 0) {
      return { pUp: 0.5, pDown: 0.5, activeVolatility: 0.02, momentumBias: 0 };
    }

    const result = calculateLiveProbability({
      currentPrice,
      targetPrice: market.targetPrice,
      timeRemainingMs,
      recentPrices,
    });

    return {
      pUp: result.probability,
      pDown: 1 - result.probability,
      activeVolatility: result.activeVolatility,
      momentumBias: result.momentumBias,
    };
  }, [market, currentPrice, timeRemainingMs, recentPrices]);

  const userTrades = useMemo(() => {
    return market?.trades?.filter((t) => t.userId === user?.id && !t.sold) || [];
  }, [market, user]);

  const upPositions = userTrades.filter((t) => t.side === "up");
  const downPositions = userTrades.filter((t) => t.side === "down");

  const upInvested = upPositions.reduce((s, t) => s + t.amount, 0);
  const upValue = upPositions.reduce((s, t) => s + (t.amount / Math.max(t.entryProbability, 0.01)) * pUp, 0);

  const downInvested = downPositions.reduce((s, t) => s + t.amount, 0);
  const downValue = downPositions.reduce((s, t) => s + (t.amount / Math.max(t.entryProbability, 0.01)) * pDown, 0);

  // Track probability shifts for animation
  useEffect(() => {
    setLastPUp(pUp);
  }, [pUp]);

  const probShift = Math.abs(pUp - lastPUp);
  const shouldAnimate = probShift > 0.02;

  const numericAmount = parseFloat(amount) || 0;
  const potentialPayoutUp = calculatePotentialPayout(numericAmount, pUp);
  const potentialPayoutDown = calculatePotentialPayout(numericAmount, pDown);

  const handleTrade = useCallback(
    async (side: "up" | "down") => {
      if (!market || !user || user.isGuest || isTrading) return;
      if (numericAmount < 1) {
        toast({ title: "Minimum bet is ₹1", variant: "destructive" });
        return;
      }
      if (numericAmount > (user.balance || 0)) {
        toast({ title: "Insufficient balance", variant: "destructive" });
        return;
      }

      setIsTrading(true);
      try {
        const res = await fetch(`/mapi/binary-markets/${market.id}/trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ side, amount: numericAmount }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Trade failed");
        }

        updateBalance(data.userBalance);
        toast({
          title: `${side === "up" ? "🟢 UP" : "🔴 DOWN"} position opened!`,
          description: `₹${numericAmount} at ${formatPaise(
            side === "up" ? pUp : pDown,
          )} — potential payout: ₹${(side === "up"
            ? potentialPayoutUp
            : potentialPayoutDown
          ).toFixed(0)}`,
        });

        // Refresh user data
        refreshUser();
      } catch (err: any) {
        toast({
          title: "Trade failed",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setIsTrading(false);
      }
    },
    [
      market,
      user,
      numericAmount,
      pUp,
      pDown,
      potentialPayoutUp,
      potentialPayoutDown,
      isTrading,
      toast,
      updateBalance,
      refreshUser,
    ],
  );

  const handleSell = useCallback(
    async (side: "up" | "down") => {
      if (!market || !user || user.isGuest || isTrading) return;
      setIsTrading(true);
      try {
        const res = await fetch(`/mapi/binary-markets/${market.id}/sell`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ side }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Cash out failed");
        
        updateBalance(data.userBalance);
        toast({
          title: `Positions Cashed Out!`,
          description: `You sold your ${side.toUpperCase()} trades for ₹${data.cashOutValue.toFixed(2)}`,
        });
        refreshUser();
      } catch (err: any) {
        toast({
          title: "Cash out failed",
          description: err.message,
          variant: "destructive"
        });
      } finally {
        setIsTrading(false);
      }
    },
    [market, user, isTrading, toast, updateBalance, refreshUser]
  );

  const isMarketActive = market?.status === "active" && timeRemainingMs > 0;

  // Countdown progress (0→1)
  const progress = market
    ? 1 -
      timeRemainingMs /
        (new Date(market.endTime).getTime() -
          new Date(market.startTime).getTime())
    : 0;

  if (isFrozen) {
    const isUp = market?.status === "settled_up";
    const target = market?.targetPrice ?? 0;
    const final = market?.finalPrice ?? target;
    
    // We filter entirely based on user trades inside this specific historical slice
    const userFinalTrades = market?.trades?.filter((t) => t.userId === user?.id) || [];
    const hasTraded = userFinalTrades.length > 0;
    const totalInvestedFrozen = userFinalTrades.reduce((sum, t) => sum + t.amount, 0);
    const totalPayoutFrozen = userFinalTrades.reduce((sum, t) => sum + (t.payout || 0), 0);
    const netProfitFrozen = totalPayoutFrozen - totalInvestedFrozen;

    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 backdrop-blur-xl p-5 shadow-2xl flex flex-col h-full justify-center"
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-4 border border-zinc-700/50 shadow-inner">
             <Trophy className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mb-3">Market Settled</h2>
          <div className="flex items-center justify-center gap-2 mb-6">
             <span className="text-zinc-400 text-sm">Winning Outcome:</span>
             <span className={`px-3 py-1 rounded-full text-sm font-bold flex items-center gap-1 ${isUp ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                {isUp ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                {isUp ? "UP" : "DOWN"}
             </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-6 text-left">
            <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50">
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Target</p>
              <p className="text-lg font-mono font-bold text-zinc-300">
                ${target.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </p>
            </div>
            <div className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50">
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1">Final</p>
              <p className={`text-lg font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                ${final.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2})}
              </p>
            </div>
          </div>

          {hasTraded && (
            <div className={`p-4 rounded-xl mb-6 flex items-center justify-between border shadow-sm ${netProfitFrozen >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
              <div>
                 <p className={`text-xs text-left font-bold tracking-wider uppercase mb-0.5 ${netProfitFrozen >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Your PnL</p>
                 <p className="text-[10px] text-left opacity-50 text-white leading-none">Invested: ₹{totalInvestedFrozen.toFixed(0)}</p>
              </div>
              <div className={`text-2xl font-black tabular-nums tracking-tight ${netProfitFrozen >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                 {netProfitFrozen >= 0 ? '+' : ''}₹{netProfitFrozen.toFixed(2)}
              </div>
            </div>
          )}

          <button 
            onClick={onGoLive}
            className="w-full py-4 bg-white hover:bg-zinc-200 text-zinc-900 text-sm font-black uppercase tracking-widest rounded-xl transition-all shadow-xl active:scale-95 flex flex-col items-center justify-center gap-1"
          >
            Go Live
            <span className="text-[10px] opacity-60 font-semibold tracking-normal normal-case">Jump into next market</span>
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 backdrop-blur-xl p-5 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          Quick Trade
        </h3>
      </div>

      {/* Countdown Timer */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Time Remaining
          </span>
          <motion.span
            key={formatCountdown(timeRemainingMs)}
            animate={{ scale: 1 }}
            className={`text-xl font-mono font-bold tabular-nums ${
              timeRemainingMs < 60_000
                ? "text-amber-400"
                : "text-white"
            }`}
          >
            {formatCountdown(timeRemainingMs)}
          </motion.span>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Up / Down Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {!confirmSide ? (
          <>
            <AnimatePresence mode="wait">
              <motion.button
                key={`up-${Math.round(pUp * 100)}`}
                initial={shouldAnimate ? { scale: 0.95 } : undefined}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                disabled={!isMarketActive || isTrading || user?.isGuest}
                onClick={() => setConfirmSide("up")}
                className={`relative flex flex-col items-center justify-center py-4 px-3 rounded-xl font-bold transition-all duration-200 ${
                  isMarketActive && !isTrading
                    ? "bg-yes/20 border border-yes/30 hover:border-yes/60 hover:shadow-lg hover:shadow-yes/10 active:scale-95 cursor-pointer"
                    : "bg-zinc-800/50 border border-zinc-700/30 cursor-not-allowed opacity-50"
                }`}
              >
                <ArrowUp className="w-5 h-5 text-yes mb-1" />
                <span className="text-xl text-yes tabular-nums">
                  {formatPaise(pUp)}
                </span>
                <span className="text-xs text-yes/70 mt-0.5 uppercase tracking-wider">
                  Up
                </span>
              </motion.button>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.button
                key={`down-${Math.round(pDown * 100)}`}
                initial={shouldAnimate ? { scale: 0.95 } : undefined}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                disabled={!isMarketActive || isTrading || user?.isGuest}
                onClick={() => setConfirmSide("down")}
                className={`relative flex flex-col items-center justify-center py-4 px-3 rounded-xl font-bold transition-all duration-200 ${
                  isMarketActive && !isTrading
                    ? "bg-no/20 border border-no/30 hover:border-no/60 hover:shadow-lg hover:shadow-no/10 active:scale-95 cursor-pointer"
                    : "bg-zinc-800/50 border border-zinc-700/30 cursor-not-allowed opacity-50"
                }`}
              >
                <ArrowDown className="w-5 h-5 text-no mb-1" />
                <span className="text-xl text-no tabular-nums">
                  {formatPaise(pDown)}
                </span>
                <span className="text-xs text-no/70 mt-0.5 uppercase tracking-wider">
                  Down
                </span>
              </motion.button>
            </AnimatePresence>
          </>
        ) : (
          <div className="col-span-2 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex gap-2 min-h-[96px]">
              <button onClick={() => setConfirmSide(null)} className="flex-1 py-3 text-sm font-bold text-zinc-300 bg-zinc-800 hover:bg-zinc-700/80 rounded-xl transition-all border border-zinc-700">Cancel</button>
              <button onClick={() => { handleTrade(confirmSide); setConfirmSide(null); }} className={`flex-[2] py-3 text-base font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(0,0,0,0.2)] ${confirmSide === 'up' ? 'bg-yes text-background hover:bg-yes/90' : 'bg-no text-background hover:bg-no/90'}`}>
                Confirm {confirmSide}
              </button>
            </div>
            <p className="text-center text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Lock in {confirmSide} trade</p>
          </div>
        )}
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="text-xs text-zinc-400 mb-1.5 block font-medium">
          Bet Amount
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-medium">
            ₹
          </span>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="1"
            step="1"
            className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-xl py-2.5 pl-7 pr-3 text-white text-lg font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all placeholder:text-zinc-600"
            placeholder="25"
          />
        </div>
        <div className="flex gap-2 mt-2">
          {PRESET_AMOUNTS.map((preset) => (
            <button
              key={preset}
              onClick={() => setAmount(prev => String((parseFloat(prev) || 0) + preset))}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                amount === String(preset)
                  ? "bg-violet-600/30 text-violet-300 border border-violet-500/40"
                  : "bg-zinc-800/50 text-zinc-400 border border-zinc-700/30 hover:bg-zinc-700/50 hover:text-zinc-300"
              }`}
            >
              +{preset}
            </button>
          ))}
        </div>
      </div>

      {/* Payout Preview */}
      {numericAmount >= 1 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mb-4 p-3 rounded-xl bg-zinc-800/40 border border-zinc-700/30"
        >
          <p className="text-xs text-zinc-500 mb-2 font-medium">
            Potential Payout
          </p>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-sm font-bold text-yes">
                ₹{potentialPayoutUp.toFixed(2)}
              </p>
              <p className="text-[10px] text-zinc-500">if Up wins</p>
            </div>
            <div>
              <p className="text-sm font-bold text-no">
                ₹{potentialPayoutDown.toFixed(2)}
              </p>
              <p className="text-[10px] text-zinc-500">if Down wins</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Active Positions */}
      {(upPositions.length > 0 || downPositions.length > 0) && (
        <div className="mb-4">
          <p className="text-xs text-zinc-500 mb-2 font-medium">Your Active Positions</p>
          <div className="space-y-2">
            {upPositions.length > 0 && (
              <div className="p-3 rounded-xl bg-yes/10 border border-yes/20 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowUp className="w-3.5 h-3.5 text-yes" />
                    <span className="text-sm font-bold text-yes">UP</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">Invested: ₹{upInvested.toFixed(0)}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white mb-1 tracking-tight">₹{upValue.toFixed(2)}</div>
                  <button 
                    onClick={() => handleSell('up')}
                    disabled={isTrading}
                    className="px-3 py-1 bg-yes/20 hover:bg-yes/30 text-yes text-xs font-bold rounded-lg transition-colors border border-yes/30 disabled:opacity-50"
                  >
                    Cash Out
                  </button>
                </div>
              </div>
            )}
            
            {downPositions.length > 0 && (
              <div className="p-3 rounded-xl bg-no/10 border border-no/20 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowDown className="w-3.5 h-3.5 text-no" />
                    <span className="text-sm font-bold text-no">DOWN</span>
                  </div>
                  <p className="text-[10px] text-zinc-400">Invested: ₹{downInvested.toFixed(0)}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white mb-1 tracking-tight">₹{downValue.toFixed(2)}</div>
                  <button 
                    onClick={() => handleSell('down')}
                    disabled={isTrading}
                    className="px-3 py-1 bg-no/20 hover:bg-no/30 text-no text-xs font-bold rounded-lg transition-colors border border-no/30 disabled:opacity-50"
                  >
                    Cash Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Balance */}
      <div className="flex items-center justify-between text-sm border-t border-zinc-800 pt-3">
        <span className="text-zinc-500">Your Balance</span>
        <span className="text-white font-bold tabular-nums">
          ₹{(user?.balance ?? 0).toLocaleString("en-IN", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
        </span>
      </div>

      {/* Status messages */}
      {user?.isGuest && (
        <p className="text-xs text-amber-400/80 text-center mt-3">
          Sign in to trade
        </p>
      )}
      {!isMarketActive && market && (
        <p className="text-xs text-zinc-500 text-center mt-3">
          {timeRemainingMs <= 0
            ? "⏳ Market settling... next round starts soon"
            : "Waiting for market to open..."}
        </p>
      )}
      {!market && (
        <p className="text-xs text-zinc-500 text-center mt-3">
          No active market. Next cycle starting soon...
        </p>
      )}
    </motion.div>
  );
}
