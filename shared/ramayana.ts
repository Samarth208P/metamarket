export const RAMAYANA_MARKET_ID = "72616d6179616e6132303236";
export const RAMAYANA_PATH = "/ramayana";
export const RAMAYANA_TARGET = 2000;
export const RAMAYANA_POSTER = "/ramayana/poster.jpg";
export const RAMAYANA_SOURCE =
  "https://www.sacnilk.com/movie/ramayana_part_1_2026";
export const RAMAYANA_DAILY_SOURCE =
  "https://www.sacnilk.com/big-release/ramayana_part_1_2026#br-block-4";

export interface RamayanaBoxOffice {
  dailyGross: number[];
  pendingDay: number | null;
  sourceStatus: "current" | "saved";
}

export const ramayanaBoxOfficeSnapshot: RamayanaBoxOffice = {
  dailyGross: [
    128.75, 103.3, 155.2, 122.95, 165.7, 149.1, 119.55, 86, 87.45, 137, 134,
    53.25, 51.15, 37.65, 33.1, 33.8, 53.05,
  ],
  pendingDay: 18,
  sourceStatus: "saved",
};
