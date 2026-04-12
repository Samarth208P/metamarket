import mongoose from "mongoose";

export interface IComment extends mongoose.Document {
  marketId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date;
}

const CommentSchema = new mongoose.Schema<IComment>(
  {
    marketId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

const Comment = (mongoose.models.Comment as mongoose.Model<IComment>) || mongoose.model<IComment>("Comment", CommentSchema);
export default Comment;
