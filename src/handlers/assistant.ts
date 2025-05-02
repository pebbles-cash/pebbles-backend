// TODO: unit tests

import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { requireAuth } from "../middleware/auth";
import * as aiAssistant from "../services/ai-assistant";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";

/**
 * Process a message to the AI assistant
 * POST /api/assistant/message
 */
export const sendMessage = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body = JSON.parse(event.body);
      const { message, sessionId } = body;

      if (!message || typeof message !== "string" || message.trim() === "") {
        return error("Valid message is required", 400);
      }

      // Process the message
      const response = await aiAssistant.processUserMessage(
        userId,
        sessionId || null,
        message.trim()
      );

      return success({
        sessionId: response.sessionId,
        message: response.assistantResponse,
        tokenUsage: response.tokenUsage,
      });
    } catch (err) {
      console.error("Send message error:", err);
      return error("Could not process message", 500);
    }
  }
);

/**
 * Get all chat sessions for the current user
 * GET /api/assistant/sessions
 */
export const getSessions = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get all sessions for this user
      const sessions = await aiAssistant.getUserChatSessions(userId);

      return success({
        sessions,
      });
    } catch (err) {
      console.error("Get sessions error:", err);
      return error("Could not retrieve chat sessions", 500);
    }
  }
);

/**
 * Get a specific chat session with messages
 * GET /api/assistant/sessions/:sessionId
 */
export const getSession = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get session ID from path parameters
      const sessionId = event.pathParameters?.sessionId;

      if (!sessionId) {
        return error("Session ID parameter is required", 400);
      }

      // Get the session
      const session = await aiAssistant.getChatSession(userId, sessionId);

      return success({
        session,
      });
    } catch (err) {
      console.error("Get session error:", err);
      return error("Could not retrieve chat session", 500);
    }
  }
);

/**
 * Delete a chat session
 * DELETE /api/assistant/sessions/:sessionId
 */
export const deleteSession = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      // Get session ID from path parameters
      const sessionId = event.pathParameters?.sessionId;

      if (!sessionId) {
        return error("Session ID parameter is required", 400);
      }

      // Delete the session
      await aiAssistant.deleteChatSession(userId, sessionId);

      return success({
        message: "Chat session deleted successfully",
      });
    } catch (err) {
      console.error("Delete session error:", err);
      return error("Could not delete chat session", 500);
    }
  }
);

/**
 * Generate an invoice based on transaction data
 * POST /api/assistant/generate-invoice
 */
export const generateInvoice = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      // Database connection is handled in requireAuth middleware

      // User is provided by the auth middleware
      const userId = event.user?.id;

      if (!userId) {
        return error("User ID not found in token", 401);
      }

      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body = JSON.parse(event.body);
      const { client, startDate, endDate, format = "pdf" } = body;

      if (!client) {
        return error("Client name is required", 400);
      }

      if (!startDate || !endDate) {
        return error("Start and end dates are required", 400);
      }

      // This would connect to another service to generate the actual invoice
      // For now, we'll return a success message

      return success({
        message: "Invoice generation started",
        invoiceId: "mock-invoice-id",
        client,
        startDate,
        endDate,
        format,
      });
    } catch (err) {
      console.error("Generate invoice error:", err);
      return error("Could not generate invoice", 500);
    }
  }
);
