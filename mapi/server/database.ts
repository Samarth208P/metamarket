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
    console.log(`Connecting to MongoDB... (URI length: ${process.env.MONGODB_URI.length})`);
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
      connectTimeoutMS: 10000,
    } as any);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

export default mongoose;