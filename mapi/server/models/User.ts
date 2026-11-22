import type { User as Account } from "../../../shared/api.ts";
import { newId, query, withSystem } from "../database.ts";

export const STARTER_BALANCE = 1000;

export interface IUser {
  id: string;
  googleId: string;
  email: string;
  name: string;
  username?: string;
  termsAcceptedAt?: Date;
  starterGiftAmount?: number;
  starterGiftSeenAt?: Date;
  isAdmin: boolean;
  balance: number;
  tradeHistory: any[];
  positions: {
    marketId: string;
    optionId: string;
    optionName?: string;
    shares: number;
  }[];
  holdings?: {
    marketId: string;
    teamIndex?: number;
    yesShares: number;
    noShares: number;
  }[];
  lastRank?: number;
  lastRankUpdate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  namespace Express {
    interface User extends IUser {}
  }
}

export function needsOnboarding(user: IUser) {
  return !user.username || !user.termsAcceptedAt;
}

export function serializeUser(user: IUser): Account {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: user.username ?? null,
    termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
    needsOnboarding: needsOnboarding(user),
    starterGift:
      user.starterGiftAmount && !user.starterGiftSeenAt
        ? { amount: user.starterGiftAmount }
        : null,
    isAdmin: user.isAdmin,
    balance: user.balance,
    tradeHistory: user.tradeHistory,
    positions: user.positions,
    holdings: user.holdings,
  };
}

const accountColumns = `
  id, google_id as "googleId", email, name, username,
  terms_accepted_at as "termsAcceptedAt", starter_gift_amount::float8 as "starterGiftAmount",
  starter_gift_seen_at as "starterGiftSeenAt", is_admin as "isAdmin", balance::float8 as balance,
  trade_history as "tradeHistory", positions, holdings, last_rank as "lastRank",
  last_rank_update as "lastRankUpdate", created_at as "createdAt", updated_at as "updatedAt"
`;

const User = {
  async findById(id: string, lock = false) {
    const result = await query<IUser>(
      `select ${accountColumns} from metamarket.accounts where id = $1 ${lock ? "for update" : ""}`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async signIn(profile: {
    googleId: string;
    email: string;
    name: string;
    isAdmin: boolean;
  }) {
    const result = await withSystem(() =>
      query<IUser>(
        `insert into metamarket.accounts (id, google_id, email, name, is_admin, starter_gift_amount)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (google_id) do update set email = excluded.email, name = excluded.name, updated_at = now()
       returning ${accountColumns}`,
        [
          newId(),
          profile.googleId,
          profile.email,
          profile.name,
          profile.isAdmin,
          STARTER_BALANCE,
        ],
      ),
    );
    return result.rows[0];
  },

  async completeOnboarding(id: string, username: string) {
    const result = await query<IUser>(
      `update metamarket.accounts set username = $2, terms_accepted_at = now(), updated_at = now()
       where id = $1 and (username is null or terms_accepted_at is null)
       returning ${accountColumns}`,
      [id, username],
    );
    return result.rows[0] ?? User.findById(id);
  },

  async acknowledgeGift(id: string) {
    await query(
      `update metamarket.accounts set starter_gift_seen_at = now(), updated_at = now()
       where id = $1 and starter_gift_amount > 0 and starter_gift_seen_at is null`,
      [id],
    );
  },

  async updateUsername(id: string, username: string) {
    const result = await query<{ username: string }>(
      `update metamarket.accounts set username = $2, updated_at = now()
       where id = $1 returning username`,
      [id, username],
    );
    return result.rows[0] ?? null;
  },

  async clearHistory(id: string) {
    const result = await query<IUser>(
      `update metamarket.accounts set trade_history = '[]', updated_at = now()
       where id = $1 returning ${accountColumns}`,
      [id],
    );
    return result.rows[0] ?? null;
  },

  async savePortfolio(user: IUser) {
    const balance = Math.round(user.balance * 100) / 100;
    await query(
      `update metamarket.accounts set balance = $2, trade_history = $3,
       positions = $4, holdings = $5, updated_at = now() where id = $1`,
      [
        user.id,
        balance,
        JSON.stringify(user.tradeHistory),
        JSON.stringify(user.positions),
        JSON.stringify(user.holdings ?? []),
      ],
    );
    user.balance = balance;
  },

  async listPortfolios({
    ranked = false,
    marketId = undefined,
    lock = false,
  }: { ranked?: boolean; marketId?: string; lock?: boolean } = {}) {
    const result = await withSystem(() =>
      query<IUser>(
        `select ${accountColumns} from metamarket.accounts
       where (not $1::boolean or (username is not null and terms_accepted_at is not null))
       and ($2::text is null or positions @> jsonb_build_array(jsonb_build_object('marketId', $2::text))
          or holdings @> jsonb_build_array(jsonb_build_object('marketId', $2::text)))
       order by id ${lock ? "for update" : ""}`,
        [ranked, marketId ?? null],
      ),
    );
    return result.rows;
  },

  async saveRank(id: string, rank: number, now: Date) {
    await withSystem(() =>
      query(
        "update metamarket.accounts set last_rank = $2, last_rank_update = $3 where id = $1",
        [id, rank, now],
      ),
    );
  },

  async listAdmins() {
    const result = await withSystem(() =>
      query(
        `select id, email, name, is_admin as "isAdmin" from metamarket.accounts where is_admin`,
      ),
    );
    return result.rows;
  },

  async promoteByEmail(email: string) {
    const result = await withSystem(() =>
      query<IUser>(
        `update metamarket.accounts set is_admin = true, updated_at = now()
       where email = $1 returning ${accountColumns}`,
        [email],
      ),
    );
    return result.rows[0] ?? null;
  },

  async removeAdmin(id: string) {
    const result = await withSystem(() =>
      query(
        "update metamarket.accounts set is_admin = false, updated_at = now() where id = $1",
        [id],
      ),
    );
    return result.rowCount === 1;
  },
};

export default User;
