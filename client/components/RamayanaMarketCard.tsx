import { ArrowUpRight, Bookmark } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Market } from "@shared/api";
import { RAMAYANA_PATH, RAMAYANA_POSTER } from "@shared/ramayana";

const diyaCursor = { cursor: "url('/ramayana/diya-cursor.svg') 16 2, pointer" };

export function RamayanaMarketCard({ market }: { market: Market }) {
  const { bookmarks, toggleBookmark } = useAuth();
  const bookmarked = bookmarks.includes(market.id);

  return (
    <article className="relative flex min-h-52 flex-1 overflow-hidden bg-[#241712] text-[#fff0d9]">
      <Link
        to={RAMAYANA_PATH}
        style={diyaCursor}
        className="group flex min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#edbd77]"
      >
        <img
          src={RAMAYANA_POSTER}
          width="600"
          height="900"
          alt=""
          loading="lazy"
          className="w-28 shrink-0 object-cover sm:w-32"
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 py-5 pl-4 pr-10 sm:pl-5">
          <span className="text-xs font-semibold text-[#e3bb86]">
            Box office market
          </span>
          <h3 className="font-serif text-lg font-semibold leading-snug sm:text-2xl">
            {market.title}
          </h3>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[#edbd77] group-hover:underline">
            View market <ArrowUpRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </Link>
      <button
        type="button"
        aria-label={`Bookmark ${market.title}`}
        aria-pressed={bookmarked}
        onClick={() => toggleBookmark(market.id)}
        style={diyaCursor}
        className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-[#e3bb86] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#edbd77]"
      >
        <Bookmark
          aria-hidden="true"
          className={cn("size-4", bookmarked && "fill-current")}
        />
      </button>
    </article>
  );
}
