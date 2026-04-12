import { useState, useMemo, useRef, useEffect } from 'react';
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
import { X } from 'lucide-react';
import { CommentsSection } from './CommentsSection';
import confetti from 'canvas-confetti';

interface BetModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: {
    id: string; title: string; description: string; yesPrice: number; noPrice: number;
    marketType?: "binary" | "versus" | "multi";
    optionA?: string; optionB?: string; shortA?: string; shortB?: string;
    teamIndex?: number; teamName?: string; pool: MarketPool;
    priceHistory?: { yesPrice: number; noPrice: number; timestamp: string }[];
    status?: string;
    volume?: number;
    resolvedOutcome?: string;
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
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [showConfettiOverlay, setShowConfettiOverlay] = useState(false);

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
    ? calculateBuyCost(market.pool, outcome, numAmount)
    : -calculateSellPayout(market.pool, outcome, numAmount)
    , [isBuying, market.pool, outcome, numAmount]);

  const handleTrade = async () => {
    if (!user) return;
    if (numAmount <= 0) return toast({ title: "Invalid Amount", variant: "destructive" });
    if (isBuying && cost > user.balance) return toast({ title: "Insufficient Balance", variant: "destructive" });
    if (!isBuying) {
      const shares = outcome === 'yes' ? userHolding?.yesShares : userHolding?.noShares;
      if (numAmount > (shares || 0) + 0.01) return toast({ title: "Insufficient Shares", description: `You only have ${(shares || 0).toFixed(2)} shares`, variant: "destructive" });
    }

    const response = await fetch(`/mapi/markets/${market.id}/trade`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, type: isBuying ? 'buy' : 'sell', amount: numAmount, teamIndex: market.teamIndex }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return toast({ title: 'Trade Failed', description: payload?.error || 'Unable to place trade', variant: 'destructive' });
    }

    const payload = await response.json();
    updateUser(payload.user);
    await refreshUser(); 
    onTrade(market.id, payload.market);

    // Dynamic, intense animation logic: Enhanced Fireworks style
    if (confettiCanvasRef.current) {
      setShowConfettiOverlay(true);
      const myConfetti = confetti.create(confettiCanvasRef.current, { resize: true });
      
      const duration = 4 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { 
        startVelocity: 60, 
        spread: 360, 
        ticks: 150, 
        zIndex: 50,
        gravity: 0.8,
        drift: 0,
        colors: isBuying ? ['#22c55e', '#ffffff', '#10b981', '#fbbf24'] : ['#ef4444', '#ffffff', '#f43f5e', '#fbbf24']
      };

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          setShowConfettiOverlay(false);
          return clearInterval(interval);
        }
        
        const particleCount = 200 * (timeLeft / duration);
        // Fireworks bursts from random positions
        myConfetti({ ...defaults, particleCount: particleCount / 2, origin: { x: Math.random(), y: Math.random() - 0.2 } });
        myConfetti({ ...defaults, particleCount: particleCount / 4, origin: { x: 0.5, y: 0.7 }, scalar: 1.2 });
      }, 250);
    }

    const shareLabel = outcome === 'yes' ? teamALabel : teamBLabel;
    toast({ 
      title: "Trade Executed", 
      description: isBuying 
        ? `Successfully bought ₹${numAmount.toFixed(2)} worth of ${shareLabel} shares!`
        : `Successfully sold ${numAmount.toFixed(2)} ${shareLabel} shares for ₹${Math.abs(cost).toFixed(2)}!`,
    });
    
    setAmount('');
    setIsConfirming(false);
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

  const titleText = market.teamName ? `${market.title} - ${market.teamName}` : market.title;
  const isResolved = market.status && market.status !== "active";

  const earnings = useMemo(() => {
    if (!market.resolvedOutcome || !user) return 0;
    
    // Check if user still has holding (unlikely if already paid out)
    if (userHolding) {
      const winningShares = market.resolvedOutcome === 'yes' ? userHolding.yesShares : userHolding.noShares;
      return winningShares;
    }

    // Check trade history for payout
    const payoutTrade = user.tradeHistory?.find(t => 
      t.marketId === market.id && 
      t.tradeType === 'payout' &&
      (market.teamIndex === undefined || t.marketTitle?.includes(`[${market.teamName}]`))
    );
    
    return payoutTrade ? Math.abs(payoutTrade.amount) : 0;
  }, [user, userHolding, market.id, market.resolvedOutcome, market.teamIndex, market.teamName]);



  const graphElement = (
    <div className="flex flex-col h-full">
      <div className="h-[200px] md:h-[300px] bg-muted/10 rounded-xl p-4 border border-border/50 relative overflow-hidden">
        {market.priceHistory && market.priceHistory.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={market.priceHistory}>
              <defs>
                <linearGradient id="colorYes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--yes-color))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--yes-color))" stopOpacity={0}/>
                </linearGradient>
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
                    const val = payload[0].value as number;
                    return (
                      <div className="bg-card/95 backdrop-blur-sm border border-border p-3 rounded-xl shadow-xl text-xs min-w-[120px]">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-muted-foreground uppercase">{teamALabel}</span>
                          <span className="font-black text-yes text-sm">{val.toFixed(1)}p</span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-bold text-muted-foreground uppercase">{teamBLabel}</span>
                          <span className="font-black text-no text-sm">{(100 - val).toFixed(1)}p</span>
                        </div>
                        <div className="pt-2 border-t border-border/50 text-[10px] font-medium text-muted-foreground">
                          {new Date(payload[0].payload.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="stepAfter" 
                dataKey="yesPrice" 
                stroke="hsl(var(--yes-color))" 
                fillOpacity={1} 
                fill="url(#colorYes)" 
                strokeWidth={3}
                animationDuration={500}
              />
              <ReferenceLine y={50} stroke="currentColor" className="text-muted-foreground/10" strokeDasharray="3 3" />
            </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm font-medium italic">
          No price data available yet
        </div>
      )}
      </div>
    </div>
  );

  const tradeControls = (
    <div className="flex flex-col gap-5">
      {/* Buy / Sell Toggle */}
      <div className="flex p-1 bg-muted rounded-lg">
        <button onClick={() => setIsBuying(true)} className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", isBuying ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Buy</button>
        <button onClick={() => setIsBuying(false)} className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", !isBuying ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Sell</button>
      </div>

      {/* Outcome Toggle */}
      <div className="flex gap-2">
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
          <span className="text-2xl font-black">{market.yesPrice.toFixed(0)}p</span>
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
          <span className="text-2xl font-black">{market.noPrice.toFixed(0)}p</span>
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
            className="flex-1 h-12 font-bold"
          >
            Cancel
          </Button>
          <Button
            onClick={(e) => { e.stopPropagation(); handleTrade(); }}
            className={cn("flex-[2] h-12 text-base font-black uppercase tracking-widest", isBuying ? "bg-yes text-white hover:bg-yes/90" : "bg-no text-white hover:bg-no/90")}
          >
            Confirm {isBuying ? 'Buy' : 'Sell'}
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
          {user ? (isBuying ? `Review ${teamALabel} Buy` : `Review ${teamBLabel} Sell`) : 'Log In To Trade'}
        </Button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onClose}>
        <DrawerContent className="max-h-[90vh]">
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
            {isResolved ? (
              <div className="space-y-6 pt-4">
                <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col items-center text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Market Result</span>
                  <div className={cn(
                    "text-4xl font-black uppercase tracking-tighter mb-2",
                    market.resolvedOutcome === 'yes' ? "text-yes" : "text-no"
                  )}>
                    {market.resolvedOutcome === 'yes' ? (market.shortA || 'Yes') : (market.shortB || 'No')}
                  </div>
                  <span className="text-sm font-bold text-foreground">Won the market</span>
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
            ) : (
              tradeControls
            )}
            <div className="pt-6 border-t border-border/50">
              <CommentsSection marketId={market.id} isLive={!isResolved} />
            </div>
          </div>
          <div className="p-4 pt-2 border-t border-border mt-auto">
            {isResolved ? (
              <DrawerClose asChild>
                <Button variant="outline" className="w-full h-12 font-bold" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                  Close Market
                </Button>
              </DrawerClose>
            ) : (
              submitButton
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px] p-0 gap-0 overflow-hidden bg-card border-border rounded-xl">
        {/* Confetti Background Layer */}
        <canvas 
          ref={confettiCanvasRef} 
          className={cn(
            "fixed inset-0 pointer-events-none z-[-1] transition-opacity duration-500",
            showConfettiOverlay ? "opacity-100" : "opacity-0"
          )}
        />
        {showConfettiOverlay && (
          <div className="fixed inset-0 bg-background/20 backdrop-blur-md pointer-events-none z-[-1] animate-in fade-in duration-500" />
        )}
        
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
              {isResolved ? (
                <div className="space-y-8">
                  <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col items-center text-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">Market Result</span>
                    <div className={cn(
                      "text-4xl font-black uppercase tracking-tighter mb-2",
                      market.resolvedOutcome === 'yes' ? "text-yes" : "text-no"
                    )}>
                      {market.resolvedOutcome === 'yes' ? (market.shortA || 'Yes') : (market.shortB || 'No')}
                    </div>
                    <span className="text-sm font-bold text-foreground">Won the market</span>
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
              ) : (
                tradeControls
              )}
            </div>
            {!isResolved && (
              <div className="mt-8">
                {submitButton}
              </div>
            )}
            {isResolved && (
              <div className="mt-auto">
                <DialogClose asChild>
                  <Button variant="outline" className="w-full h-12 font-bold" onClick={(e) => { e.stopPropagation(); onClose(); }}>
                    Close Market
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