import "dotenv/config";
import { connectDB } from './server/database.ts';
import { createServer } from './server/index.ts';

// Vercel serverless entry point
let appInstance: any = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appInstance) {
      console.log('Metamarket: Initializing server instance...');
      const startTime = Date.now();
      await connectDB();
      appInstance = await createServer();
      console.log(`Metamarket: Server created in ${Date.now() - startTime}ms`);
    }
    return appInstance(req, res);
  } catch (error: any) {
    console.error('CRITICAL ERROR in Vercel Handler:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'CRITICAL_HANDLER_FAILURE', 
        message: error.message,
        stack: error.stack
      });
    }
  }
}
