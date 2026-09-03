import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;

declare global {
  var __chainerMongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined;
}

const cached = global.__chainerMongoose ?? (global.__chainerMongoose = { conn: null, promise: null });

export function isDbConfigured(): boolean {
  return !!uri;
}

/**
 * Verbindet (einmalig) zu MongoDB. Gibt null zurück, wenn keine MONGODB_URI gesetzt ist –
 * die App läuft dann ohne Login/Persistenz weiter.
 */
export async function connectDb(): Promise<typeof mongoose | null> {
  if (!uri) return null;
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 5000 });
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }
  return cached.conn;
}
