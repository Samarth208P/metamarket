import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { X, Loader2, Trophy } from 'lucide-react';
import { CommentsSection } from './CommentsSection';
import { motion, AnimatePresence } from 'framer-motion';
import type { Market, MarketOption, QuoteResponse } from '@shared/api';

interface LmsrBetModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: Market;
  initialOptionId?: string;
  onTrade: (marketId: string, tradeResult: any) => void;
}

export function LmsrBetModal({ isOpen, onClose, market, initialOptionId, onTrade }: LmsrBetModalProps) {
  const { user, updateUser, refreshUser } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(initialOptionId || (market.marketType === 'multi' ? null : market.options[0]?.id || 'yes'));
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGraphLoading, setIsGraphLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  
  const slippageTolerance = 0.02;

  useEffect(() => {
    if (isOpen) {
      setSelectedOptionId(initialOptionId || (market.marketType === 'multi' ? null : market.options[0]?.id || 'yes'));
      setIsGraphLoading(true);
      const timer = setTimeout(() => setIsGraphLoading(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [initialOptionId, isOpen, market.options, market.marketType]);

  const selectedOption = useMemo<MarketOption | undefined>(
    () => market.options.find((option) => option.id === selectedOptionId) || (market.marketType !== 'multi' ? market.options[0] : undefined),
    [market.options, selectedOptionId, market.marketType]
  );

  const userHolding = useMemo(
    () => user?.positions?.find((entry) => entry.marketId === market.id && entry.optionId === selectedOptionId),
    [market.id, selectedOptionId, user?.positions]
  );

  const numericAmount = Number(amount) || 0;
  const isResolved = market.status !== "active";
  const isTimeClosed = market.endDate ? new Date(market.endDate) < new Date() : false;
  const isMarketClosed = isResolved || isTimeClosed;

  // ── Multi-market helpers ──────────────────────────────────────────
  const isMultiNoPick = market.marketType === 'multi' && !initialOptionId && !selectedOptionId;
  const activeTeamName = market.marketType === 'multi' ? selectedOption?.name : undefined;

  // ── Quote Fetching ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadQuote() {
      if (!isOpen || !user || !selectedOption || numericAmount <= 0 || isMarketClosed) {
        setQuote(null);
        setIsQuoteLoading(false);
        return;
      }

      setIsQuoteLoading(true);
      try {
        const response = await fetch(`/mapi/markets/${market.id}/quote`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            optionId: selectedOption.id,
            type: tradeType,
            amount: numericAmount,
            tolerance: slippageTolerance,
          }),
        });

        if (!response.ok) {
          if (!cancelled) setQuote(null);
          return;
        }

        const payload = await response.json();
        if (!cancelled) setQuote(payload);
      } finally {
        if (!cancelled) setIsQuoteLoading(false);
      }
    }

    const timer = setTimeout(loadQuote, 300); // Debounce
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, user, selectedOption, numericAmount, market.id, isMarketClosed, tradeType]);

  const handleTrade = async () => {
    if (!selectedOption || !quote) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/mapi/markets/${market.id}/trade`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionId: selectedOption.id,
          type: tradeType,
          amount: numericAmount,
          expectedShares: quote.expectedShares,
          slippageTolerance,
          quotedAt: quote.quotedAt,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (payload?.quote) setQuote(payload.quote);
        return toast({ title: 'Trade Failed', description: payload?.error || 'Unable to place trade', variant: 'destructive' });
      }

      updateUser(payload.user);
      await refreshUser();
      onTrade(market.id, payload.market);
      setAmount('');
      setQuote(null);
      setIsConfirming(false);
      toast({
        title: 'Trade Executed',
        description:
          tradeType === 'buy'
            ? `Bought ${payload.trade.shares.toFixed(2)} ${selectedOption.name} shares.`
            : `Sold ${numericAmount.toFixed(2)} ${selectedOption.name} shares for ₹${payload.trade.cashDelta.toFixed(2)}.`,
      });
    } catch {
      toast({ title: 'Network Error', description: 'Failed to connect to server', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMax = () => {
    if (!user) return;
    setAmount(String(tradeType === 'buy' ? user.balance : userHolding?.shares || 0));
  };


  // ── Countdown Timer ──────────────────────────────────────────────
  const [countdown, setCountdown] = useState<{ h: number; m: number; s: number } | null>(null);

  useEffect(() => {
    if (!market.endDate) return;
    const endTime = new Date(market.endDate).getTime();

    const tick = () => {
      const now = Date.now();
      const diff = endTime - now;
      if (diff <= 0) {
        setCountdown(null);
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      setCountdown({
        h: Math.floor(totalSecs / 3600),
        m: Math.floor((totalSecs % 3600) / 60),
        s: totalSecs % 60,
      });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [market.endDate]);

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

  // ── Graph Logic ──────────────────────────────────────────────────
  const lineColors = ['hsl(var(--yes-color))', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b'];

  const chartData = useMemo(() => {
    let history = [...(market.priceHistory || [])];
    
    // If we have no history, or only one point, add a 50/50 starting point based on market creation
    if (history.length <= 1) {
      const startTimestamp = market.createdAt || new Date(Date.now() - 86400000).toISOString();
      const startPoint: any = { 
        timestamp: startTimestamp,
        isStart: true 
      };
      market.options.forEach(opt => {
        startPoint[`opt_${opt.id}`] = 50;
      });
      
      // If we have one point, use it as the second point; otherwise just the start point
      if (history.length === 0) {
        history = [startPoint];
      } else {
        // If the first real point is the same as start, don't duplicate
        if (new Date(history[0].timestamp).getTime() - new Date(startTimestamp).getTime() > 1000) {
          history.unshift(startPoint);
        }
      }
    }

    return history.map(p => {
      const data: any = { ...p };
      if (p.prices) {
        p.prices.forEach((pricePoint) => {
          data[`opt_${pricePoint.optionId}`] = pricePoint.price;
        });
      }
      return data;
    });
  }, [market.priceHistory, market.options, market.createdAt]);

  const graphElement = isGraphLoading ? (
    <div className="h-[200px] md:h-[260px] flex flex-col items-center justify-center gap-4 bg-muted/5 rounded-xl border border-border/50">
      <img src="/animated-logo.svg" alt="loading" className="w-12 h-12" />
      <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Fetching Real-time Odds...</p>
    </div>
  ) : (
    <div className="flex flex-col h-full">
      <div className="h-[200px] md:h-[260px] bg-muted/10 rounded-xl p-4 border border-border/50 relative overflow-hidden">
        {chartData && chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                {lineColors.map((color, idx) => (
                  <linearGradient key={idx} id={`colorOpt${idx}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={color} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="currentColor" className="text-muted-foreground/10" />
              <XAxis dataKey="timestamp" hide />
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
                        {market.options.map((opt, idx) => {
                          const val = payload.find(p => p.dataKey === `opt_${opt.id}`)?.value as number;
                          if (val === undefined) return null;
                          return (
                            <div key={opt.id} className="flex justify-between items-center gap-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lineColors[idx % lineColors.length] }} />
                                <span className="font-bold text-muted-foreground uppercase">{opt.shortName || opt.name}</span>
                              </div>
                              <span className="font-black text-sm" style={{ color: lineColors[idx % lineColors.length] }}>{val.toFixed(1)}p</span>
                            </div>
                          );
                        })}
                        <div className="pt-2 border-t border-border/50 text-[10px] font-medium text-muted-foreground">
                          {new Date(payload[0].payload.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              {market.options.map((opt, idx) => (
                <Area 
                  key={opt.id}
                  type="monotone" 
                  dataKey={`opt_${opt.id}`} 
                  stroke={lineColors[idx % lineColors.length]} 
                  fillOpacity={1} 
                  fill={`url(#colorOpt${idx % lineColors.length})`} 
                  strokeWidth={opt.id === selectedOptionId ? 4 : 2}
                  animationDuration={500}
                />
              ))}
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
        {market.options.map((opt, idx) => (
          <div key={opt.id} className={cn("flex items-center gap-1.5 opacity-60 transition-opacity", selectedOptionId === opt.id && "opacity-100")}>
            <span className="w-3 h-1 rounded-full" style={{ backgroundColor: lineColors[idx % lineColors.length] }} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{opt.name}</span>
          </div>
        ))}
      </div>
    </div>
  );

  // Multi-market team selector view
  const multiTeamSelector = market.options ? (
    <div className="flex flex-col gap-4">
      {countdownDisplay}
      <h4 className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em]">Select an option to trade</h4>
      <div className="space-y-2">
        {market.options.map((opt, idx) => (
          <button
            key={opt.id}
            onClick={() => { setSelectedOptionId(opt.id); setTradeType('buy'); }}
            className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50 hover:border-primary/30 transition-all w-full text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              {opt.imageUrl ? (
                <img src={opt.imageUrl} alt={opt.name} className="w-8 h-8 rounded-full object-cover border border-border shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border text-xs font-bold text-muted-foreground shrink-0">
                  {opt.name.charAt(0)}
                </div>
              )}
              <span className="text-sm font-semibold text-foreground truncate">{opt.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-3 py-1.5 bg-primary/10 text-primary text-xs font-bold rounded-lg">
                {opt.price.toFixed(1)}p
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  const tradeControls = (
    <div className="flex flex-col gap-5">
      {countdownDisplay}

      <div className={cn("flex p-1 bg-muted rounded-lg", isSubmitting && "opacity-50 pointer-events-none")}>
        <button onClick={() => setTradeType('buy')} className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", tradeType === 'buy' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Buy</button>
        <button onClick={() => setTradeType('sell')} className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", tradeType === 'sell' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Sell</button>
      </div>

      <div className={cn("grid gap-2", market.options.length > 2 ? "grid-cols-2" : "flex gap-2")}>
        {market.options.map((opt, idx) => (
          <button
            key={opt.id}
            onClick={() => setSelectedOptionId(opt.id)}
            className={cn(
              "flex-1 flex flex-col items-center py-4 rounded-xl border-2 transition-all", 
              selectedOptionId === opt.id 
                ? (idx === 0 ? "border-yes bg-yes/15 ring-2 ring-yes/20" : "border-no bg-no/15 ring-2 ring-no/20")
                : "border-transparent bg-muted/50 hover:bg-muted"
            )}
          >
            <span className={cn(
              "text-[10px] font-black mb-1 uppercase tracking-wider", 
              selectedOptionId === opt.id ? (idx === 0 ? "text-yes" : "text-no") : "text-muted-foreground"
            )}>
              {opt.shortName || opt.name}
            </span>
            <span className="text-xl font-black">{opt.price.toFixed(1)}p</span>
          </button>
        ))}
      </div>

    <div className="space-y-3">
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground font-medium uppercase tracking-wider">{tradeType === 'buy' ? 'Amount in ₹' : 'Shares to Sell'}</span>
        <span className="font-bold text-primary bg-primary/5 px-2 py-1 rounded-md">
          {tradeType === 'buy' 
            ? `Balance: ₹${user?.balance.toLocaleString()}` 
            : `Owned: ${userHolding?.shares?.toFixed(2) || '0'} Shares`
          }
        </span>
      </div>
      <div className="relative group">
        <Input
          type="number"
          placeholder="0"
          value={amount}
          disabled={isSubmitting}
          onChange={(e) => setAmount(e.target.value)}
          className="h-12 text-lg font-bold bg-muted/20 border-border focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all pr-16 rounded-xl"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <button onClick={handleMax} className="px-2 py-1 text-[10px] font-black uppercase bg-primary text-primary-foreground hover:bg-primary/90 rounded transition-colors shadow-sm">MAX</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[10, 50, 100, 500].map((val) => (
          <Button
            key={val}
            variant="outline"
            size="sm"
            className="h-8 text-[10px] font-bold border-border bg-muted/10 hover:bg-primary/10 hover:text-primary hover:border-primary/30 rounded-lg transition-all"
            onClick={() => setAmount((prev) => String((Number(prev) || 0) + val))}
          >
            +₹{val}
          </Button>
        ))}
      </div>
    </div>

      <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs">
        {isQuoteLoading ? (
          <div className="flex items-center gap-3 text-muted-foreground font-medium">
            <img src="/animated-logo.svg" alt="loading" className="h-6 w-6" />
            Generating dynamic quote...
          </div>
        ) : quote ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Expected {tradeType === 'buy' ? 'Shares' : 'Payout'}</span><span className="font-bold">{tradeType === 'buy' ? quote.expectedShares.toFixed(2) : `₹${quote.netPayout.toFixed(2)}`}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Average Price</span><span className="font-bold">₹{quote.averagePrice.toFixed(4)}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Current Spot</span><span className="font-bold">{quote.currentPrice.toFixed(2)}p</span></div>
            {tradeType === 'sell' && <div className="flex items-center justify-between"><span className="text-muted-foreground">Fee (5%)</span><span className="font-bold">₹{quote.fee.toFixed(2)}</span></div>}
          </div>
        ) : (
          <div className="text-muted-foreground italic text-center">Enter an amount to see potential returns.</div>
        )}
      </div>
    </div>
  );

  const submitButton = (
    <div className="flex flex-col gap-2 w-full">
      {isConfirming ? (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsConfirming(false)} disabled={isSubmitting} className="flex-1 h-12 font-bold">Cancel</Button>
          <Button
            onClick={handleTrade}
            disabled={isSubmitting || !quote}
            className={cn("flex-[2] h-12 text-base font-black uppercase tracking-widest", tradeType === 'buy' ? "bg-yes text-white" : "bg-no text-white")}
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Order'}
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => setIsConfirming(true)}
          disabled={numericAmount <= 0 || !quote || (tradeType === 'buy' ? numericAmount > (user?.balance || 0) : numericAmount > (userHolding?.shares || 0) + 1e-6)}
          className={cn("w-full h-12 text-base font-bold", tradeType === 'buy' ? "bg-primary" : "bg-foreground")}
        >
          {tradeType === 'buy' ? 'Review Purchase' : 'Review Sale'}
        </Button>
      )}
    </div>
  );

  const modalTitle = `${market.title}${activeTeamName ? ` - ${activeTeamName}` : ''}`;

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onClose}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left border-b border-border pb-4 relative">
            <DrawerTitle className="text-lg leading-tight font-bold pr-8">{modalTitle}</DrawerTitle>
            <DrawerClose asChild>
              <button onClick={onClose} className="absolute right-4 top-4 p-2 rounded-full hover:bg-muted transition-colors"><X className="w-5 h-5" /></button>
            </DrawerClose>
          </DrawerHeader>
          <div className="p-4 flex flex-col gap-5 overflow-y-auto no-scrollbar">
            {graphElement}
            {isMarketClosed ? (
               <div className="p-8 text-center bg-muted/20 rounded-2xl border border-border">
                  <div className="text-[10px] font-black uppercase text-muted-foreground mb-4">Market Resolved</div>
                  <div className="text-3xl font-black text-primary">{market.resolvedOptionId ? market.options.find(o => o.id === market.resolvedOptionId)?.name : 'RESOLVED'}</div>
               </div>
            ) : isMultiNoPick ? multiTeamSelector : tradeControls}
            <div className="pt-6 border-t border-border/50"><CommentsSection marketId={market.id} isLive={!isResolved} /></div>
          </div>
          <div className="p-4 border-t border-border mt-auto">
            {!isMarketClosed && !isMultiNoPick && submitButton}
            {isMarketClosed && <Button variant="outline" className="w-full h-12 font-bold" onClick={onClose}>Close</Button>}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(
        "sm:max-w-[950px] p-0 gap-0 overflow-hidden bg-card border-border rounded-2xl transition-all duration-500",
        isConfirming ? "ring-4 ring-green-500/50 shadow-2xl" : ""
      )}>
        <div className="flex flex-row min-h-[500px] max-h-[85vh]">
          {/* Left panel */}
          <div className="flex-[1.5] flex flex-col p-8 border-r border-border overflow-y-auto no-scrollbar">
            <DialogTitle className="text-2xl font-black mb-6 leading-tight">{modalTitle}</DialogTitle>
            <div className="space-y-8">
               {graphElement}
               <div>
                 <h4 className="text-[10px] font-black uppercase text-muted-foreground mb-2 tracking-widest">Description</h4>
                 <p className="text-sm text-muted-foreground leading-relaxed">{market.description}</p>
               </div>
               <div className="pt-8 border-t border-border/50"><CommentsSection marketId={market.id} isLive={!isResolved} /></div>
            </div>
          </div>
          {/* Right panel */}
          <div className="w-[380px] flex flex-col p-8 bg-muted/10">
            <div className="flex-1 overflow-y-auto no-scrollbar">
               {isMarketClosed ? (
                 <div className="space-y-8 py-8 flex flex-col items-center text-center">
                    <Trophy className="w-12 h-12 text-yellow-500" />
                    <div>
                      <div className="text-[10px] font-black uppercase text-muted-foreground mb-2 tracking-widest">Winning Outcome</div>
                      <div className="text-3xl font-black text-foreground">{market.resolvedOptionId ? market.options.find(o => o.id === market.resolvedOptionId)?.name : 'Resolved'}</div>
                    </div>
                    <div className="w-full space-y-3">
                       <div className="flex justify-between text-xs font-bold uppercase py-2 border-b border-border/50"><span>Volume</span><span>₹{market.volume.toLocaleString()}</span></div>
                       <div className="flex justify-between text-xs font-bold uppercase py-2 border-b border-border/50 text-yes"><span>Payout</span><span>₹1.00 / Share</span></div>
                    </div>
                 </div>
               ) : isMultiNoPick ? multiTeamSelector : tradeControls}
            </div>
            <div className="mt-8">
              {!isMarketClosed && !isMultiNoPick ? submitButton : <Button variant="outline" className="w-full h-12 font-bold" onClick={onClose}>Close</Button>}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
