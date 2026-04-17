import "dotenv/config";
import { schedule } from "@netlify/functions";
import { connectDB } from "../mapi/server/database.js";
import { ensureActiveMarket } from "../mapi/server/services/binaryScheduler.js";

// The handler logic
const cronHandler = async (event: any, context: any) => {
  console.log(
    `[Netlify Cron] [${new Date().toISOString()}] Triggered scheduled task.`,
  );
  try {
    await connectDB();
    console.log(
      `[Netlify Cron] DB Connected, explicitly running ensureActiveMarket()...`,
    );
    await ensureActiveMarket();
    console.log(`[Netlify Cron] Market cycle execution successful.`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Cron cycle executed successfully" }),
    };
  } catch (error: any) {
    console.error("[Netlify Cron] Execution failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Server initialization failed",
        message: error.message,
      }),
    };
  }
};

// Fire this function every 1 minute
export const handler = schedule("* * * * *", cronHandler);
