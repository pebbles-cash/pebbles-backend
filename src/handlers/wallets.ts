import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User, Wallet } from "../models";
import { requireAuth } from "../middleware/auth";
import {
  AuthenticatedAPIGatewayProxyEvent,
  CreateWalletRequestBody,
} from "../types";

/**
 * Get user's wallets
 * GET /api/wallets
 */
export const getUserWallets = requireAuth(
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

      // Get user's wallets
      const wallets = await Wallet.find({ userId });

      return success({
        wallets: wallets.map((wallet) => ({
          id: wallet._id,
          address: wallet.address,
          type: wallet.type,
          chain: wallet.chain,
          isDefault: wallet.isDefault,
          createdAt: wallet.createdAt,
        })),
      });
    } catch (err) {
      console.error("Get user wallets error:", err);
      return error("Could not retrieve wallets", 500);
    }
  }
);

/**
 * Get specific wallet details
 * GET /api/wallets/:walletId
 */
export const getWalletDetails = requireAuth(
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

      // Get wallet ID from path parameters
      if (!event.pathParameters?.walletId) {
        return error("Wallet ID parameter is required", 400);
      }

      const walletId = event.pathParameters.walletId;

      // Get the wallet
      const wallet = await Wallet.findOne({
        _id: walletId,
        userId,
      });

      if (!wallet) {
        return error("Wallet not found", 404);
      }

      // Format balance data for response
      const balances: Array<{
        tokenAddress: string;
        amount: string;
        lastUpdated: Date;
      }> = [];

      if (wallet.balance) {
        wallet.balance.forEach((value, key) => {
          balances.push({
            tokenAddress: key,
            amount: value.amount,
            lastUpdated: value.lastUpdated,
          });
        });
      }

      return success({
        id: wallet._id,
        address: wallet.address,
        type: wallet.type,
        chain: wallet.chain,
        isDefault: wallet.isDefault,
        balances,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      });
    } catch (err) {
      console.error("Get wallet details error:", err);
      return error("Could not retrieve wallet details", 500);
    }
  }
);

/**
 * Get wallet balance
 * GET /api/wallets/:walletId/balance
 */
export const getWalletBalance = requireAuth(
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

      // Get wallet ID from path parameters
      if (!event.pathParameters?.walletId) {
        return error("Wallet ID parameter is required", 400);
      }

      const walletId = event.pathParameters.walletId;

      // Get the wallet
      const wallet = await Wallet.findOne({
        _id: walletId,
        userId,
      });

      if (!wallet) {
        return error("Wallet not found", 404);
      }

      try {
        // TODO: call blockchain provider API to get the latest balance e.g. Alchemy, Infura, etc.
        // const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
        // const balance = await provider.getBalance(wallet.address);

        // Mock result for example
        const balance = "1000000000000000000"; // 1 ETH in wei
        const tokenAddress = "0x0"; // Native token

        // Update the wallet balance in the database
        if (!wallet.balance) {
          wallet.balance = new Map();
        }

        wallet.balance.set(tokenAddress, {
          amount: balance,
          lastUpdated: new Date(),
        });

        await wallet.save();

        // Format balance data for response
        const balances: Array<{
          tokenAddress: string;
          amount: string;
          lastUpdated: Date;
        }> = [];

        wallet.balance.forEach((value, key) => {
          balances.push({
            tokenAddress: key,
            amount: value.amount,
            lastUpdated: value.lastUpdated,
          });
        });

        return success({
          address: wallet.address,
          chain: wallet.chain,
          balances,
        });
      } catch (chainErr) {
        console.error("Error fetching chain balance:", chainErr);

        // Return the last known balance if available
        if (wallet.balance && wallet.balance.size > 0) {
          const balances: Array<{
            tokenAddress: string;
            amount: string;
            lastUpdated: Date;
          }> = [];

          wallet.balance.forEach((value, key) => {
            balances.push({
              tokenAddress: key,
              amount: value.amount,
              lastUpdated: value.lastUpdated,
            });
          });

          return success({
            address: wallet.address,
            chain: wallet.chain,
            balances,
            warning: "Using cached balance - could not fetch latest from chain",
          });
        } else {
          return error("Could not fetch wallet balance", 500);
        }
      }
    } catch (err) {
      console.error("Get wallet balance error:", err);
      return error("Could not retrieve wallet balance", 500);
    }
  }
);

/**
 * Create a new wallet
 * POST /api/wallets/create
 */

// TODO: check Dynamic return data for wallet creation and format accordingly (may be redundant if only User model needs to be added)
export const createWallet = requireAuth(
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

      const body: CreateWalletRequestBody = JSON.parse(event.body);
      const { chain, type = "eip7702" } = body;

      // Validate chain
      if (
        !chain ||
        !["ethereum", "polygon", "arbitrum", "optimism", "base"].includes(chain)
      ) {
        return error("Valid chain is required", 400);
      }

      // Get user
      const user = await User.findById(userId);

      if (!user) {
        return error("User not found", 404);
      }

      // Check if this is the first wallet (will be set as default)
      const existingWallets = await Wallet.countDocuments({ userId });
      const isDefault = existingWallets === 0;

      try {
        // Example if calling Dynamic API to create a new wallet
        // const walletResponse = await axios.post(
        //   `${process.env.DYNAMIC_API_URL}/wallets/create`,
        //   {
        //     apiKey: process.env.DYNAMIC_API_KEY,
        //     userId: user.dynamicUserId,
        //     chain,
        //     type
        //   }
        // );

        // Mock wallet creation
        const walletAddress = `0x${Math.random().toString(16).substring(2, 42)}`;

        // Create the wallet in our database
        const wallet = new Wallet({
          userId,
          address: walletAddress,
          type,
          chain,
          isDefault,
        });

        await wallet.save();

        // If this is the default wallet, update the user's primary wallet address
        if (isDefault) {
          user.walletAddress = walletAddress;
          await user.save();
        }

        return success({
          id: wallet._id,
          address: wallet.address,
          type: wallet.type,
          chain: wallet.chain,
          isDefault: wallet.isDefault,
          createdAt: wallet.createdAt,
        });
      } catch (providerErr) {
        console.error("Wallet provider error:", providerErr);
        return error("Could not create wallet with provider", 503);
      }
    } catch (err) {
      console.error("Create wallet error:", err);
      return error("Could not create wallet", 500);
    }
  }
);
