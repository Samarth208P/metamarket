import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/metamarket';

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    return;
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is missing!');
  }

  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("Missing MONGODB_URI");
    
    console.log(`[DB] Attempting connection...`);
    await mongoose.connect(uri);
    console.log('[DB] Connection successful');
  } catch (error) {
    console.error('[DB] Connection failed:', error);
    throw error;
  }
}

export default mongoose;