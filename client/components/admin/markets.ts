import type { MarketType } from "@shared/api";

export const marketTypeLabels: Record<MarketType, string> = {
  binary: "Yes / No",
  versus: "Versus",
  multi: "Multi-team",
};

export const formatRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
}).format;

export async function adminRequest<T>(
  path: string,
  errorMessage: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/mapi${path}`, {
    credentials: "include",
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new Error(data?.error || errorMessage);
  }
  return data;
}
