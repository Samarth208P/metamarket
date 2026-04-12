import { useState, useMemo } from "react";
import { BetModal } from "./BetModal";
import { MarketPool } from "@/lib/amm";
import { Bookmark } from "lucide-react";
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
  status?: string;
  resolvedOutcome?: "yes" | "no";
  endDate?: string;
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
  priceHistory,
  status,
  resolvedOutcome,
  endDate,
}: MarketCardProps) {
  const [showBetModal, setShowBetModal] = useState(false);
  const [selectedTeamIdx, setSelectedTeamIdx] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<'yes' | 'no'>('yes');
  const { user, bookmarks, toggleBookmark } = useAuth();
  const { toast } = useToast();

  const isBookmarked = bookmarks?.includes(id);
  const selectedTeam = selectedTeamIdx !== null && teams ? teams[selectedTeamIdx] : null;
  
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

  const handleOpenTeamModal = (e: React.MouseEvent, idx: number, outcome: 'yes' | 'no') => {
    e.stopPropagation();
    setSelectedTeamIdx(idx);
    setSelectedOutcome(outcome);
    setShowBetModal(true);
  };

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
        {marketType === "multi" && teams && teams.length > 0 ? (
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
            {teams.map((team, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <span className="text-sm font-medium text-foreground truncate mr-2">{team.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => handleOpenTeamModal(e, idx, 'yes')}
                    className="px-2.5 py-1 bg-yes/10 hover:bg-yes/20 text-yes text-xs font-bold rounded-md transition-colors"
                  >
                    {team.yesPrice.toFixed(0)}¢
                  </button>
                  <button
                    onClick={(e) => handleOpenTeamModal(e, idx, 'no')}
                    className="px-2.5 py-1 bg-no/10 hover:bg-no/20 text-no text-xs font-bold rounded-md transition-colors"
                  >
                    {team.noPrice.toFixed(0)}¢
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedOutcome('yes'); setShowBetModal(true); }}
              className="flex items-center justify-between p-2.5 rounded-lg bg-yes/20 hover:bg-yes text-yes hover:text-white border border-yes/40 transition-all group/btn"
            >
              <span className="text-sm font-black uppercase tracking-wider">
                {marketType === 'versus' ? (shortA || optionA) : 'Yes'}
              </span>
              <span className="text-sm font-black text-yes group-hover/btn:text-white">{yesPrice.toFixed(0)}p</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedOutcome('no'); setShowBetModal(true); }}
              className="flex items-center justify-between p-2.5 rounded-lg bg-no/20 hover:bg-no text-no hover:text-white border border-no/40 transition-all group/btn"
            >
              <span className="text-sm font-black uppercase tracking-wider">
                {marketType === 'versus' ? (shortB || optionB) : 'No'}
              </span>
              <span className="text-sm font-black text-no group-hover/btn:text-white">{noPrice.toFixed(0)}p</span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border text-xs font-medium text-muted-foreground">
          <span>₹{volume.toLocaleString()} Vol.</span>
          {endDate && (
            <span className={cn(isClosed && "text-no font-bold")}>
              {isClosed ? "Closed" : `Ends ${new Date(endDate).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
        </div>
        </div>
      </div>

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
          teams: teams,
          pool: selectedTeam
            ? { yesPool: selectedTeam.yesPool, noPool: selectedTeam.noPool, totalLiquidity: selectedTeam.yesPool + selectedTeam.noPool }
            : (pool || { yesPool: 1000, noPool: 1000, totalLiquidity: 2000 }) as MarketPool,
          priceHistory: priceHistory,
          status: status,
          volume: volume,
          resolvedOutcome: resolvedOutcome,
          endDate: endDate,
        }}
        onTrade={onTrade || (() => { })}
      />
    </>
  );
}