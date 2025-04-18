import axios from "axios";
import { Types } from "mongoose";
import { ChatSession } from "../models/ChatSession";
import { IMessage } from "src/types";
import { AnalyticsCache } from "../models/AnalyticsCache";
import { User, Transaction } from "../models";
import * as analyticsService from "./analytics-service";

// Define the type for LLM Service response
interface LLMResponse {
  content: string;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  finishReason?: string;
}

/**
 * Handle incoming user message and generate assistant response
 * @param userId The ID of the user sending the message
 * @param sessionId Optional ID of an existing conversation
 * @param message The user's message content
 * @returns The response object with assistant's reply
 */
export async function processUserMessage(
  userId: string,
  sessionId: string | null,
  message: string
): Promise<{
  sessionId: string;
  assistantResponse: string;
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
}> {
  try {
    // Find or create a chat session
    let session;
    if (sessionId) {
      session = await ChatSession.findOne({ _id: sessionId, userId });
      if (!session) {
        throw new Error("Chat session not found");
      }
    } else {
      // Create a new session
      session = new ChatSession({
        userId,
        messages: [],
        active: true,
      });
    }

    // Add the user message to the session
    session.addMessage("user", message);

    // Analyze the query to detect intent (financial question, invoice request, etc.)
    const intent = analyzeUserIntent(message);

    // Process the query based on intent
    let assistantResponse;
    let tokenUsage;

    if (intent.type === "financial_analysis") {
      // Query analytics data based on intent
      const analyticsData = await getFinancialDataForQuery(userId, intent);

      // Generate response using LLM with context
      const llmResponse = await generateLLMResponse(session, analyticsData);
      assistantResponse = llmResponse.content;
      tokenUsage = llmResponse.tokenUsage;
    } else if (intent.type === "invoice_generation") {
      // Extract invoice details from the query
      const invoiceData = await prepareInvoiceData(userId, intent);

      // Generate response about the invoice
      const llmResponse = await generateLLMResponse(session, invoiceData);
      assistantResponse = llmResponse.content;
      tokenUsage = llmResponse.tokenUsage;
    } else {
      // General query - no specific financial data needed
      const llmResponse = await generateLLMResponse(session);
      assistantResponse = llmResponse.content;
      tokenUsage = llmResponse.tokenUsage;
    }

    // Add the assistant response to the session
    session.addMessage("assistant", assistantResponse);

    // If this is a new session, generate a title
    if (!sessionId) {
      session.generateTitle();
    }

    // Save the session
    await session.save();

    return {
      sessionId: session._id.toString(),
      assistantResponse,
      tokenUsage,
    };
  } catch (error) {
    console.error("Error processing user message:", error);
    throw error;
  }
}

/**
 * Analyze user message to determine the intent
 */
function analyzeUserIntent(message: string): {
  type: "financial_analysis" | "invoice_generation" | "general";
  timeframe?: "day" | "week" | "month" | "year";
  transactionType?: string;
  client?: string;
  startDate?: Date;
  endDate?: Date;
} {
  const lowerMessage = message.toLowerCase();

  // Simple regex-based intent detection
  // In a production system, you might use a more sophisticated NLP approach

  // Check for financial analysis intent
  if (
    lowerMessage.includes("earn") ||
    lowerMessage.includes("income") ||
    lowerMessage.includes("revenue") ||
    lowerMessage.includes("transaction") ||
    lowerMessage.includes("payment") ||
    lowerMessage.includes("money") ||
    lowerMessage.includes("statistics") ||
    lowerMessage.includes("analytics")
  ) {
    const result: {
      type: "financial_analysis";
      timeframe?: "day" | "week" | "month" | "year";
      transactionType?: string;
      startDate?: Date;
      endDate?: Date;
    } = {
      type: "financial_analysis",
    };

    // Extract timeframe
    if (lowerMessage.includes("today") || lowerMessage.includes("day")) {
      result.timeframe = "day";
    } else if (
      lowerMessage.includes("week") ||
      lowerMessage.includes("weekly")
    ) {
      result.timeframe = "week";
    } else if (
      lowerMessage.includes("month") ||
      lowerMessage.includes("monthly")
    ) {
      result.timeframe = "month";
    } else if (
      lowerMessage.includes("year") ||
      lowerMessage.includes("yearly") ||
      lowerMessage.includes("annual")
    ) {
      result.timeframe = "year";
    }

    // Extract transaction type
    if (lowerMessage.includes("subscription")) {
      result.transactionType = "subscription";
    } else if (lowerMessage.includes("tip")) {
      result.transactionType = "tip";
    } else if (
      lowerMessage.includes("one-time") ||
      lowerMessage.includes("one time") ||
      lowerMessage.includes("single")
    ) {
      result.transactionType = "payment";
    }

    return result;
  }

  // Check for invoice generation intent
  if (
    lowerMessage.includes("invoice") ||
    lowerMessage.includes("bill") ||
    lowerMessage.includes("receipt")
  ) {
    const result: {
      type: "invoice_generation";
      client?: string;
      timeframe?: "day" | "week" | "month" | "year";
      startDate?: Date;
      endDate?: Date;
    } = {
      type: "invoice_generation",
    };

    // Try to extract client
    const clientMatch = lowerMessage.match(
      /for\s+([a-z0-9\s]+)(?:\s+for|\s+from|\s+during|\s+in|\s+at|$)/i
    );
    if (clientMatch && clientMatch[1]) {
      result.client = clientMatch[1].trim();
    }

    // Extract timeframe
    if (lowerMessage.includes("today") || lowerMessage.includes("day")) {
      result.timeframe = "day";
    } else if (
      lowerMessage.includes("week") ||
      lowerMessage.includes("weekly")
    ) {
      result.timeframe = "week";
    } else if (
      lowerMessage.includes("month") ||
      lowerMessage.includes("monthly")
    ) {
      result.timeframe = "month";
    } else if (
      lowerMessage.includes("year") ||
      lowerMessage.includes("yearly") ||
      lowerMessage.includes("annual")
    ) {
      result.timeframe = "year";
    }

    return result;
  }

  // Default to general query
  return { type: "general" };
}

/**
 * Get financial data based on user's query intent
 */
async function getFinancialDataForQuery(
  userId: string,
  intent: {
    type: "financial_analysis";
    timeframe?: "day" | "week" | "month" | "year";
    transactionType?: string;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<any> {
  // Check the analytics cache first
  const cacheKey = AnalyticsCache.generateCacheKey("earningsSummary", {
    period: intent.timeframe,
    transactionType: intent.transactionType,
    startDate: intent.startDate,
    endDate: intent.endDate,
  });

  const cachedResult = await AnalyticsCache.findByParams(
    new Types.ObjectId(userId),
    "earningsSummary",
    {
      period: intent.timeframe,
      transactionType: intent.transactionType,
      startDate: intent.startDate,
      endDate: intent.endDate,
    }
  );

  if (cachedResult) {
    return cachedResult.results;
  }

  // No cache hit, so fetch the data
  let analyticsData;

  if (intent.transactionType) {
    // Get earnings for a specific transaction type
    analyticsData = await analyticsService.getEarningsByType(
      userId,
      intent.timeframe || "month",
      intent.transactionType,
      intent.startDate,
      intent.endDate
    );
  } else {
    // Get general earnings summary
    analyticsData = await analyticsService.getEarningsSummary(
      userId,
      intent.timeframe || "month",
      intent.startDate,
      intent.endDate
    );
  }

  // Cache the results for future queries
  const cacheEntry = new AnalyticsCache({
    userId: new Types.ObjectId(userId),
    queryType: "earningsSummary",
    params: {
      period: intent.timeframe,
      transactionType: intent.transactionType,
      startDate: intent.startDate,
      endDate: intent.endDate,
    },
    results: analyticsData,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour cache
  });

  await cacheEntry.save();

  return analyticsData;
}

/**
 * Prepare data for invoice generation
 */
async function prepareInvoiceData(
  userId: string,
  intent: {
    type: "invoice_generation";
    client?: string;
    timeframe?: "day" | "week" | "month" | "year";
    startDate?: Date;
    endDate?: Date;
  }
): Promise<any> {
  // Get user info for the invoice
  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  // Find transactions related to the client
  const query: any = {
    toUserId: new Types.ObjectId(userId),
    status: "completed",
  };

  // Add client filter if provided
  if (intent.client) {
    query["metadata.client"] = { $regex: new RegExp(intent.client, "i") };
  }

  // Add date filters based on timeframe
  if (intent.startDate && intent.endDate) {
    query.createdAt = {
      $gte: intent.startDate,
      $lte: intent.endDate,
    };
  } else if (intent.timeframe) {
    const now = new Date();
    let startDate;

    switch (intent.timeframe) {
      case "day":
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "year":
        startDate = new Date(now);
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    query.createdAt = { $gte: startDate };
  }

  // Get transactions matching the criteria
  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .exec();

  // Calculate totals
  const total = transactions.reduce(
    (sum, tx) => sum + parseFloat(tx.amount),
    0
  );

  // Format for invoice data
  return {
    invoiceType: "client",
    client: intent.client || "All Clients",
    timeframe: intent.timeframe || "custom",
    transactions: transactions.map((tx) => ({
      id: tx._id,
      date: tx.createdAt,
      type: tx.type,
      description: tx.metadata?.note || `${tx.type} payment`,
      amount: tx.amount,
      currency: "USD", // Assuming USD as default, would come from tx in real system
    })),
    total,
    currency: "USD", // Assuming USD as default
    userDetails: {
      name: user.displayName || user.username,
      email: user.email,
      // Other invoice details would be stored in user profile
    },
  };
}

/**
 * Generate response using external LLM API
 */
async function generateLLMResponse(
  session: any,
  contextData?: any
): Promise<LLMResponse> {
  try {
    // Get conversation history
    const conversationHistory = session.getFormattedConversation(10);

    // Create system message with context
    let systemMessage = `You are a helpful AI financial assistant for a payment platform. 
You help users understand their transaction history, income patterns, and financial metrics.
Today is ${new Date().toISOString().split("T")[0]}.
Be concise, accurate, and helpful.`;

    // Add context data if available
    if (contextData) {
      systemMessage += `\n\nHere is the financial data requested:\n${JSON.stringify(contextData, null, 2)}`;
    }

    // Format messages for the API
    const messages = [
      { role: "system", content: systemMessage },
      ...conversationHistory,
    ];

    // Choose which LLM provider to use based on config
    const llmProvider = process.env.LLM_PROVIDER || "openai";

    if (llmProvider === "openai") {
      return await callOpenAI(messages);
    } else if (llmProvider === "anthropic") {
      return await callAnthropic(messages);
    } else {
      throw new Error(`Unsupported LLM provider: ${llmProvider}`);
    }
  } catch (error) {
    console.error("Error generating LLM response:", error);
    return {
      content:
        "I'm sorry, I encountered an error analyzing your financial data. Please try again later.",
    };
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(messages: IMessage[]): Promise<LLMResponse> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key is not configured");
    }

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.OPENAI_MODEL || "gpt-4",
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    return {
      content: response.data.choices[0].message.content,
      tokenUsage: response.data.usage,
      finishReason: response.data.choices[0].finish_reason,
    };
  } catch (error) {
    console.error("OpenAI API error:", error);
    throw error;
  }
}

/**
 * Call Anthropic API
 */
async function callAnthropic(messages: IMessage[]): Promise<LLMResponse> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Anthropic API key is not configured");
    }

    // Convert messages to Anthropic format
    const systemMessage =
      messages.find((m) => m.role === "system")?.content || "";
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: process.env.ANTHROPIC_MODEL || "claude-3-opus-20240229",
        system: systemMessage,
        messages: conversationMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        max_tokens: 1000,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      }
    );

    return {
      content: response.data.content[0].text,
      tokenUsage: {
        input: response.data.usage?.input_tokens,
        output: response.data.usage?.output_tokens,
      },
      finishReason: response.data.stop_reason,
    };
  } catch (error) {
    console.error("Anthropic API error:", error);
    throw error;
  }
}

/**
 * Get all chat sessions for a user
 */
export async function getUserChatSessions(userId: string): Promise<any[]> {
  try {
    const sessions = await ChatSession.find({ userId })
      .sort({ lastInteraction: -1 })
      .select("_id title lastInteraction messages")
      .exec();

    return sessions.map((session) => ({
      id: session._id,
      title: session.title,
      lastInteraction: session.lastInteraction,
      messageCount: session.messages.length,
      lastMessage:
        session.messages.length > 0
          ? session.messages[session.messages.length - 1]
          : null,
    }));
  } catch (error) {
    console.error("Error getting user chat sessions:", error);
    throw error;
  }
}

/**
 * Get a specific chat session with messages
 */
export async function getChatSession(
  userId: string,
  sessionId: string
): Promise<any> {
  try {
    const session = await ChatSession.findOne({
      _id: sessionId,
      userId,
    });

    if (!session) {
      throw new Error("Chat session not found");
    }

    return {
      id: session._id,
      title: session.title,
      lastInteraction: session.lastInteraction,
      messages: session.messages,
    };
  } catch (error) {
    console.error("Error getting chat session:", error);
    throw error;
  }
}

/**
 * Delete a chat session
 */
export async function deleteChatSession(
  userId: string,
  sessionId: string
): Promise<void> {
  try {
    const result = await ChatSession.deleteOne({
      _id: sessionId,
      userId,
    });

    if (result.deletedCount === 0) {
      throw new Error("Chat session not found or already deleted");
    }
  } catch (error) {
    console.error("Error deleting chat session:", error);
    throw error;
  }
}
