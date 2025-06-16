// src/handlers/meld.ts
import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User } from "../models";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";
import { meldService } from "../services/meld-service";
import { logger } from "../utils/logger";
import { AxiosError } from "axios";

/**
 * Get payment methods
 * GET /api/meld/payment-methods
 */
export const getPaymentMethods = async (
  event: AuthenticatedAPIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    await connectToDatabase();

    const queryParams = event.queryStringParameters || {};

    const paymentMethods = await meldService.getPaymentMethods();

    return success(paymentMethods);
  } catch (err) {
    logger.error("Get payment methods error", err as Error);
    return error("Could not retrieve payment methods", 500);
  }
};

/**
 * Get fiat currencies
 * GET /api/meld/fiat-currencies
 */
export const getFiatCurrencies = async (
  event: AuthenticatedAPIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    await connectToDatabase();

    const queryParams = event.queryStringParameters || {};

    // Parse query parameters
    const options = {
      statuses: queryParams.statuses
        ? queryParams.statuses.split(",")
        : undefined,
      accountFilter: queryParams.accountFilter
        ? queryParams.accountFilter === "true"
        : undefined,
      includeServiceProviderDetails: queryParams.includeServiceProviderDetails
        ? queryParams.includeServiceProviderDetails === "true"
        : undefined,
    };

    const fiatCurrencies = await meldService.getFiatCurrencies(options);

    return success(fiatCurrencies);
  } catch (err) {
    logger.error("Get fiat currencies error", err as Error);
    if (err instanceof AxiosError) {
      const statusCode = err.response?.status || 500;
      const errorMessage =
        err.response?.data?.message || "Could not retrieve fiat currencies";
      return error(errorMessage, statusCode);
    }
    return error("Could not retrieve fiat currencies", 500);
  }
};

/**
 * Get crypto quote
 * POST /api/meld/crypto-quote
 */
export const getCryptoQuote = async (
  event: AuthenticatedAPIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    await connectToDatabase();

    if (!event.body) {
      return error("Missing request body", 400);
    }

    const body = JSON.parse(event.body);
    const {
      sourceAmount,
      sourceCurrencyCode,
      destinationAmount,
      destinationCurrencyCode,
      paymentMethod,
      countryCode,
      walletAddress,
    } = body;

    // Basic validation - either source or destination amount should be provided
    if (!sourceAmount && !destinationAmount) {
      return error("Either sourceAmount or destinationAmount is required", 400);
    }

    if (!sourceCurrencyCode || !destinationCurrencyCode) {
      return error(
        "sourceCurrencyCode and destinationCurrencyCode are required",
        400
      );
    }

    const quote = await meldService.getCryptoQuote({
      sourceAmount,
      sourceCurrencyCode,
      destinationAmount,
      destinationCurrencyCode,
      paymentMethod,
      countryCode,
      walletAddress,
    });

    return success(quote);
  } catch (err) {
    logger.error("Get crypto quote error", err as Error);
    if (err instanceof AxiosError) {
      const statusCode = err.response?.status || 500;
      console.error("Error details:", statusCode);
      return error("Could not retrieve crypto quote", statusCode);
    }
    return error("Could not retrieve crypto quote", 500);
  }
};

/**
 * Create widget session
 * POST /api/meld/widget-session
 */
export const createWidgetSession = optionalAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    try {
      if (!event.body) {
        return error("Missing request body", 400);
      }

      const body = JSON.parse(event.body);
      const { sessionData, sessionType, authenticationBypassDetails } = body;

      // Basic validation
      if (!sessionType || !["BUY", "SELL"].includes(sessionType)) {
        return error("sessionType must be 'BUY' or 'SELL'", 400);
      }

      if (!sessionData) {
        return error("sessionData is required", 400);
      }

      // If user is authenticated, we can add their wallet address automatically
      if (event.user?.primaryWalletAddress && !sessionData.walletAddress) {
        sessionData.walletAddress = event.user.primaryWalletAddress;
      }

      const widgetSession = await meldService.createWidgetSession({
        sessionData,
        sessionType,
        authenticationBypassDetails,
      });

      return success(widgetSession);
    } catch (err) {
      logger.error("Create widget session error", err as Error);
      return error("Could not create widget session", 500);
    }
  }
);
