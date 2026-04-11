import "dotenv/config";
import { createServer } from '../server/index';

// Vercel serverless entry point
let appInstance: any = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appInstance) {
      console.log('Metamarket: Initializing server instance...');
      appInstance = await createServer();
      console.log('Metamarket: Server instance created successfully');
    }
    return appInstance(req, res);
  } catch (error: any) {
    console.error('CRITICAL ERROR during function invocation:', error);
    res.status(500).json({ 
      error: 'CRITICAL_STARTUP_FAILURE', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
