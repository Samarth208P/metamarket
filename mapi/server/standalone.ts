import "dotenv/config";
import { createServer, connectDB } from "./index.js";

const PORT = process.env.PORT || 10000;

async function startStandaloneServer() {
  try {
    // 1. Connect to Database Once
    await connectDB();
    console.log("[Standalone] Database connected successfully.");

    // 2. Initialize the Express App (which also starts binaryScheduler + binanceFeed)
    const app = await createServer();

    // 3. Listen continuously
    app.listen(PORT, () => {
      console.log(`[Standalone] Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("[Standalone] Startup error:", error);
    process.exit(1);
  }
}

startStandaloneServer();
