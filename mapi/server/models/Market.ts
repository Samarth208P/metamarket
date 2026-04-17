import mongoose from "mongoose";

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

export interface IMarket extends mongoose.Document {
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

const PriceHistorySchema = new mongoose.Schema<PriceHistoryPoint>(
  {
    yesPrice: { type: Number, required: true },
    noPrice: { type: Number, required: true },
    allPrices: { type: [Number] },
    prices: {
      type: [
        {
          optionId: { type: String, required: true },
          price: { type: Number, required: true },
          _id: false,
        },
      ],
    },
    note: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const MarketSchema = new mongoose.Schema<IMarket>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, default: "General" },
    marketType: {
      type: String,
      enum: ["binary", "versus", "multi"],
      default: "binary",
    },
    ammType: { type: String, enum: ["legacy", "lmsr"], default: "lmsr" },
    optionA: { type: String },
    optionB: { type: String },
    shortA: { type: String },
    shortB: { type: String },
    logoUrl: { type: String },
    options: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        shortName: { type: String },
        imageUrl: { type: String },
        shares: { type: Number, default: 1000 },
        _id: false,
      },
    ],
    teams: [
      {
        name: { type: String },
        imageUrl: { type: String },
        yesPool: { type: Number, default: 1000 },
        noPool: { type: Number, default: 1000 },
        _id: false,
      },
    ],
    creatorId: { type: String },
    status: {
      type: String,
      enum: ["active", "resolved_yes", "resolved_no", "resolved_option"],
      default: "active",
    },
    yesPool: { type: Number, default: 1000 },
    noPool: { type: Number, default: 1000 },
    volume: { type: Number, default: 0 },
    priceHistory: { type: [PriceHistorySchema], default: [] },
    resolvedOutcome: { type: String, enum: ["yes", "no"], default: null },
    resolvedOptionId: { type: String, default: null },
    initialB: { type: Number, default: 1000 },
    minB: { type: Number, default: 250 },
    isDynamic: { type: Boolean, default: false },
    endDate: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform(_doc, ret) {
        const record = ret as any;
        record.id = record._id?.toString();
        delete record._id;
      },
    },
  },
);

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

const Market =
  (mongoose.models.Market as mongoose.Model<IMarket>) ||
  mongoose.model<IMarket>("Market", MarketSchema);
export default Market;
