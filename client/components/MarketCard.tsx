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
  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>(
    undefined,
  );
  const { bookmarks, toggleBookmark } = useAuth();
  const { toast } = useToast();

  const isBookmarked = bookmarks?.includes(id);

  const isClosed =
    (endDate && new Date(endDate) < new Date()) || status !== "active";

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowBetModal(true);
  };

  const handleBookmarkToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleBookmark(id);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update bookmark",
        variant: "destructive",
      });
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
      <article
        onClick={handleCardClick}
        className="flex min-h-[12.5rem] flex-1 cursor-pointer flex-col p-4 sm:p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                loading="lazy"
                className="size-9 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted text-sm font-bold text-muted-foreground"
              >
                {category.charAt(0)}
              </div>
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {category}
            </span>
          </div>
          <button
            type="button"
            aria-label={`Bookmark ${title}`}
            aria-pressed={Boolean(isBookmarked)}
            onClick={handleBookmarkToggle}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Bookmark
              aria-hidden="true"
              className={cn(
                "w-4 h-4",
                isBookmarked && "fill-current text-primary",
              )}
            />
          </button>
        </div>

        <h3 className="mb-4 text-base font-semibold leading-snug text-foreground">
          <button
            type="button"
            onClick={handleCardClick}
            className="rounded-sm text-left hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {title}
          </button>
        </h3>

        <div className="mt-auto space-y-3">
          {marketType === "multi" && primaryOptions.length > 0 ? (
            <div className="max-h-[132px] space-y-1.5 overflow-y-auto overscroll-contain">
              {primaryOptions.map((option) => (
                <div
                  key={option.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground truncate mr-2">
                    {option.name}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      aria-label={`${option.name}: ${option.price.toFixed(0)}p`}
                      onClick={(e) => handleOpenOptionModal(e, option.id)}
                      className="rounded-md bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring dark:text-emerald-300"
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
                  type="button"
                  onClick={(e) => handleOpenOptionModal(e, option.id)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    idx === 0
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-700 hover:bg-emerald-400/20 dark:text-emerald-300"
                      : "border-rose-400/20 bg-rose-400/10 text-rose-700 hover:bg-rose-400/20 dark:text-rose-300",
                  )}
                >
                  <span className="text-sm font-semibold">
                    {option.shortName || option.name}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {option.price.toFixed(0)}p
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-border text-xs font-medium text-muted-foreground">
            <span>₹{volume.toLocaleString()} Vol.</span>
            {endDate && (
              <span
                className={cn(
                  isClosed && "font-bold text-rose-700 dark:text-rose-300",
                )}
              >
                {isClosed
                  ? "Closed"
                  : `Ends ${new Date(endDate).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}`}
              </span>
            )}
          </div>
        </div>
      </article>

      <LmsrBetModal
        isOpen={showBetModal}
        onClose={() => {
          setShowBetModal(false);
          setSelectedOptionId(undefined);
        }}
        initialOptionId={selectedOptionId}
        market={
          {
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
          } as Market
        }
        onTrade={onTrade || (() => {})}
      />
    </>
  );
}
