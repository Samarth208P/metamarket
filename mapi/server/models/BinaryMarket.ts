import { newId, query, withSystem } from "../database.ts";

export type BinaryMarketStatus =
  | "waiting"
  | "active"
  | "settling"
  | "settled_up"
  | "settled_down";

export interface IBinaryTrade {
  userId: string;
  userName?: string;
  side: "up" | "down";
  amount: number;
  entryProbability: number;
  payout: number;
  timestamp: Date;
  sold?: boolean;
}

export interface IBinaryPriceSnapshot {
  price: number;
  timestamp: Date;
}

export interface IBinaryMarket {
  id: string;
  assetPair: string;
  targetPrice: number;
  finalPrice?: number;
  startTime: Date;
  endTime: Date;
  status: BinaryMarketStatus;
  trades: IBinaryTrade[];
  priceSnapshots: IBinaryPriceSnapshot[];
  volume: number;
  createdAt: Date;
  updatedAt: Date;
}

type BinaryRow = {
  id: string;
  asset_pair: string;
  start_time: Date;
  end_time: Date;
  status: BinaryMarketStatus;
  state: Pick<
    IBinaryMarket,
    "targetPrice" | "finalPrice" | "priceSnapshots" | "volume"
  >;
  trades: IBinaryTrade[];
  created_at: Date;
  updated_at: Date;
};

const tradesForMarket = `coalesce(
  (select jsonb_agg(trade order by ordinal) from metamarket.binary_trades where market_id = m.id), '[]'
) as trades`;

function hydrate(row: BinaryRow): IBinaryMarket {
  return {
    ...row.state,
    id: row.id,
    assetPair: row.asset_pair,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    trades: row.trades ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BinaryMarket = {
  async findById(id: string, lock = false) {
    // Lock before reading trades so a waiting writer sees the previous commit's trade changes.
    if (lock)
      await query(
        "select id from metamarket.binary_markets where id = $1 for update",
        [id],
      );
    const result = await query<BinaryRow>(
      `select m.*, ${tradesForMarket} from metamarket.binary_markets m
       where m.id = $1`,
      [id],
    );
    return result.rows[0] ? hydrate(result.rows[0]) : null;
  },

  async findActive(endTime?: Date) {
    const result = await query<BinaryRow>(
      `select m.*, ${tradesForMarket} from metamarket.binary_markets m
       where status = 'active' and ($1::timestamptz is null or end_time = $1)
       order by end_time desc limit 1`,
      [endTime ?? null],
    );
    return result.rows[0] ? hydrate(result.rows[0]) : null;
  },

  async listHistory() {
    const result = await query<BinaryRow>(
      `select m.id, m.asset_pair, m.start_time, m.end_time, m.status, m.created_at, m.updated_at,
              m.state - 'priceSnapshots' as state, ${tradesForMarket}
       from metamarket.binary_markets m where status in ('settled_up', 'settled_down')
       order by end_time desc limit 20`,
    );
    return result.rows.map(hydrate);
  },

  async openSlot(
    input: Pick<
      IBinaryMarket,
      "assetPair" | "startTime" | "endTime" | "targetPrice" | "priceSnapshots"
    >,
  ) {
    const { assetPair, startTime, endTime, targetPrice, priceSnapshots } =
      input;
    return withSystem(async () => {
      const result = await query<BinaryRow>(
        `insert into metamarket.binary_markets (id, asset_pair, start_time, end_time, status, state)
         values ($1, $2, $3, $4, 'active', $5)
         on conflict (asset_pair, start_time) do nothing returning *`,
        [
          newId(),
          assetPair,
          startTime,
          endTime,
          JSON.stringify({ targetPrice, priceSnapshots, volume: 0 }),
        ],
      );
      return result.rows[0]
        ? hydrate(result.rows[0])
        : BinaryMarket.findActive(endTime);
    });
  },

  async capturePrice(id: string, price: number) {
    await withSystem(() =>
      query(
        `update metamarket.binary_markets
       set state = jsonb_set(state, '{priceSnapshots}', coalesce(state->'priceSnapshots', '[]') || $2::jsonb),
           updated_at = now()
       where id = $1 and status = 'active'`,
        [id, JSON.stringify([{ price, timestamp: new Date() }])],
      ),
    );
  },

  async captureScheduledPrices(id: string, prices: IBinaryPriceSnapshot[]) {
    await withSystem(() =>
      query(
        `update metamarket.binary_markets as market
         set state = jsonb_set(state, '{priceSnapshots}',
             coalesce(state->'priceSnapshots', '[]') || coalesce((
               select jsonb_agg(snapshot order by ordinal)
               from jsonb_array_elements($2::jsonb) with ordinality as entries(snapshot, ordinal)
               where (snapshot->>'timestamp')::timestamptz > coalesce(
                 (market.state->'priceSnapshots'->-1->>'timestamp')::timestamptz, market.start_time
               )
             ), '[]')), updated_at = now()
         where id = $1 and status = 'active'
           and $3::timestamptz > coalesce((state->'priceSnapshots'->-1->>'timestamp')::timestamptz, start_time)`,
        [id, JSON.stringify(prices), prices[prices.length - 1].timestamp],
      ),
    );
  },

  async listExpired(limit?: number) {
    const result = await withSystem(() =>
      query<BinaryRow>(
        `select m.*, ${tradesForMarket} from metamarket.binary_markets m
       where status in ('active', 'settling') and end_time <= now() order by end_time limit $1`,
        [limit ?? null],
      ),
    );
    return result.rows.map(hydrate);
  },

  async save(market: IBinaryMarket) {
    const {
      id,
      status,
      trades,
      targetPrice,
      finalPrice,
      priceSnapshots,
      volume,
    } = market;
    await query(
      "update metamarket.binary_markets set status = $2, state = $3, updated_at = now() where id = $1",
      [
        id,
        status,
        JSON.stringify({ targetPrice, finalPrice, priceSnapshots, volume }),
      ],
    );
    await query(
      `insert into metamarket.binary_trades as existing (market_id, ordinal, user_id, trade)
       select $1, ordinal, trade->>'userId', trade from jsonb_array_elements($2::jsonb)
       with ordinality as entries(trade, ordinal)
       on conflict (market_id, ordinal) do update set trade = excluded.trade, user_id = excluded.user_id
       where existing.trade is distinct from excluded.trade`,
      [id, JSON.stringify(trades)],
    );
  },

  async pruneHistory() {
    return withSystem(() =>
      query(
        `delete from metamarket.binary_markets
       where status in ('settled_up', 'settled_down') and id in (
         select id from metamarket.binary_markets where status in ('settled_up', 'settled_down')
         order by end_time desc offset 5
       )`,
      ),
    );
  },
};

export default BinaryMarket;
