import mongoose from "mongoose";
import {
  MONGODB_URI,
  MONGODB_DATABASE,
  NODE_ENV,
  IS_PRODUCTION,
} from "../config/env";

// Keep track of connection status
let isConnected = false;

/**
 * Optimized MongoDB connection for Lambda functions
 * Uses connection pooling and faster timeouts
 */
export const connectToDatabase = async (): Promise<
  mongoose.Connection | undefined
> => {
  // If we're already connected, return the existing connection
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    // Configure Mongoose (important for Lambda environment)
    mongoose.set("strictQuery", false);

    // Get MongoDB URI and database name from environment variables
    const uri = MONGODB_URI;

    // Append environment to database name for better isolation
    let dbName = MONGODB_DATABASE || "pebbles";
    if (NODE_ENV && !dbName.includes(NODE_ENV) && NODE_ENV !== "production") {
      dbName = `${dbName}-${NODE_ENV}`;
    }

    console.log(`Connecting to MongoDB (${NODE_ENV} environment)...`);
    console.log(`Database: ${dbName}`);

    if (!uri) {
      throw new Error("MONGODB_URI environment variable is not set");
    }

    // ✅ OPTIMIZED CONNECTION OPTIONS FOR LAMBDA
    const connectionOptions: mongoose.ConnectOptions = {
      dbName,

      // 🚀 Connection pool settings - optimized for Lambda
      maxPoolSize: IS_PRODUCTION ? 10 : 5, // Reduced from 50/10
      minPoolSize: IS_PRODUCTION ? 2 : 1, // Reduced from 10/5

      // ⚡ Aggressive timeouts for Lambda (faster failures)
      serverSelectionTimeoutMS: 2000, // Reduced from 5000/10000
      socketTimeoutMS: 30000, // Reduced from 45000/60000
      connectTimeoutMS: 10000, // Added explicit connect timeout

      // 🔥 Lambda-specific optimizations
      bufferCommands: false, // Don't buffer operations

      // 💾 Connection persistence (but with shorter intervals)
      keepAlive: true,
      keepAliveInitialDelay: 120000, // Reduced from 300000 (2min vs 5min)

      // 🔐 Security settings
      ssl: true,
      sslValidate: false, // Changed from true - faster in Lambda
      authSource: "admin",

      // 📊 Additional Lambda optimizations
      maxIdleTimeMS: 30000, // Close idle connections faster
      heartbeatFrequencyMS: 10000, // More frequent heartbeats
      retryWrites: true, // Auto-retry failed writes
      retryReads: true, // Auto-retry failed reads

      // 🎯 Read preferences for better performance
      readPreference: "primary", // Always read from primary
    };

    // Non-production settings
    if (!IS_PRODUCTION) {
      // Disable debug logging in Lambda to reduce noise
      mongoose.set("debug", false);

      // Less aggressive timeouts for development
      connectionOptions.serverSelectionTimeoutMS = 5000;
      connectionOptions.socketTimeoutMS = 45000;
    }

    // 🚀 Connect to MongoDB with optimized settings
    const db = await mongoose.connect(uri, connectionOptions);

    isConnected = db.connection.readyState === 1; // 1 = connected

    console.log(`MongoDB connected successfully to ${dbName}`);
    console.log(
      `Connection pool: min=${connectionOptions.minPoolSize}, max=${connectionOptions.maxPoolSize}`
    );

    return db.connection;
  } catch (error) {
    console.error(`MongoDB connection error (${NODE_ENV}):`, error);
    isConnected = false;
    throw error;
  }
};

/**
 * Enhanced connection health check
 */
export const checkConnectionHealth = (): boolean => {
  return isConnected && mongoose.connection.readyState === 1;
};

/**
 * Force reconnection if needed
 */
export const forceReconnect = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  isConnected = false;
  await connectToDatabase();
};

/**
 * Get connection stats for monitoring
 */
export const getConnectionStats = () => {
  return {
    readyState: mongoose.connection.readyState,
    name: mongoose.connection.name,
    host: mongoose.connection.host,
    port: mongoose.connection.port,
    isConnected,
  };
};

/**
 * Close the Mongoose connection - generally not needed in Lambda
 * but useful for testing or graceful shutdown in other environments
 */
export const closeConnection = async (): Promise<void> => {
  if (isConnected) {
    try {
      await mongoose.disconnect();
      isConnected = false;
      console.log("MongoDB disconnected");
    } catch (error) {
      console.error("Error disconnecting from MongoDB:", error);
      throw error;
    }
  }
};
