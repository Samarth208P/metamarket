import { useState } from "react";
import { LmsrBetModal } from "./LmsrBetModal";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import type { Market, PriceHistoryPoint } from "@shared/api";
import { useToast } from "@/hooks/use-toast";

type MarketCardProps = Market & {
  priceHistory?: PriceHistoryPoint[];
  onTrade?: (marketId: string, tradeResult: any) => void;
};

export function MarketCard({
  id,
  title,
  category,
  description,
  volume,
  marketType = "binary",
  logoUrl,
  options,
  onTrade,
  status,
  endDate,
  priceHistory = [],
}: MarketCardProps) {
  const [showBetModal, setShowBetModal] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>(undefined);
  const { bookmarks, toggleBookmark } = useAuth();
  const { toast } = useToast();

  const isBookmarked = bookmarks?.includes(id);
  
  const isClosed = (endDate && new Date(endDate) < new Date()) || status !== "active";

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowBetModal(true);
  };

  const handleBookmarkToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleBookmark(id);
    } catch (err) {
      toast({ title: "Error", description: "Failed to update bookmark", variant: "destructive" });
    }
  };

  const handleOpenOptionModal = (e: React.MouseEvent, optionId: string) => {
    e.stopPropagation();
    setSelectedOptionId(optionId);
    setShowBetModal(true);
  };

  const primaryOptions = marketType === "multi" ? options : options.slice(0, 2);

  return (
    <>
      <div
        onClick={handleCardClick}
        className="group flex flex-col bg-card border border-border rounded-xl p-4 transition-all cursor-pointer hover:border-primary/30 hover:shadow-sm h-full"
      >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="w-10 h-10 rounded-full object-cover border border-border" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border border-border text-xs font-bold text-muted-foreground">
              {category.charAt(0)}
            </div>
          )}
        </div>
        <button
          onClick={handleBookmarkToggle}
          className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground"
        >
          <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-current text-primary")} />
        </button>
      </div>

      <h3 className="font-semibold text-foreground leading-snug text-base mb-4 line-clamp-3">
        {title}
      </h3>

      <div className="mt-auto space-y-3">
        {marketType === "multi" && primaryOptions.length > 0 ? (
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
            {primaryOptions.map((option) => (
              <div key={option.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <span className="text-sm font-medium text-foreground truncate mr-2">{option.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => handleOpenOptionModal(e, option.id)}
                    className="px-2.5 py-1 bg-yes/10 hover:bg-yes/20 text-yes text-xs font-bold rounded-md transition-colors"
                  >
                    {option.price.toFixed(0)}p
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {primaryOptions.map((option, idx) => (
              <button
                key={option.id}
                onClick={(e) => { e.stopPropagation(); setSelectedOptionId(option.id); setShowBetModal(true); }}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-lg transition-all group/btn",
                  idx === 0 
                    ? "bg-yes/20 hover:bg-yes text-yes hover:text-white border border-yes/40" 
                    : "bg-no/20 hover:bg-no text-no hover:text-white border border-no/40"
                )}
              >
                <span className="text-sm font-black uppercase tracking-wider">
                  {option.shortName || option.name}
                </span>
                <span className={cn(
                  "text-sm font-black group-hover/btn:text-white",
                  idx === 0 ? "text-yes" : "text-no"
                )}>
                  {option.price.toFixed(0)}p
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border text-xs font-medium text-muted-foreground">
          <span>₹{volume.toLocaleString()} Vol.</span>
          {endDate && (
            <span className={cn(isClosed && "text-no font-bold")}>
              {isClosed ? "Closed" : `Ends ${new Date(endDate).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`}
            </span>
          )}
        </div>
        </div>
      </div>

      <LmsrBetModal
        isOpen={showBetModal}
        onClose={() => { setShowBetModal(false); setSelectedOptionId(undefined); }}
        initialOptionId={selectedOptionId}
        market={{
          id,
          title,
          description,
          category,
          volume,
          marketType,
          logoUrl,
          options,
          status,
          endDate,
          yesPrice: options[0]?.price || 0,
          noPrice: options[1]?.price || 0,
          createdAt: "",
          updatedAt: "",
          priceHistory,
          ammType: "lmsr",
        } as Market}
        onTrade={onTrade || (() => { })}
      />
    </>
  );
}
