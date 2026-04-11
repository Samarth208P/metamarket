import mongoose from "mongoose";

export type MarketStatus = "active" | "resolved_yes" | "resolved_no";

export interface PriceHistoryPoint {
  yesPrice: number;
  noPrice: number;
  note: string;
  timestamp: Date;
}

export interface IMarket extends mongoose.Document {
  title: string;
  description: string;
  category: string;
  marketType: "binary" | "versus" | "multi";
  optionA?: string;
  optionB?: string;
  shortA?: string;
  shortB?: string;
  logoUrl?: string;
  teams?: { name: string; imageUrl?: string; yesPool: number; noPool: number }[];
  creatorId?: string;
  status: MarketStatus;
  yesPool: number;
  noPool: number;
  volume: number;
  priceHistory: PriceHistoryPoint[];
  resolvedOutcome?: "yes" | "no";
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PriceHistorySchema = new mongoose.Schema<PriceHistoryPoint>(
  {
    yesPrice: { type: Number, required: true },
    noPrice: { type: Number, required: true },
    note: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const MarketSchema = new mongoose.Schema<IMarket>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, default: "General" },
    marketType: { type: String, enum: ["binary", "versus", "multi"], default: "binary" },
    optionA: { type: String },
    optionB: { type: String },
    shortA: { type: String },
    shortB: { type: String },
    logoUrl: { type: String },
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
    status: { type: String, enum: ["active", "resolved_yes", "resolved_no"], default: "active" },
    yesPool: { type: Number, default: 1000 },
    noPool: { type: Number, default: 1000 },
    volume: { type: Number, default: 0 },
    priceHistory: { type: [PriceHistorySchema], default: [] },
    resolvedOutcome: { type: String, enum: ["yes", "no"], default: null },
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
  }
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

const Market = mongoose.models.Market || mongoose.model<IMarket>("Market", MarketSchema);
export default Market;
