import { newId, query } from "../database.ts";

interface CommentRow {
  _id: string;
  marketId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date;
}

const commentColumns = `id as "_id", market_id as "marketId", user_id as "userId",
  user_name as "userName", content, created_at as "createdAt"`;

const Comment = {
  async list(marketId: string) {
    const result = await query<CommentRow>(
      `select ${commentColumns} from metamarket.comments
       where market_id = $1 order by created_at desc`,
      [marketId],
    );
    return result.rows;
  },

  async create(comment: Omit<CommentRow, "_id" | "createdAt">) {
    const { marketId, userId, userName, content } = comment;
    const result = await query<CommentRow>(
      `insert into metamarket.comments (id, market_id, user_id, user_name, content)
       values ($1, $2, $3, $4, $5) returning ${commentColumns}`,
      [newId(), marketId, userId, userName, content],
    );
    return result.rows[0];
  },
};

export default Comment;
