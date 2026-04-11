import { useState, useMemo } from "react";
import { BetModal } from "./BetModal";
import { MarketPool } from "@/lib/amm";
import { Bookmark, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { PriceHistoryPoint } from "@shared/api";
import { useToast } from "@/hooks/use-toast";

interface MarketCardProps {
  id: string;
  title: string;
  yesPrice: number;
  noPrice: number;
  category: string;
  description: string;
  volume: number;
  marketType?: "binary" | "versus" | "multi";
  optionA?: string;
  optionB?: string;
  shortA?: string;
  shortB?: string;
  logoUrl?: string;
  teams?: { name: string; imageUrl?: string; yesPool: number; noPool: number; yesPrice: number; noPrice: number }[];
  priceHistory?: PriceHistoryPoint[];
  pool?: MarketPool;
  onTrade?: (marketId: string, tradeResult: any) => void;
}

export function MarketCard({
  id,
  title,
  category,
  description,
  volume,
  yesPrice,
  noPrice,
  marketType = "binary",
  optionA,
  optionB,
  shortA,
  shortB,
  logoUrl,
  teams,
  pool,
  onTrade,
}: MarketCardProps) {
  const [showBetModal, setShowBetModal] = useState(false);
  const [selectedTeamIdx, setSelectedTeamIdx] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes');
  const { user, toggleBookmark } = useAuth();
  const { toast } = useToast();

  const isBookmarked = user?.bookmarks?.includes(id);
  const selectedTeam = selectedTeamIdx !== null && teams ? teams[selectedTeamIdx] : null;

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (marketType !== "multi") {
      setShowBetModal(true);
    }
  };

  const handleBookmarkToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await toggleBookmark(id);
    } catch (err) {
      toast({ title: "Error", description: "Failed to update bookmark", variant: "destructive" });
    }
  };

  const handleOpenTeamModal = (e: React.MouseEvent, idx: number, outcome: 'yes' | 'no') => {
    e.stopPropagation();
    setSelectedTeamIdx(idx);
    setSelectedOutcome(outcome);
    setShowBetModal(true);
  };

  return (
    <div
      onClick={handleCardClick}
      className="group flex flex-col bg-card border border-border rounded-xl p-4 transition-all cursor-pointer hover:border-primary/30 hover:shadow-sm"
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
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {category} {marketType === 'multi' && '• Multi'}
          </span>
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
        {marketType === "multi" && teams && teams.length > 0 ? (
          <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
            {teams.map((team, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <span className="text-sm font-medium text-foreground truncate mr-2">{team.name}</span>
                <button
                  onClick={(e) => handleOpenTeamModal(e, idx, 'yes')}
                  className="shrink-0 px-3 py-1 bg-yes/10 hover:bg-yes/20 text-yes text-sm font-bold rounded-md transition-colors"
                >
                  {team.yesPrice.toFixed(0)}%
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedOutcome('yes'); setShowBetModal(true); }}
              className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-yes/10 border border-transparent hover:border-yes/30 transition-all group/btn"
            >
              <span className="text-sm font-semibold text-muted-foreground group-hover/btn:text-yes">
                {marketType === 'versus' ? (shortA || optionA) : 'Yes'}
              </span>
              <span className="text-sm font-bold text-foreground group-hover/btn:text-yes">{yesPrice.toFixed(0)}¢</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedOutcome('no'); setShowBetModal(true); }}
              className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-no/10 border border-transparent hover:border-no/30 transition-all group/btn"
            >
              <span className="text-sm font-semibold text-muted-foreground group-hover/btn:text-no">
                {marketType === 'versus' ? (shortB || optionB) : 'No'}
              </span>
              <span className="text-sm font-bold text-foreground group-hover/btn:text-no">{noPrice.toFixed(0)}¢</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border text-xs font-medium text-muted-foreground">
          <span>₹{volume.toLocaleString()} Vol.</span>
        </div>
      </div>

      {(pool || (selectedTeamIdx !== null && selectedTeam)) && (
        <BetModal
          isOpen={showBetModal}
          onClose={() => { setShowBetModal(false); setSelectedTeamIdx(null); }}
          initialOutcome={selectedOutcome}
          market={{
            id, title, description,
            yesPrice: selectedTeam ? selectedTeam.yesPrice : yesPrice,
            noPrice: selectedTeam ? selectedTeam.noPrice : noPrice,
            marketType, optionA, optionB, shortA, shortB,
            teamIndex: selectedTeamIdx ?? undefined,
            teamName: selectedTeam?.name,
            pool: selectedTeam ? { yesPool: selectedTeam.yesPool, noPool: selectedTeam.noPool, totalLiquidity: selectedTeam.yesPool + selectedTeam.noPool } : (pool as MarketPool),
          }}
          onTrade={onTrade || (() => { })}
        />
      )}
    </div>
  );
}