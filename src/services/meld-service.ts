import axios, { AxiosInstance } from "axios";
import { logger } from "../utils/logger";

/**
 *  Meld API Service for core endpoints
 */
class MeldService {
  private client: AxiosInstance;
  private apiKey: string;
  private baseURL: string;

  constructor() {
    this.apiKey = process.env.MELD_API_KEY || "";
    this.baseURL = process.env.MELD_API_URL || "https://api.meld.io";

    if (!this.apiKey) {
      throw new Error("MELD_API_KEY environment variable is required");
    }

    const authBase64 = btoa(this.apiKey);

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        accept: "*/*",
        "Meld-Version": "2025-03-04",
        Authorization: `BASIC ${authBase64}`,
        "Content-Type": "application/json",
      },
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info("Meld API Request", {
          method: config.method,
          url: config.url,
          headers: { ...config.headers, Authorization: "[REDACTED]" },
        });
        return config;
      },
      (error) => {
        logger.error("Meld API Request Error", error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info("Meld API Response", {
          status: response.status,
          url: response.config.url,
          dataLength: JSON.stringify(response.data).length,
        });
        return response;
      },
      (error) => {
        logger.error("Meld API Response Error", error, {
          status: error.response?.status,
          url: error.config?.url,
          message: error.response?.data?.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get payment methods
   * GET /service-providers/properties/payment-methods
   */
  async getPaymentMethods(): Promise<any> {
    try {
      const response = await this.client.get(
        `/service-providers/properties/payment-methods`
      );

      return response.data;
    } catch (error) {
      logger.error("Error getting payment methods", error as Error);
      throw error;
    }
  }

  /**
   * Get fiat currencies
   * GET /service-providers/properties/fiat-currencies
   */
  async getFiatCurrencies(options?: {
    statuses?: string[];
    accountFilter?: boolean;
    includeServiceProviderDetails?: boolean;
  }): Promise<any> {
    try {
      const params = new URLSearchParams();

      // Set default values
      const statuses = options?.statuses || ["LIVE", "RECENTLY_ADDED"];
      const accountFilter = options?.accountFilter ?? false;
      const includeServiceProviderDetails =
        options?.includeServiceProviderDetails ?? false;

      // Add query parameters
      params.append("statuses", statuses.join(","));
      params.append("accountFilter", accountFilter.toString());
      params.append(
        "includeServiceProviderDetails",
        includeServiceProviderDetails.toString()
      );

      const response = await this.client.get(
        `/service-providers/properties/fiat-currencies?${params.toString()}`
      );

      return response.data;
    } catch (error) {
      logger.error("Error getting fiat currencies", error as Error);
      throw error;
    }
  }

  /**
   * Get crypto quote
   * POST /payments/crypto/quote
   */
  async getCryptoQuote(quoteData: {
    sourceAmount?: number;
    sourceCurrencyCode?: string;
    destinationAmount?: number;
    destinationCurrencyCode?: string;
    paymentMethod?: string;
    countryCode?: string;
    walletAddress?: string;
  }): Promise<any> {
    const data = {
      sourceAmount: quoteData.sourceAmount || 100,
      sourceCurrencyCode: quoteData.sourceCurrencyCode || "USD",
      countryCode: quoteData.countryCode || "US",
      destinationCurrencyCode: quoteData.destinationCurrencyCode || "USD",
    };

    if (
      !data.countryCode ||
      !data.sourceAmount ||
      !data.sourceCurrencyCode ||
      !data.destinationCurrencyCode
    ) {
      throw new Error("Missing required fields for crypto quote");
    }
    try {
      const response = await this.client.post("/payments/crypto/quote", data);
      return response.data;
    } catch (error) {
      logger.error("Error getting crypto quote", error as Error, { quoteData });
      throw error;
    }
  }

  /**
   * Create widget session
   * POST /crypto/session/widget
   */
  async createWidgetSession(sessionRequest: {
    sessionData: {
      additionalParams?: Record<string, any>;
      serviceProvider?: string;
      countryCode?: string;
      walletAddress?: string;
      sourceAmount?: number;
      sourceCurrency?: string;
      destinationCurrency?: string;
      paymentMethodId?: string;
    };
    sessionType: "BUY" | "SELL";
    authenticationBypassDetails?: {
      category: string;
    };
  }): Promise<any> {
    try {
      const response = await this.client.post(
        "/crypto/session/widget",
        sessionRequest
      );
      return response.data;
    } catch (error) {
      logger.error("Error creating widget session", error as Error, {
        sessionRequest,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const meldService = new MeldService();
export default meldService;
