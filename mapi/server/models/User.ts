import mongoose from "mongoose";

export interface IUser extends mongoose.Document {
  googleId: string;
  email: string;
  name: string;
  enrollmentNumber: string;
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

const UserSchema = new mongoose.Schema<IUser>(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    enrollmentNumber: { type: String, required: true },
    isAdmin: { type: Boolean, default: false },
    balance: {
      type: Number,
      default: 1000,
      set: (v: number) => Math.round(v * 100) / 100,
    },
    tradeHistory: { type: [Object], default: [] },
    positions: [
      {
        marketId: { type: String, required: true },
        optionId: { type: String, required: true },
        optionName: { type: String },
        shares: { type: Number, default: 0 },
        _id: false,
      },
    ],
    holdings: [
      {
        marketId: { type: String, required: true },
        teamIndex: { type: Number },
        yesShares: { type: Number, default: 0 },
        noShares: { type: Number, default: 0 },
        _id: false,
      },
    ],
    lastRank: { type: Number },
    lastRankUpdate: { type: Date },
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

const User =
  (mongoose.models.User as mongoose.Model<IUser>) ||
  mongoose.model<IUser>("User", UserSchema);
export default User;
