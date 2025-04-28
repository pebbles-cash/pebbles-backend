// src/handlers/health.ts
import { APIGatewayProxyResult } from "aws-lambda";
import mongoose from "mongoose";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";

/**
 * Check database connection status
 * GET /api/health/db
 */
export const checkDbConnection = async (): Promise<APIGatewayProxyResult> => {
  try {
    // Ensure database is connected
    await connectToDatabase();

    // Check connection state
    const state = mongoose.connection.readyState;
    const stateMap: Record<number, string> = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
      99: "uninitialized",
    };

    const connectionStatus = stateMap[state] || "unknown";

    // Run a simple command to verify database is responsive
    let pingResult = "Not attempted";
    if (state === 1) {
      try {
        const pingResponse = await mongoose.connection.db.admin().ping();
        pingResult = pingResponse.ok === 1 ? "success" : "failed";
      } catch (pingErr) {
        pingResult = `error: ${(pingErr as Error).message}`;
      }
    }

    return success({
      status: connectionStatus,
      readyState: state,
      ping: pingResult,
      database: mongoose.connection.db.databaseName,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
    });
  } catch (err) {
    console.error("Database connection check failed:", err);
    return error(
      `Database connection check failed: ${(err as Error).message}`,
      500
    );
  }
};
