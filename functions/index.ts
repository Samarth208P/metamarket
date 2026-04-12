import { createServer } from "../mapi/server/index.js";
import { connectDB } from "../mapi/server/database.js";
import serverless from "serverless-http";

let handlerPromise: Promise<any> | null = null;

const initialize = async () => {
  console.log(`[Netlify] [${new Date().toISOString()}] Starting initialization...`);
  try {
    await connectDB();
    console.log(`[Netlify] [${new Date().toISOString()}] DB Connected. Creating Express app...`);
    const app = await createServer();
    console.log(`[Netlify] [${new Date().toISOString()}] Server ready.`);
    return serverless(app);
  } catch (error) {
    console.error("[Netlify] Initialization failed:", error);
    handlerPromise = null; 
    throw error;
  }
};

export const handler = async (event: any, context: any) => {
  try {
    if (!handlerPromise) {
      handlerPromise = initialize();
    }
    const serverlessHandler = await handlerPromise;
    // Netlify (AWS Lambda) passes event and context
    return serverlessHandler(event, context);
  } catch (error: any) {
    console.error("[Netlify] Handler error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Server initialization failed", 
        message: error.message 
      })
    };
  }
};
