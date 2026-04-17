import mongoose from "mongoose";

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

export interface IBinaryMarket extends mongoose.Document {
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

const BinaryTradeSchema = new mongoose.Schema<IBinaryTrade>(
  {
    userId: { type: String, required: true },
    userName: { type: String },
    side: { type: String, enum: ["up", "down"], required: true },
    amount: { type: Number, required: true },
    entryProbability: { type: Number, required: true },
    payout: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
    sold: { type: Boolean, default: false },
  },
  { _id: false },
);

const PriceSnapshotSchema = new mongoose.Schema<IBinaryPriceSnapshot>(
  {
    price: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const BinaryMarketSchema = new mongoose.Schema<IBinaryMarket>(
  {
    assetPair: { type: String, required: true, default: "BTCUSDT" },
    targetPrice: { type: Number, required: true },
    finalPrice: { type: Number },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: {
      type: String,
      enum: ["waiting", "active", "settling", "settled_up", "settled_down"],
      default: "waiting",
    },
    trades: { type: [BinaryTradeSchema], default: [] },
    priceSnapshots: { type: [PriceSnapshotSchema], default: [] },
    volume: { type: Number, default: 0 },
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

const BinaryMarket =
  (mongoose.models.BinaryMarket as mongoose.Model<IBinaryMarket>) ||
  mongoose.model<IBinaryMarket>("BinaryMarket", BinaryMarketSchema);

export default BinaryMarket;
