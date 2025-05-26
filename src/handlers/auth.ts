import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import jwt, { JwtPayload } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import axios from "axios";
import mongoose from "mongoose";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User } from "../models";
import { requireAuth } from "../middleware/auth";
import {
  AuthenticatedAPIGatewayProxyEvent,
  IUserData,
  IDynamicUser,
} from "../types";

// Initialize JWKS client for Dynamic
function getJwksClient() {
  const environmentId = process.env.DYNAMIC_ENVIRONMENT_ID;
  if (!environmentId) {
    throw new Error("DYNAMIC_ENVIRONMENT_ID is not defined");
  }

  const jwksUri = `https://app.dynamic.xyz/api/v0/sdk/${environmentId}/.well-known/jwks`;
  return jwksClient({
    jwksUri,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 86400000, // 1 day
    rateLimit: true,
  });
}

/**
 * Main authentication endpoint - Validates Dynamic token and issues app JWT
 * POST /api/auth/login
 */
export const login = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Connect to database
    await connectToDatabase();

    // Extract JWT from Authorization header
    const dynamicToken =
      event.headers.Authorization?.split(" ")[1] ||
      event.headers.authorization?.split(" ")[1];

    if (!dynamicToken) {
      return error("Authorization required", 401);
    }

    // Parse body for any additional user data
    let userData: IUserData = {};
    if (event.body) {
      try {
        userData = JSON.parse(event.body);
        console.log("Parsed user data:", userData.username);
      } catch (e) {
        console.warn("Could not parse request body as JSON", e);
      }
    }

    try {
      // Verify the Dynamic token
      const decodedToken = await verifyDynamicToken(dynamicToken);

      // Extract user info from token
      const { sub: dynamicUserId, email, name } = decodedToken;

      if (!dynamicUserId) {
        return error("Invalid token: missing user ID", 401);
      }

      let dynamicUser: IDynamicUser | undefined;

      // Find or create user in our database
      let user = await User.findOne({ dynamicUserId });

      // Get wallet address from Dynamic or user data
      const walletAddress =
        dynamicUser?.walletAddress || userData?.primaryWallet.address;

      // Determine chain (defaulting to "ethereum" if not provided)
      const chain =
        userData?.primaryWallet.chain || dynamicUser?.chain || "ethereum";

      if (!user) {
        // Create new user
        const username = (
          dynamicUser?.username ||
          userData?.username ||
          `user_${Date.now()}`
        ).toLowerCase();

        // Check if username is taken
        const usernameExists = await User.findOne({ username });
        const finalUsername = usernameExists
          ? `${username}_${Date.now().toString().substring(9)}`
          : username;

        // Ensure wallet address is available
        if (!walletAddress) {
          return error("Wallet address is required", 400);
        }

        user = new User({
          email: email || dynamicUser?.email || userData?.email,
          username: finalUsername,
          displayName:
            name ||
            dynamicUser?.displayName ||
            dynamicUser?.username ||
            userData?.displayName,
          avatar: dynamicUser?.avatar || userData?.avatar,
          dynamicUserId: dynamicUserId,
          primaryWalletAddress: walletAddress,
          chain: chain,
          socialProfiles:
            dynamicUser?.socialAccounts?.map((account: any) => ({
              platform: account.provider,
              profileId: account.id,
              username: account.username,
              lastUpdated: new Date(),
            })) || [],
          preferences: {
            defaultCurrency: userData?.preferences?.defaultCurrency || "USD",
            defaultLanguage: userData?.preferences?.defaultLanguage || "en",
            notificationsEnabled:
              userData?.preferences?.notificationsEnabled !== undefined
                ? userData.preferences.notificationsEnabled
                : true,
            twoFactorEnabled:
              userData?.preferences?.twoFactorEnabled !== undefined
                ? userData.preferences.twoFactorEnabled
                : false,
            preferredTimeZone:
              userData?.preferences?.preferredTimeZone || "UTC",
          },
        });

        await user.save();
      } else {
        // Update existing user with latest info if available
        if (dynamicUser || email || name || Object.keys(userData).length > 0) {
          user.email =
            email || dynamicUser?.email || userData?.email || user.email;
          user.displayName =
            name ||
            dynamicUser?.displayName ||
            dynamicUser?.username ||
            userData?.displayName ||
            user.displayName;
          user.avatar = dynamicUser?.avatar || userData?.avatar || user.avatar;

          await user.save();
        }
      }

      // Generate our application session token
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        throw new Error("JWT_SECRET is not defined");
      }

      const sessionToken = jwt.sign(
        {
          userId: user._id.toString(),
          dynamicId: user.dynamicUserId,
        },
        jwtSecret,
        { expiresIn: "7d" }
      );

      // Record the login
      await mongoose.connection.db.collection("userSessions").insertOne({
        userId: user._id,
        token: sessionToken,
        createdAt: new Date(),
        lastActivity: new Date(),
        dynamicToken: {
          issued: new Date(),
          expiresAt: new Date(
            Date.now() + (decodedToken.exp - decodedToken.iat) * 1000
          ),
        },
      });

      return success({
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          avatar: user.avatar,
          primaryWalletAddress: user.primaryWalletAddress,
          chain: user.chain,
          preferences: user.preferences,
        },
        token: sessionToken,
      });
    } catch (err) {
      console.error("Token verification error:", err);
      return error("Invalid or expired token", 401);
    }
  } catch (err) {
    console.error("Authentication error:", err);
    return error("Authentication failed", 500);
  }
};

/**
 * Verify Dynamic token using JWKS
 * @param token JWT token from Dynamic
 * @returns Decoded token payload if valid
 */
async function verifyDynamicToken(token: string): Promise<any> {
  try {
    // Get the JWT header
    const decoded = jwt.decode(token, { complete: true });
    if (
      !decoded ||
      typeof decoded === "string" ||
      !decoded.header ||
      !decoded.header.kid
    ) {
      throw new Error("Invalid token structure");
    }

    try {
      // Get the signing key from Dynamic's JWKS
      const client = getJwksClient();
      const key = await client.getSigningKey(decoded.header.kid);

      if (!key) {
        throw new Error("Unable to get signing key from JWKS");
      }

      const publicKey = key.getPublicKey();

      if (!publicKey) {
        throw new Error("Unable to get public key");
      }

      // Verify the token
      const verifiedToken: JwtPayload = jwt.verify(token, publicKey, {
        ignoreExpiration: false,
      }) as JwtPayload;
      console.log("verified token:", verifiedToken);
      return verifiedToken;
    } catch (jwksErr) {
      console.error("JWKS key retrieval error:", jwksErr);
      throw new Error("Failed to retrieve signing key");
    }
  } catch (err) {
    console.error("Token verification error:", err);
    throw new Error("Token verification failed");
  }
}

/**
 * Get Dynamic authentication configuration
 * GET /api/auth/config
 */
export const getConfig = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Simple check for API availability
    const environmentId = process.env.DYNAMIC_ENVIRONMENT_ID;
    const redirectUrl = process.env.AUTH_REDIRECT_URL;

    if (!environmentId) {
      throw new Error("DYNAMIC_ENVIRONMENT_ID is not defined");
    }

    if (!redirectUrl) {
      throw new Error("AUTH_REDIRECT_URL is not defined");
    }

    // Return Dynamic configuration data to the frontend
    return success({
      environmentId,
      redirectUrl,
      // Any other configuration the frontend might need
    });
  } catch (err) {
    console.error("Login configuration error:", err);
    return error("Failed to get login configuration", 500);
  }
};

/**
 * Verify token validity
 * GET /api/auth/verify
 */
export const verifyToken = async (
  event: APIGatewayProxyEvent
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
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error("JWT_SECRET is not defined");
      }

      const decoded = jwt.verify(token, secret);
      return success({ valid: true, decoded });
    } catch (err) {
      return success({ valid: false, message: "Invalid or expired token" });
    }
  } catch (err) {
    console.error("Token verification error:", err);
    return error("Token verification failed", 500);
  }
};

/**
 * Logout handler implementation
 * Extracted for easier testing
 */
export const logoutHandler = async (
  event: AuthenticatedAPIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // User is provided by the auth middleware
    const userId = event.user?.id;

    if (!userId) {
      return error("User ID not found in token", 401);
    }

    // Extract token from Authorization header
    const token =
      event.headers.Authorization?.split(" ")[1] ||
      event.headers.authorization?.split(" ")[1];

    if (!token) {
      return error("Authorization token not found", 401);
    }

    // Invalidate the token by updating its status in the database
    await mongoose.connection.db.collection("userSessions").updateOne(
      { userId: new mongoose.Types.ObjectId(userId), token },
      {
        $set: {
          invalidated: true,
          loggedOutAt: new Date(),
        },
      }
    );

    return success({
      message: "Logged out successfully",
    });
  } catch (err) {
    console.error("Logout error:", err);
    return error("Logout failed", 500);
  }
};

/**
 * Logout user
 * POST /api/auth/logout
 */
export const logout = requireAuth(logoutHandler);
