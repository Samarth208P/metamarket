import { useEffect, useMemo, useState } from 'react';
import type { Market, MarketOption, QuoteResponse } from '@shared/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { CommentsSection } from './CommentsSection';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [selectedOptionId, setSelectedOptionId] = useState(initialOptionId || market.options[0]?.id || 'yes');
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const slippageTolerance = 0.02;

  useEffect(() => {
    if (isOpen) {
      setSelectedOptionId(initialOptionId || market.options[0]?.id || 'yes');
    }
  }, [initialOptionId, isOpen, market.options]);

  const selectedOption = useMemo<MarketOption | undefined>(
    () => market.options.find((option) => option.id === selectedOptionId) || market.options[0],
    [market.options, selectedOptionId]
  );

  const position = useMemo(
    () => user?.positions?.find((entry) => entry.marketId === market.id && entry.optionId === selectedOptionId),
    [market.id, selectedOptionId, user?.positions]
  );

  const numericAmount = Number(amount) || 0;
  const isResolved = market.status !== 'active';
  const isClosedByTime = market.endDate ? new Date(market.endDate) < new Date() : false;
  const marketClosed = isResolved || isClosedByTime;
  const resolvedWinnerId = market.resolvedOptionId || market.resolvedOutcome;
  const winningOption = market.options.find((option) => option.id === resolvedWinnerId);

  useEffect(() => {
    let cancelled = false;

    async function loadQuote() {
      if (!isOpen || !user || !selectedOption || numericAmount <= 0 || marketClosed) {
        setQuote(null);
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

    loadQuote();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user, selectedOption, numericAmount, market.id, marketClosed, tradeType]);

  const handleMax = () => {
    if (!user) return;
    setAmount(String(tradeType === 'buy' ? user.balance : position?.shares || 0));
  };

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

  const body = (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div>
        <h3 className="text-xl font-black text-foreground">{market.title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{market.description}</p>
      </div>

      <div className="grid gap-2">
        {market.options.map((option) => {
          const isSelected = option.id === selectedOptionId;
          const isWinner = resolvedWinnerId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedOptionId(option.id)}
              className={cn(
                'flex items-center justify-between rounded-xl border p-3 text-left transition-colors',
                isSelected ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/40',
                isWinner && 'border-green-500/50 bg-green-500/5'
              )}
            >
              <span className="font-semibold text-foreground">{option.name}</span>
              <span className="text-sm font-black text-primary">{option.price.toFixed(1)}p</span>
            </button>
          );
        })}
      </div>

      {marketClosed ? (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Result</div>
          <div className="mt-2 text-lg font-black text-foreground">{winningOption?.name || 'Awaiting resolution'}</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Winning shares: {(user?.positions?.find((entry) => entry.marketId === market.id && entry.optionId === resolvedWinnerId)?.shares || 0).toFixed(2)}
          </div>
        </div>
      ) : (
        <>
          <div className="flex rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setTradeType('buy')}
              className={cn('flex-1 rounded-md py-2 text-sm font-semibold', tradeType === 'buy' ? 'bg-background text-foreground' : 'text-muted-foreground')}
            >
              Buy
            </button>
            <button
              type="button"
              onClick={() => setTradeType('sell')}
              className={cn('flex-1 rounded-md py-2 text-sm font-semibold', tradeType === 'sell' ? 'bg-background text-foreground' : 'text-muted-foreground')}
            >
              Sell
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{tradeType === 'buy' ? 'Amount in rupees' : 'Shares to sell'}</span>
              <span>{tradeType === 'buy' ? `Balance: ₹${user?.balance?.toFixed(2) || '0.00'}` : `Owned: ${(position?.shares || 0).toFixed(2)}`}</span>
            </div>
            <div className="relative">
              <Input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="pr-16" />
              <button type="button" onClick={handleMax} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-primary">
                MAX
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
            {isQuoteLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Refreshing quote...
              </div>
            ) : quote ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Expected shares</span><span className="font-bold">{quote.expectedShares.toFixed(2)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Average price</span><span className="font-bold">₹{quote.averagePrice.toFixed(4)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Current spot</span><span className="font-bold">{quote.currentPrice.toFixed(2)}p</span></div>
                {tradeType === 'sell' && <div className="flex items-center justify-between"><span className="text-muted-foreground">Net payout</span><span className="font-bold">₹{quote.netPayout.toFixed(2)}</span></div>}
                {tradeType === 'sell' && <div className="flex items-center justify-between"><span className="text-muted-foreground">Fee</span><span className="font-bold">₹{quote.fee.toFixed(2)}</span></div>}
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Active liquidity b</span><span className="font-bold">{quote.currentB.toFixed(2)}</span></div>
              </div>
            ) : (
              <div className="text-muted-foreground">Enter an amount to fetch a live quote.</div>
            )}
          </div>

          <Button
            onClick={handleTrade}
            disabled={!user || !quote || numericAmount <= 0 || isSubmitting || (tradeType === 'buy' ? numericAmount > (user?.balance || 0) : numericAmount > (position?.shares || 0))}
            className="h-12 font-bold"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `${tradeType === 'buy' ? 'Buy' : 'Sell'} ${selectedOption?.name || ''}`}
          </Button>
        </>
      )}

      <CommentsSection marketId={market.id} isLive={!isResolved} />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onClose}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Trade Market</DrawerTitle>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
        <DialogTitle className="sr-only">Trade Market</DialogTitle>
        {body}
      </DialogContent>
    </Dialog>
  );
}
