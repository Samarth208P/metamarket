import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useAuth } from '@/hooks/use-auth';
import { calculateBuyCost, calculateSellPayout, MarketPool } from '@/lib/amm';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface BetModalProps {
  isOpen: boolean;
  onClose: () => void;
  market: {
    id: string; title: string; description: string; yesPrice: number; noPrice: number;
    marketType?: "binary" | "versus" | "multi";
    optionA?: string; optionB?: string; shortA?: string; shortB?: string;
    teamIndex?: number; teamName?: string; pool: MarketPool;
  };
  initialOutcome?: 'yes' | 'no';
  onTrade: (marketId: string, tradeResult: any) => void;
}

export function BetModal({ isOpen, onClose, market, initialOutcome = 'yes', onTrade }: BetModalProps) {
  const [outcome, setOutcome] = useState<'yes' | 'no'>(initialOutcome);
  const [amount, setAmount] = useState('');
  const [isBuying, setIsBuying] = useState(true);
  const { user, updateBalance } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

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

    const response = await fetch(`/api/markets/${market.id}/trade`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, type: isBuying ? 'buy' : 'sell', amount: numAmount, teamIndex: market.teamIndex }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return toast({ title: 'Trade Failed', description: payload?.error || 'Unable to place trade', variant: 'destructive' });
    }

    const payload = await response.json();
    updateBalance(payload.user.balance);
    onTrade(market.id, payload.market);

    toast({ title: isBuying ? 'Order Filled' : 'Position Sold', description: `${isBuying ? 'Bought' : 'Sold'} ₹${numAmount.toFixed(2)} of ${outcome.toUpperCase()}` });
    setAmount('');
    onClose();
  };

  const titleText = market.teamName ? `${market.title} - ${market.teamName}` : market.title;

  const content = (
    <div className="flex flex-col gap-5 p-4 md:p-5 overflow-y-auto max-h-[70vh]">
      {/* Buy / Sell Toggle */}
      <div className="flex p-1 bg-muted rounded-lg">
        <button onClick={() => setIsBuying(true)} className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", isBuying ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Buy</button>
        <button onClick={() => setIsBuying(false)} className={cn("flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors", !isBuying ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}>Sell</button>
      </div>

      {/* Outcome Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setOutcome('yes')}
          className={cn("flex-1 flex flex-col items-center py-3 rounded-lg border-2 transition-all", outcome === 'yes' ? "border-yes bg-yes/5" : "border-transparent bg-muted/50 hover:bg-muted")}
        >
          <span className={cn("text-xs font-semibold mb-1", outcome === 'yes' ? "text-yes" : "text-muted-foreground")}>{market.marketType === 'versus' ? market.shortA : 'Yes'}</span>
          <span className="text-xl font-bold">{market.yesPrice.toFixed(0)}¢</span>
        </button>
        <button
          onClick={() => setOutcome('no')}
          className={cn("flex-1 flex flex-col items-center py-3 rounded-lg border-2 transition-all", outcome === 'no' ? "border-no bg-no/5" : "border-transparent bg-muted/50 hover:bg-muted")}
        >
          <span className={cn("text-xs font-semibold mb-1", outcome === 'no' ? "text-no" : "text-muted-foreground")}>{market.marketType === 'versus' ? market.shortB : 'No'}</span>
          <span className="text-xl font-bold">{market.noPrice.toFixed(0)}¢</span>
        </button>
      </div>

      {/* Amount Input */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground font-medium">Amount</span>
          <span className="font-semibold">Balance: ₹{user?.balance.toLocaleString()}</span>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₹</span>
          <Input
            type="number"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="pl-7 h-12 text-lg font-bold bg-muted/30 border-border"
          />
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
    <Button
      onClick={handleTrade}
      disabled={numAmount <= 0 || (isBuying && cost > (user?.balance || 0))}
      className={cn("w-full h-12 text-base font-bold", isBuying ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-foreground text-background hover:bg-foreground/90")}
    >
      {isBuying ? 'Log In To Trade' /* Change to 'Buy' if strict Polymarket */ : 'Sell'}
      {user ? (isBuying ? 'Buy' : 'Sell') : 'Log In To Trade'}
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onClose}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left border-b border-border pb-4">
            <DrawerTitle className="text-lg leading-tight font-bold">{titleText}</DrawerTitle>
          </DrawerHeader>
          {content}
          <div className="p-4 pt-2 border-t border-border mt-auto">
            {submitButton}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] p-0 gap-0 overflow-hidden bg-card border-border rounded-xl">
        <DialogHeader className="p-5 pb-4 border-b border-border text-left">
          <DialogTitle className="text-lg leading-tight font-bold">{titleText}</DialogTitle>
        </DialogHeader>
        {content}
        <div className="p-5 pt-3 bg-muted/10 border-t border-border">
          {submitButton}
        </div>
      </DialogContent>
    </Dialog>
  );
}