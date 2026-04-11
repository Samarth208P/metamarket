import "dotenv/config";
import { createServer } from '../server/index';

// Vercel serverless entry point
let appInstance: any = null;

export default async function handler(req: any, res: any) {
  if (!appInstance) {
    appInstance = await createServer();
  }
  return appInstance(req, res);
}
