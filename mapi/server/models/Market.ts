import { newId, query } from "../database.ts";

export type MarketStatus =
  | "active"
  | "resolved_yes"
  | "resolved_no"
  | "resolved_option";

export interface PriceHistoryPoint {
  yesPrice: number;
  noPrice: number;
  allPrices?: number[]; // Added to track all team prices in multi-markets
  prices?: { optionId: string; price: number }[];
  note: string;
  timestamp: Date;
}

export interface IMarket {
  id: string;
  title: string;
  description: string;
  category: string;
  marketType: "binary" | "versus" | "multi";
  ammType: "legacy" | "lmsr";
  optionA?: string;
  optionB?: string;
  shortA?: string;
  shortB?: string;
  logoUrl?: string;
  options: {
    id: string;
    name: string;
    shortName?: string;
    imageUrl?: string;
    shares: number;
  }[];
  teams?: {
    name: string;
    imageUrl?: string;
    yesPool: number;
    noPool: number;
  }[];
  creatorId?: string;
  status: MarketStatus;
  yesPool: number;
  noPool: number;
  volume: number;
  priceHistory: PriceHistoryPoint[];
  resolvedOutcome?: "yes" | "no";
  resolvedOptionId?: string;
  initialB: number;
  minB: number;
  isDynamic: boolean;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function calculateYesPrice(yesPool: number, noPool: number): number {
  const total = yesPool + noPool;
  if (total <= 0) return 50;
  return Math.min(100, Math.max(0, (noPool / total) * 100));
}

export function calculateNoPrice(yesPool: number, noPool: number): number {
  const total = yesPool + noPool;
  if (total <= 0) return 50;
  return Math.min(100, Math.max(0, (yesPool / total) * 100));
}

type MarketRow = {
  id: string;
  status: MarketStatus;
  state: Omit<IMarket, "id" | "status" | "createdAt" | "updatedAt">;
  created_at: Date;
  updated_at: Date;
};

function hydrate(row: MarketRow): IMarket {
  return {
    ...row.state,
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function newMarket(input: Partial<IMarket>): IMarket {
  return {
    id: newId(),
    title: "",
    description: "",
    category: "General",
    marketType: "binary",
    ammType: "lmsr",
    options: [],
    teams: [],
    status: "active",
    yesPool: 1000,
    noPool: 1000,
    volume: 0,
    priceHistory: [],
    initialB: 1000,
    minB: 250,
    isDynamic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...input,
  };
}

const Market = {
  async findById(id: string, lock = false) {
    const result = await query<MarketRow>(
      `select * from metamarket.markets where id = $1 ${lock ? "for update" : ""}`,
      [id],
    );
    return result.rows[0] ? hydrate(result.rows[0]) : null;
  },

  async list(status?: MarketStatus) {
    const result = await query<MarketRow>(
      `select * from metamarket.markets
       where $1::text is null or status = $1 order by status, created_at desc`,
      [status ?? null],
    );
    return result.rows.map(hydrate);
  },

  async create(input: Partial<IMarket>) {
    const { id, status, createdAt, updatedAt, ...state } = newMarket(input);
    const result = await query<MarketRow>(
      `insert into metamarket.markets (id, status, state, created_at, updated_at)
       values ($1, $2, $3, $4, $5) returning *`,
      [id, status, JSON.stringify(state), createdAt, updatedAt],
    );
    return hydrate(result.rows[0]);
  },

  async save(market: IMarket) {
    const { id, status, createdAt, updatedAt, ...state } = market;
    const result = await query(
      `update metamarket.markets set status = $2, state = $3, updated_at = now()
       where id = $1 returning updated_at`,
      [id, status, JSON.stringify(state)],
    );
    market.updatedAt = result.rows[0].updated_at;
  },
};

export default Market;
