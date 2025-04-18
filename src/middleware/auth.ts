import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
  Handler,
} from "aws-lambda";
import jwt from "jsonwebtoken";
import { error } from "../utils/response";
import { connectToDatabase } from "../services/mongoose";
import { User } from "../models";
import { IDecodedToken, AuthenticatedAPIGatewayProxyEvent } from "../types";
import mongoose from "mongoose";

/**
 * Authentication middleware for Lambda functions
 * Verifies JWT token and adds user info to the event object
 * @param handler - The Lambda handler function
 * @returns Wrapped handler with authentication
 */
export const requireAuth = <T extends Handler>(
  handler: (
    event: AuthenticatedAPIGatewayProxyEvent,
    context: Context
  ) => Promise<APIGatewayProxyResult>
) => {
  return async (
    event: APIGatewayProxyEvent,
    context: Context
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Connect to database
      await connectToDatabase();

      // Extract JWT from Authorization header
      const token =
        event.headers.Authorization?.split(" ")[1] ||
        event.headers.authorization?.split(" ")[1];

      if (!token) {
        return error("Authorization required", 401);
      }

      // Verify token
      let decoded: IDecodedToken;
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error("JWT_SECRET is not defined");
        }

        decoded = jwt.verify(token, secret) as IDecodedToken;
      } catch (err) {
        return error("Invalid or expired token", 401);
      }

      // Check if token has been invalidated (logged out)
      const session = await mongoose.connection.db
        .collection("userSessions")
        .findOne({
          token,
          invalidated: true,
        });

      if (session) {
        return error("Session has been invalidated", 401);
      }

      // Get user from database to ensure they exist
      const user = await User.findById(decoded.userId);

      if (!user) {
        return error("User not found", 404);
      }

      // Update last activity timestamp
      await mongoose.connection.db
        .collection("userSessions")
        .updateOne({ token }, { $set: { lastActivity: new Date() } });

      // Add user info to the event object
      const authenticatedEvent = event as AuthenticatedAPIGatewayProxyEvent;
      authenticatedEvent.user = {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        walletAddress: user.walletAddress,
      };

      // Call the original handler
      return await handler(authenticatedEvent, context);
    } catch (err) {
      console.error("Authentication error:", err);
      return error("Authentication failed", 500);
    }
  };
};

/**
 * Optional authentication middleware that continues if no token is provided
 * @param handler - The Lambda handler function
 * @returns Wrapped handler with optional authentication
 */
export const optionalAuth = <T extends Handler>(
  handler: (
    event: AuthenticatedAPIGatewayProxyEvent,
    context: Context
  ) => Promise<APIGatewayProxyResult>
) => {
  return async (
    event: APIGatewayProxyEvent,
    context: Context
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Connect to database
      await connectToDatabase();

      // Extract JWT from Authorization header
      const token =
        event.headers.Authorization?.split(" ")[1] ||
        event.headers.authorization?.split(" ")[1];

      // Cast event to authenticated event type
      const authenticatedEvent = event as AuthenticatedAPIGatewayProxyEvent;

      // If no token, continue without user info
      if (!token) {
        return await handler(authenticatedEvent, context);
      }

      // Verify token
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error("JWT_SECRET is not defined");
        }

        const decoded = jwt.verify(token, secret) as IDecodedToken;

        // Check if token has been invalidated (logged out)
        const session = await mongoose.connection.db
          .collection("userSessions")
          .findOne({
            token,
            invalidated: true,
          });

        if (session) {
          // Token is invalidated, but we'll continue anonymously
          return await handler(authenticatedEvent, context);
        }

        // Get user from database
        const user = await User.findById(decoded.userId);

        if (user) {
          // Add user info to the event object
          authenticatedEvent.user = {
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            walletAddress: user.walletAddress,
          };

          // Update last activity timestamp
          await mongoose.connection.db
            .collection("userSessions")
            .updateOne({ token }, { $set: { lastActivity: new Date() } });
        }
      } catch (err) {
        // Ignore token verification errors, just continue without user info
        console.log("Token verification failed, continuing as unauthenticated");
      }

      // Call the original handler
      return await handler(authenticatedEvent, context);
    } catch (err) {
      console.error("Authentication error:", err);
      return error("Authentication failed", 500);
    }
  };
};
