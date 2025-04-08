import mongoose from "mongoose";

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
  if (isConnected) {
    return mongoose.connection;
  }

  try {
    // Configure Mongoose (important for Lambda environment)
    mongoose.set("strictQuery", false);

    // Get MongoDB URI and database name from environment variables
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DATABASE;

    if (!uri) {
      throw new Error("MONGODB_URI environment variable is not set");
    }

    // Connect to MongoDB
    const db = await mongoose.connect(uri, {
      dbName,
      // Connection pool settings
      maxPoolSize: 10,
      minPoolSize: 5,
      // Important for serverless - don't wait too long
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      // Keep the connection alive between invocations
      keepAlive: true,
      keepAliveInitialDelay: 300000,
    });

    isConnected = db.connection.readyState === 1; // 1 = connected

    console.log("MongoDB connected successfully");
    return db.connection;
  } catch (error) {
    console.error("MongoDB connection error:", error);
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
