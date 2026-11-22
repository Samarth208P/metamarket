import { query, withSystem } from "../database.ts";

interface TreasuryValues {
  realReserves: number;
  solvencyThreshold: number;
}

const Treasury = {
  async get() {
    const result = await withSystem(() =>
      query<TreasuryValues>(
        `select real_reserves as "realReserves", solvency_threshold as "solvencyThreshold"
       from metamarket.treasury where singleton`,
      ),
    );
    return result.rows[0];
  },

  async update(values: Partial<TreasuryValues>) {
    await withSystem(() =>
      query(
        `update metamarket.treasury set real_reserves = coalesce($1, real_reserves),
       solvency_threshold = coalesce($2, solvency_threshold) where singleton`,
        [values.realReserves ?? null, values.solvencyThreshold ?? null],
      ),
    );
  },
};

export default Treasury;
