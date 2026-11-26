export const RAMAYANA_MARKET_ID = "72616d6179616e6132303236";
export const RAMAYANA_PATH = "/ramayana";
export const RAMAYANA_TARGET = 2000;
export const RAMAYANA_POSTER = "/ramayana/poster.jpg";
export const RAMAYANA_SOURCE =
  "https://www.sacnilk.com/movie/ramayana_part_1_2026";
export const RAMAYANA_DAILY_SOURCE =
  "https://www.sacnilk.com/big-release/ramayana_part_1_2026#br-block-4";

export interface RamayanaBoxOffice {
  worldwideGross: number;
  checkedAt: number;
  dailyGross: number[];
  pendingDay: number | null;
  sourceStatus: "current" | "saved";
}

export const ramayanaBoxOfficeSnapshot: RamayanaBoxOffice = {
  worldwideGross: 1755.5,
  checkedAt: 0,
  dailyGross: [
    128.75, 103.3, 155.2, 122.95, 165.7, 149.1, 119.55, 86, 87.45, 137, 134,
    48.25, 46.15, 35.65, 33.1, 30.8, 50.05, 56.5, 20.15, 28.5, 17.35,
  ],
  pendingDay: 22,
  sourceStatus: "saved",
};
