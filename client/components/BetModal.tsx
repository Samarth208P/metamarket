import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { useAuth } from '@/hooks/use-auth';
import { calculateBuyCost, calculateSellPayout, MarketPool } from '@/lib/amm';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { X, Loader2 } from 'lucide-react';
import { CommentsSection } from './CommentsSection';
import { motion, AnimatePresence } from 'framer-motion';


interface BetModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: {
    id: string; title: string; description: string; yesPrice: number; noPrice: number;
    marketType?: "binary" | "versus" | "multi";
    optionA?: string; optionB?: string; shortA?: string; shortB?: string;
    teamIndex?: number; teamName?: string; pool: MarketPool;
    teams?: { name: string; imageUrl?: string; yesPool: number; noPool: number; yesPrice: number; noPrice: number }[];
    priceHistory?: { yesPrice: number; noPrice: number; allPrices?: number[]; timestamp: string }[];
    status?: string;
    volume?: number;
    resolvedOutcome?: string;
    endDate?: string;
  };
  initialOutcome?: 'yes' | 'no';
  onTrade: (marketId: string, tradeResult: any) => void;
}

export function BetModal({ isOpen, onClose, market, initialOutcome = 'yes', onTrade }: BetModalProps) {
  const [outcome, setOutcome] = useState<'yes' | 'no'>(initialOutcome);
  const [amount, setAmount] = useState('');
  const [isBuying, setIsBuying] = useState(true);
  const { user, updateUser, refreshUser } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [isConfirming, setIsConfirming] = useState(false);
  const [isGraphLoading, setIsGraphLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsGraphLoading(true);
      const timer = setTimeout(() => setIsGraphLoading(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);


  // Multi-market team selection (when opened without a specific team)
  const [internalTeamIdx, setInternalTeamIdx] = useState<number | null>(market.teamIndex ?? null);
  const isMultiNoPick = market.marketType === 'multi' && market.teams && market.teams.length > 0 && internalTeamIdx === null;

  // Derive the active pool/prices from either the pre-selected team or the internally picked one
  const activeTeam = useMemo(() => {
    if (internalTeamIdx !== null && market.teams && market.teams[internalTeamIdx]) {
      return market.teams[internalTeamIdx];
    }
    return null;
  }, [internalTeamIdx, market.teams]);

  const activePool: MarketPool = activeTeam
    ? { yesPool: activeTeam.yesPool, noPool: activeTeam.noPool, totalLiquidity: activeTeam.yesPool + activeTeam.noPool }
    : market.pool;
  const activeYesPrice = activeTeam ? activeTeam.yesPrice : market.yesPrice;
  const activeNoPrice = activeTeam ? activeTeam.noPrice : market.noPrice;
  const activeTeamName = activeTeam?.name || market.teamName;


  const userHolding = useMemo(() => {
    if (!user) return null;
    return user.holdings?.find(h => 
      h.marketId === market.id && 
      (market.teamIndex === undefined || h.teamIndex === market.teamIndex)
    );
  }, [user, market.id, market.teamIndex]);

  const teamALabel = market.shortA || market.optionA || 'Yes';
  const teamBLabel = market.shortB || market.optionB || 'No';

  // Calculate prices for chart
  const numAmount = parseFloat(amount) || 0;
  const currentPrice = outcome === 'yes' ? market.yesPrice : market.noPrice;
  const priceRatio = currentPrice / 100;
  const probableWinnings = isBuying && priceRatio > 0 ? numAmount / priceRatio : 0;

  const cost = useMemo(() => isBuying
    ? calculateBuyCost(activePool, outcome, numAmount)
    : -calculateSellPayout(activePool, outcome, numAmount)
    , [isBuying, activePool, outcome, numAmount]);

  const handleTrade = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/mapi/markets/${market.id}/trade`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, type: isBuying ? 'buy' : 'sell', amount: numAmount, teamIndex: internalTeamIdx ?? market.teamIndex }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        return toast({ title: 'Trade Failed', description: payload?.error || 'Unable to place trade', variant: 'destructive' });
      }

      const payload = await response.json();
      updateUser(payload.user);
      await refreshUser(); 
      onTrade(market.id, payload.market);

      const shareLabel = outcome === 'yes' ? teamALabel : teamBLabel;
      toast({ 
        title: "Trade Executed", 
        description: isBuying 
          ? `Successfully bought ₹${numAmount.toFixed(2)} worth of ${shareLabel} shares!`
          : `Successfully sold ${numAmount.toFixed(2)} ${shareLabel} shares for ₹${Math.abs(cost).toFixed(2)}!`,
      });
      
      setAmount('');
      setIsConfirming(false);
    } catch (err) {
      toast({ title: "Network Error", description: "Failed to connect to server", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMax = () => {
    if (!user) return;
    if (isBuying) {
      setAmount(user.balance.toString());
    } else {
      const holding = user.holdings?.find(h => 
        h.marketId === market.id && 
        (market.teamIndex === undefined || h.teamIndex === market.teamIndex)
      );
      if (holding) {
        const shares = outcome === 'yes' ? holding.yesShares : holding.noShares;
        setAmount(shares.toString());
      } else {
        setAmount('0');
      }
    }
  };

  const titleText = activeTeamName ? `${market.title} - ${activeTeamName}` : market.title;

  const isResolved = market.status && market.status !== "active";

  const earnings = useMemo(() => {
    if (!market.resolvedOutcome || !user) return 0;
    if (userHolding) {
      const winningShares = market.resolvedOutcome === 'yes' ? userHolding.yesShares : userHolding.noShares;
      return winningShares;
    }
    const payoutTrade = user.tradeHistory?.find(t => 
      t.marketId === market.id && 
      t.tradeType === 'payout' &&
      (internalTeamIdx === undefined || t.marketTitle?.includes(`[${activeTeamName}]`))
    );
    return payoutTrade ? Math.abs(payoutTrade.amount) : 0;
  }, [user, userHolding, market.id, market.resolvedOutcome, internalTeamIdx, activeTeamName]);

  // ── Countdown Timer ──────────────────────────────────────────────
  const [countdown, setCountdown] = useState<{ h: number; m: number; s: number } | null>(null);
  const [isTimeClosed, setIsTimeClosed] = useState(() => {
    return market.endDate ? new Date(market.endDate) < new Date() : false;
  });

  useEffect(() => {
    if (!market.endDate) return;
    const endTime = new Date(market.endDate).getTime();

    const tick = () => {
      const now = Date.now();
      const diff = endTime - now;
      if (diff <= 0) {
        setCountdown(null);
        setIsTimeClosed(true);
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      setCountdown({
        h: Math.floor(totalSecs / 3600),
        m: Math.floor((totalSecs % 3600) / 60),
        s: totalSecs % 60,
      });
      setIsTimeClosed(false);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [market.endDate]);

  const isMarketClosed = isResolved || isTimeClosed;

  // ── Graph Logic ──────────────────────────────────────────────────
  const lineColors = ['hsl(var(--yes-color))', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b'];

  const chartData = useMemo(() => {
    if (!market.priceHistory) return [];
    return market.priceHistory.map(p => {
      const data: any = { ...p };
      if (p.allPrices && market.teams) {
        p.allPrices.forEach((price, idx) => {
          data[`team_${idx}`] = price;
        });
      }
      return data;
    });
  }, [market.priceHistory, market.teams]);

  const countdownDisplay = countdown && !isMarketClosed ? (
    <div className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-muted/50 border border-border/50">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-2">Closes in</span>
      <div className="flex items-center gap-1 font-mono">
        <span className="bg-foreground/10 text-foreground text-sm font-black px-1.5 py-0.5 rounded">{String(countdown.h).padStart(2, '0')}</span>
        <span className="text-muted-foreground font-bold">:</span>
        <span className="bg-foreground/10 text-foreground text-sm font-black px-1.5 py-0.5 rounded">{String(countdown.m).padStart(2, '0')}</span>
        <span className="text-muted-foreground font-bold">:</span>
        <span className="bg-foreground/10 text-foreground text-sm font-black px-1.5 py-0.5 rounded">{String(countdown.s).padStart(2, '0')}</span>
      </div>
    </div>
  ) : null;



  const graphElement = isGraphLoading ? (
    <div className="h-[200px] md:h-[300px] flex flex-col items-center justify-center gap-4 bg-muted/5 rounded-xl border border-border/50">
      <img src="/animated-logo.svg" alt="Loading" className="w-24 h-24" />
      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] animate-pulse">Fetching Real-time Odds...</p>
    </div>
  ) : (
    <div className="flex flex-col h-full">
      <div className="h-[200px] md:h-[300px] bg-muted/10 rounded-xl p-4 border border-border/50 relative overflow-hidden">
        {market.priceHistory && market.priceHistory.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                {lineColors.map((color, idx) => (
                  <linearGradient key={idx} id={`colorTeam${idx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={color} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="currentColor" className="text-muted-foreground/10" />
              <XAxis 
                dataKey="timestamp" 
                hide 
              />
              <YAxis 
                domain={[0, 100]} 
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fontWeight: 700, fill: 'currentColor' }}
                className="text-muted-foreground/40"
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(val) => `${val}p`}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-card/95 backdrop-blur-sm border border-border p-3 rounded-xl shadow-xl text-xs min-w-[150px] space-y-2">
                        {market.marketType === 'multi' && market.teams ? (
                          market.teams.map((t, idx) => {
                            const val = payload.find(p => p.dataKey === `team_${idx}`)?.value as number;
                            if (val === undefined) return null;
                            return (
                              <div key={idx} className="flex justify-between items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColors[idx % lineColors.length] }} />
                                  <span className="font-bold text-muted-foreground uppercase">{t.name}</span>
                                </div>
                                <span className="font-black text-sm" style={{ color: lineColors[idx % lineColors.length] }}>{val.toFixed(1)}p</span>
                              </div>
                            );
                          })
                        ) : (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-muted-foreground uppercase">{teamALabel}</span>
                              <span className="font-black text-yes text-sm">{(payload[0].value as number).toFixed(1)}p</span>
                            </div>
                            <div className="flex justify-between items-center text-muted-foreground/50 italic text-[10px]">
                              <span>{teamBLabel}</span>
                              <span>{(100 - (payload[0].value as number)).toFixed(1)}p</span>
                            </div>
                          </>
                        )}
                        <div className="pt-2 border-t border-border/50 text-[10px] font-medium text-muted-foreground">
                          {new Date(payload[0].payload.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {market.marketType === 'multi' && market.teams ? (
                market.teams.map((t, idx) => (
                  <Area 
                    key={idx}
                    type="monotone" 
                    dataKey={`team_${idx}`} 
                    stroke={lineColors[idx % lineColors.length]} 
                    fillOpacity={1} 
                    fill={`url(#colorTeam${idx % lineColors.length})`} 
                    strokeWidth={idx === internalTeamIdx ? 4 : 2}
                    animationDuration={500}
                  />
                ))
              ) : (
                <Area 
                  type="stepAfter" 
                  dataKey="yesPrice" 
                  stroke="hsl(var(--yes-color))" 
                  fillOpacity={1} 
                  fill="url(#colorTeam0)" 
                  strokeWidth={3}
                  animationDuration={500}
                />
              )}
              <ReferenceLine y={50} stroke="currentColor" className="text-muted-foreground/10" strokeDasharray="3 3" />
            </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm font-medium italic">
          No price data available yet
        </div>
      )}
      </div>
      {/* Legend */}
      <div className="flex items-center justify-center flex-wrap gap-x-6 gap-y-2 pt-2 px-2">
        {market.marketType === 'multi' && market.teams ? (
          market.teams.map((t, idx) => (
            <div key={idx} className={cn("flex items-center gap-1.5 opacity-60 transition-opacity", internalTeamIdx === idx && "opacity-100")}>
              <span className="w-3 h-1 rounded-full" style={{ backgroundColor: lineColors[idx % lineColors.length] }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.name}</span>
            </div>
          ))
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-full bg-yes" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{teamALabel}</span>
            </div>
            <div className="flex items-center gap-1.5 opacity-30 italic">
              <span className="w-3 h-1 rounded-full bg-no" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{teamBLabel} (Inverse)</span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // Multi-market team selector view
  const multiTeamSelector = market.teams ? (
    <div className="flex flex-col gap-4">
      {countdownDisplay}
      <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Select a team to trade</h4>
      <div className="space-y-2">
        {market.teams.map((team, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              {team.imageUrl ? (
                <img src={team.imageUrl} alt={team.name} className="w-8 h-8 rounded-full object-cover border border-border shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border text-xs font-bold text-muted-foreground shrink-0">
                  {team.name.charAt(0)}
                </div>
              )}
              <span className="text-sm font-semibold text-foreground truncate">{team.name}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => { setInternalTeamIdx(idx); setOutcome('yes'); }}
                className="px-3 py-1.5 bg-yes/10 hover:bg-yes hover:text-white text-yes text-xs font-bold rounded-lg transition-all"
              >
                Yes {team.yesPrice.toFixed(0)}p
              </button>
              <button
                onClick={() => { setInternalTeamIdx(idx); setOutcome('no'); }}
                className="px-3 py-1.5 bg-no/10 hover:bg-no hover:text-white text-no text-xs font-bold rounded-lg transition-all"
              >
                No {team.noPrice.toFixed(0)}p
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const tradeControls = (
    <div className="flex flex-col gap-5">
      {/* Countdown */}
      {countdownDisplay}

      {/* Buy / Sell Toggle */}
      <div className={cn("flex p-1 bg-muted rounded-lg", isSubmitting && "opacity-50 pointer-events-none")}>
        <button onClick={() => setIsBuying(true)} className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", isBuying ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Buy</button>
        <button onClick={() => setIsBuying(false)} className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", !isBuying ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Sell</button>
      </div>

      {/* Outcome Toggle */}
      <div className={cn("flex gap-2", isSubmitting && "opacity-50 pointer-events-none")}>
        {market.marketType === 'multi' && (
          <button
            onClick={() => { setInternalTeamIdx(null); setIsConfirming(false); }}
            className="px-2 py-4 rounded-xl border-2 border-transparent bg-muted/50 hover:bg-muted transition-all text-xs font-bold text-muted-foreground"
          >
            ←
          </button>
        )}
        <button
          onClick={() => setOutcome('yes')}
          className={cn(
            "flex-1 flex flex-col items-center py-4 rounded-xl border-2 transition-all", 
            outcome === 'yes' ? "border-yes bg-yes/15 ring-2 ring-yes/20" : "border-transparent bg-muted/50 hover:bg-muted"
          )}
        >
          <span className={cn("text-sm font-black mb-1 uppercase tracking-wider", outcome === 'yes' ? "text-yes" : "text-muted-foreground")}>
            {market.marketType === 'versus' ? market.shortA : 'Yes'}
          </span>
          <span className="text-2xl font-black">{activeYesPrice.toFixed(0)}p</span>
        </button>
        <button
          onClick={() => setOutcome('no')}
          className={cn(
            "flex-1 flex flex-col items-center py-4 rounded-xl border-2 transition-all", 
            outcome === 'no' ? "border-no bg-no/15 ring-2 ring-no/20" : "border-transparent bg-muted/50 hover:bg-muted"
          )}
        >
          <span className={cn("text-sm font-black mb-1 uppercase tracking-wider", outcome === 'no' ? "text-no" : "text-muted-foreground")}>
            {market.marketType === 'versus' ? market.shortB : 'No'}
          </span>
          <span className="text-2xl font-black">{activeNoPrice.toFixed(0)}p</span>
        </button>
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground font-medium">Amount</span>
          <span className="font-semibold text-primary">
            {isBuying 
              ? `Balance: ₹${user?.balance.toLocaleString()}` 
              : `Holdings: ${(outcome === 'yes' ? userHolding?.yesShares : userHolding?.noShares)?.toFixed(2) || '0'} Shares`
            }
          </span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
            {isBuying ? '₹' : ''}
          </span>
          <Input
            type="number"
            placeholder="0"
            value={amount}
            disabled={isSubmitting}
            onChange={(e) => setAmount(e.target.value)}
            className={cn("pr-16 h-12 text-lg font-bold bg-muted/30 border-border", isBuying ? "pl-7" : "pl-3")}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {!isBuying && <span className="text-[10px] font-bold text-muted-foreground uppercase opacity-50">Shares</span>}
            <button
              onClick={handleMax}
              className="px-2 py-1 text-[10px] font-black uppercase bg-primary/10 hover:bg-primary/20 text-primary rounded transition-colors"
            >
              MAX
            </button>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          {[10, 50, 100, 500].map((amt) => (
            <button key={amt} onClick={() => setAmount(amt.toString())} className="flex-1 py-1.5 rounded-md bg-muted/50 hover:bg-muted text-xs font-semibold transition-colors">
              +{amt}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {numAmount > 0 && (
        <div className="pt-2 space-y-2 border-t border-border">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Est. {isBuying ? 'Cost' : 'Payout'}</span>
            <span className="font-bold">₹{Math.abs(cost).toFixed(2)}</span>
          </div>
          {isBuying && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Potential Return</span>
              <span className="font-bold text-green-500">₹{probableWinnings.toFixed(2)} ({(((probableWinnings - numAmount) / numAmount) * 100).toFixed(0)}%)</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const submitButton = (
    <div className="flex flex-col gap-2 w-full">
      {isConfirming ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsConfirming(false)}
            disabled={isSubmitting}
            className="flex-1 h-12 font-bold"
          >
            Cancel
          </Button>
          <Button
            onClick={(e) => { e.stopPropagation(); handleTrade(); }}
            disabled={isSubmitting}
            className={cn("flex-[2] h-12 text-base font-black uppercase tracking-widest relative overflow-hidden", isBuying ? "bg-yes text-white hover:bg-yes/90" : "bg-no text-white hover:bg-no/90")}
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              <span className="relative z-10">
                Confirm {market.marketType === 'multi' && activeTeamName ? `[${activeTeamName}] ` : ''} 
                {outcome === 'yes' ? teamALabel : teamBLabel} {isBuying ? 'Buy' : 'Sell'}
              </span>
            )}
          </Button>
        </div>
      ) : (
        <Button
          onClick={(e) => { e.stopPropagation(); setIsConfirming(true); }}
          disabled={
            numAmount <= 0 || 
            (isBuying && cost > (user?.balance || 0)) ||
            (!isBuying && numAmount > ((outcome === 'yes' ? userHolding?.yesShares : userHolding?.noShares) || 0) + 0.01)
          }
          className={cn("w-full h-12 text-base font-bold transition-all active:scale-95", isBuying ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-foreground text-background hover:bg-foreground/90")}
        >
          {user ? `Review ${market.marketType === 'multi' && activeTeamName ? `[${activeTeamName}] ` : ''}${outcome === 'yes' ? teamALabel : teamBLabel} ${isBuying ? 'Buy' : 'Sell'}` : 'Log In To Trade'}
        </Button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onClose}>
        <DrawerContent className={cn(
          "max-h-[90vh] transition-all duration-500",
          isConfirming ? "ring-4 ring-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)] shadow-green-500/20" : ""
        )}>
          <DrawerHeader className="text-left border-b border-border pb-4 relative">
            <DrawerTitle className="text-lg leading-tight font-bold pr-8">{titleText}</DrawerTitle>
            <DrawerClose asChild>
              <button 
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="absolute right-4 top-4 p-2 rounded-full hover:bg-muted transition-colors z-[110]"
              >
                <X className="w-5 h-5" />
              </button>
            </DrawerClose>
          </DrawerHeader>
          <div className="flex flex-col gap-5 p-4 overflow-y-auto max-h-[80vh] no-scrollbar">
            {graphElement}

            <div className="space-y-6">
              <div>
                <h4 className="text-[10px] font-black uppercase text-muted-foreground mb-2 tracking-[0.2em]">About this market</h4>
                <div className="text-sm text-muted-foreground leading-relaxed italic">
                  {market.description}
                </div>
              </div>
            </div>
            {isMarketClosed ? (
              <div className="space-y-6 pt-4">
                <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col items-center text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">
                    {isResolved ? "Market Result" : "Market Closed"}
                  </span>
                  {isResolved ? (
                    <>
                      <div className={cn(
                        "text-4xl font-black uppercase tracking-tighter mb-2",
                        market.resolvedOutcome === 'yes' ? "text-yes" : "text-no"
                      )}>
                        {market.resolvedOutcome === 'yes' ? (market.shortA || 'Yes') : (market.shortB || 'No')}
                      </div>
                      <span className="text-sm font-bold text-foreground">Won the market</span>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-black uppercase text-muted-foreground mb-1">Trading Ended</div>
                      <span className="text-sm font-medium text-muted-foreground/60">Waiting for admin resolution</span>
                    </>
                  )}
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Volume</span>
                  <span className="text-base font-black">₹{market.volume?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50 bg-green-500/5 px-2 -mx-2 rounded">
                  <span className="text-xs font-bold text-green-600 uppercase">Winner Payout</span>
                  <span className="text-base font-black text-green-600">₹1.00 <span className="text-xs font-medium">/ share</span></span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/50">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Value Per Share</span>
                  <span className="text-base font-black">{market.resolvedOutcome === 'yes' ? '100' : '0'}p</span>
                </div>

                {earnings > 0 && (
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 mt-4">
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest block mb-1">Your Earnings</span>
                    <div className="flex justify-between items-end">
                      <span className="text-xl font-black text-primary">₹{earnings.toFixed(2)}</span>
                      <span className="text-xs font-medium text-muted-foreground">{market.resolvedOutcome === 'yes' ? userHolding?.yesShares : userHolding?.noShares} Winning Shares</span>
                    </div>
                  </div>
                )}
              </div>
            ) : isMultiNoPick ? (
              multiTeamSelector
            ) : (
              tradeControls
            )}
            <div className="pt-6 border-t border-border/50">
              <CommentsSection marketId={market.id} isLive={!isResolved} />
            </div>
          </div>
          <div className="p-4 pt-2 border-t border-border mt-auto">
            {isMarketClosed ? (
              <DrawerClose asChild>
                <Button variant="outline" className="w-full h-12 font-bold" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                  Close Modal
                </Button>
              </DrawerClose>
            ) : isMultiNoPick ? null : (
              submitButton
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(
        "sm:max-w-[900px] p-0 gap-0 overflow-hidden bg-card border-border rounded-xl transition-all duration-500",
        isConfirming ? "ring-4 ring-green-500/50 shadow-[0_0_40px_rgba(34,197,94,0.4)] border-green-500/40" : ""
      )}>

        
        <div className="flex flex-row h-full max-h-[85vh] relative z-0">
          {/* Left Side: Title, Graph, Description */}
          <div className="flex-[1.5] flex flex-col p-8 border-r border-border min-w-[500px]">
            <DialogTitle className="text-2xl font-black mb-6 leading-tight text-foreground">
              {titleText}
            </DialogTitle>
            
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-8">
              <div className="min-h-[300px]">
                {graphElement}
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-[10px] font-black uppercase text-muted-foreground mb-3 tracking-[0.2em]">About this market</h4>
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    {market.description}
                  </div>
                </div>

                <div className="pt-8 border-t border-border/50">
                  <CommentsSection marketId={market.id} isLive={!isResolved} />
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Trade Interface / Resolved Output */}
          <div className={cn("w-[380px] flex flex-col p-8", isResolved ? "bg-muted/5 border-l border-border" : "bg-muted/10")}>
            <div className="flex-1">
              {isMarketClosed ? (
                <div className="space-y-8">
                  <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col items-center text-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">
                      {isResolved ? "Market Result" : "Market Closed"}
                    </span>
                    {isResolved ? (
                      <>
                        <div className={cn(
                          "text-4xl font-black uppercase tracking-tighter mb-2",
                          market.resolvedOutcome === 'yes' ? "text-yes" : "text-no"
                        )}>
                          {market.resolvedOutcome === 'yes' ? (market.shortA || 'Yes') : (market.shortB || 'No')}
                        </div>
                        <span className="text-sm font-bold text-foreground">Won the market</span>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-black uppercase text-muted-foreground mb-1">Trading Ended</div>
                        <span className="text-sm font-medium text-muted-foreground/60">Waiting for resolution</span>
                      </>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-3 border-b border-border/50">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Volume</span>
                      <span className="text-lg font-black">₹{market.volume?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-border/50">
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Settlement Price</span>
                      <span className="text-lg font-black">{market.resolvedOutcome === 'yes' ? '100' : '0'}p</span>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-border/50 bg-green-500/5 px-2 -mx-2 rounded">
                      <span className="text-xs font-bold text-green-600 uppercase tracking-wider">Winner Payout</span>
                      <span className="text-lg font-black text-green-600">₹1.00 <span className="text-xs font-medium">/ share</span></span>
                    </div>

                    {earnings > 0 && (
                      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 mt-4">
                        <span className="text-[10px] font-black uppercase text-primary tracking-widest block mb-1">Your Earnings</span>
                        <div className="flex justify-between items-end">
                          <span className="text-2xl font-black text-primary">₹{earnings.toFixed(2)}</span>
                          <span className="text-xs font-medium text-muted-foreground">{market.resolvedOutcome === 'yes' ? userHolding?.yesShares : userHolding?.noShares} Winning Shares</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4">
                    <p className="text-xs text-center text-muted-foreground font-medium leading-relaxed">
                      This market has been resolved by the community and is no longer open for trading.
                    </p>
                  </div>
                </div>
              ) : isMultiNoPick ? (
                multiTeamSelector
              ) : (
                tradeControls
              )}
            </div>
            {!isMarketClosed && !isMultiNoPick && (
              <div className="mt-8">
                {submitButton}
              </div>
            )}
            {isMarketClosed && (
              <div className="mt-auto">
                <DialogClose asChild>
                  <Button variant="outline" className="w-full h-12 font-bold" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                    Close Modal
                  </Button>
                </DialogClose>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}