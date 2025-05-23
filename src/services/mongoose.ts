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
 * Connect to MongoDB with Mongoose
 * Implements connection pooling for Lambda functions
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
    // e.g., pebbles-dev, pebbles-staging, pebbles-prod
    // Only if database name doesn't already include environment
    let dbName = MONGODB_DATABASE || "pebbles";
    if (NODE_ENV && !dbName.includes(NODE_ENV) && NODE_ENV !== "production") {
      dbName = `${dbName}-${NODE_ENV}`;
    }

    console.log(`Connecting to MongoDB (${NODE_ENV} environment)...`);
    console.log(`Database: ${dbName}`);

    if (!uri) {
      throw new Error("MONGODB_URI environment variable is not set");
    }

    // Environment-specific connection options
    const connectionOptions: mongoose.ConnectOptions = {
      dbName,
      // Connection pool settings - adjusted by environment
      maxPoolSize: IS_PRODUCTION ? 50 : 10,
      minPoolSize: IS_PRODUCTION ? 10 : 5,
      // Set timeouts based on environment
      serverSelectionTimeoutMS: IS_PRODUCTION ? 5000 : 10000,
      socketTimeoutMS: IS_PRODUCTION ? 45000 : 60000,
      // Keep the connection alive between invocations
      keepAlive: true,
      keepAliveInitialDelay: 300000,
      ssl: true,
      sslValidate: true,
      authSource: "admin",
    };

    // Non-production settings
    if (!IS_PRODUCTION) {
      // Add additional debug logging in non-production
      mongoose.set("debug", true);
    }

    // Connect to MongoDB
    const db = await mongoose.connect(uri, connectionOptions);

    isConnected = db.connection.readyState === 1; // 1 = connected

    console.log(`MongoDB connected successfully to ${dbName}`);
    return db.connection;
  } catch (error) {
    console.error(`MongoDB connection error (${NODE_ENV}):`, error);
    throw error;
  }
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
