import mongoose from "mongoose";

export interface ITreasury extends mongoose.Document {
  realReserves: number;
  solvencyThreshold: number;
  updatedAt: Date;
  createdAt: Date;
}

const TreasurySchema = new mongoose.Schema<ITreasury>(
  {
    realReserves: { type: Number, default: 0 },
    solvencyThreshold: { type: Number, default: 1 },
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

const Treasury =
  (mongoose.models.Treasury as mongoose.Model<ITreasury>) ||
  mongoose.model<ITreasury>("Treasury", TreasurySchema);

export default Treasury;
