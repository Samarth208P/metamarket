import type { Market } from "@shared/api";

export const marketCatalogKey = ["markets"];

export async function fetchMarkets({
  signal,
}: { signal?: AbortSignal } = {}): Promise<Market[]> {
  const response = await fetch("/mapi/markets", {
    credentials: "include",
    signal,
  });
  if (!response.ok) throw new Error("Unable to load markets");
  return response.json();
}
