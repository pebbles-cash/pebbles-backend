import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import jwt, { JwtPayload } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import mongoose from "mongoose";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User } from "../models";
import { requireAuth } from "../middleware/auth";
import {
  AuthenticatedAPIGatewayProxyEvent,
  IUserData,
  ICachedJWKSKey,
  ICachedUser,
} from "../types";

const jwksCache = new Map<string, ICachedJWKSKey>();
const userCache = new Map<string, ICachedUser>();

// Cache TTL settings
const JWKS_CACHE_TTL = 3600000; // 1 hour
const USER_CACHE_TTL = 300000; // 5 minutes

// Initialize JWKS client for Dynamic
function getJwksClient() {
  const environmentId = process.env.DYNAMIC_ENVIRONMENT_ID;
  if (!environmentId) {
    throw new Error("DYNAMIC_ENVIRONMENT_ID is not defined");
  }

  const jwksUri = `https://app.dynamic.xyz/api/v0/sdk/${environmentId}/.well-known/jwks`;
  return jwksClient({
    jwksUri,
    cache: false,
    cacheMaxEntries: 0,
    cacheMaxAge: 86400000, // 1 day
    rateLimit: false,
  });
}

/**
 * Get signing key with caching
 */
async function getCachedSigningKey(kid: string): Promise<any> {
  const cacheKey = `jwks_${kid}`;
  const cached = jwksCache.get(cacheKey);

  // Check if we have a valid cached key
  if (cached && cached.expiry > Date.now()) {
    console.log(`🎯 JWKS cache hit for kid: ${kid}`);
    return cached.key;
  }

  console.log(`🔄 JWKS cache miss for kid: ${kid}, fetching...`);

  try {
    // Fetch fresh key from Dynamic
    const client = getJwksClient();
    const key = await client.getSigningKey(kid);

    if (!key) {
      throw new Error("Unable to get signing key from JWKS");
    }

    // Cache the key
    jwksCache.set(cacheKey, {
      key,
      expiry: Date.now() + JWKS_CACHE_TTL,
    });

    console.log(`✅ JWKS key cached for kid: ${kid}`);
    return key;
  } catch (jwksErr) {
    console.error("JWKS key retrieval error:", jwksErr);

    // If we have an expired cache entry, use it as fallback
    if (cached) {
      console.log(`⚠️ Using expired JWKS cache for kid: ${kid}`);
      return cached.key;
    }

    throw new Error("Failed to retrieve signing key");
  }
}

/**
 * Get user with caching
 */
async function getCachedUser(dynamicUserId: string): Promise<any> {
  const cached = userCache.get(dynamicUserId);

  // Check if we have a valid cached user
  if (cached && cached.expiry > Date.now()) {
    console.log(`🎯 User cache hit for: ${dynamicUserId}`);
    return cached.user;
  }

  console.log(`🔄 User cache miss for: ${dynamicUserId}, fetching...`);

  // Fetch fresh user from database
  const user = await User.findOne({ dynamicUserId });

  // Cache the user (even if null)
  if (user) {
    userCache.set(dynamicUserId, {
      user,
      expiry: Date.now() + USER_CACHE_TTL,
    });
    console.log(`✅ User cached: ${dynamicUserId}`);
  }

  return user;
}

/**
 * Verify Dynamic token using cached JWKS
 */
async function verifyDynamicTokenCached(token: string): Promise<any> {
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

    // Get the signing key from cache
    const key = await getCachedSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    if (!publicKey) {
      throw new Error("Unable to get public key");
    }

    // Verify the token
    const verifiedToken: JwtPayload = jwt.verify(token, publicKey, {
      ignoreExpiration: false,
    }) as JwtPayload;

    console.log("✅ Token verified successfully");
    return verifiedToken;
  } catch (err) {
    console.error("Token verification error:", err);
    throw new Error("Token verification failed");
  }
}

/**
 * Create new user (extracted for cleaner code)
 */
async function createNewUser(
  userData: IUserData,
  decodedToken: any
): Promise<any> {
  const {
    sub: dynamicUserId,
    email,
    name,
    verified_credentials: verifiedCredentials,
  } = decodedToken;

  let username: string | null = null;

  // Handle username logic
  if ("username" in userData && userData.username !== undefined) {
    username = userData.username;
  }

  // Check if username is taken
  if (username !== null) {
    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      throw new Error("Username is already taken");
    }
  }

  // Ensure wallet address is available
  const walletAddress = userData?.primaryWalletAddress;
  if (!walletAddress) {
    throw new Error("Wallet address is required");
  }

  // Determine chain
  const chain = userData?.chain || "EVM";

  // Create new user
  const user = new User({
    email: email || userData?.email,
    username: username,
    displayName: name || userData?.displayName,
    avatar: userData?.avatar,
    dynamicUserId: dynamicUserId,
    primaryWalletAddress: walletAddress,
    walletName: verifiedCredentials[0].wallet_name,
    walletProvider: verifiedCredentials[0].wallet_provider,
    chain: chain,
    socialProfiles: [],
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
      preferredTimeZone: userData?.preferences?.preferredTimeZone || "UTC",
    },
  });

  await user.save();

  // Cache the new user
  userCache.set(dynamicUserId, {
    user,
    expiry: Date.now() + USER_CACHE_TTL,
  });

  return user;
}

/**
 * 🚀 OPTIMIZED LOGIN HANDLER WITH CACHING
 */
export const login = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const startTime = Date.now();

  try {
    // 1. Extract JWT from Authorization header (early validation)
    const dynamicToken =
      event.headers.Authorization?.split(" ")[1] ||
      event.headers.authorization?.split(" ")[1];

    if (!dynamicToken) {
      return error("Authorization required", 401);
    }

    // 2. Parse body for any additional user data (early parsing)
    let userData: IUserData = {};
    if (event.body) {
      try {
        userData = JSON.parse(event.body);
        console.log("Parsed user data:", userData.username);
      } catch (e) {
        console.warn("Could not parse request body as JSON", e);
        return error("Invalid JSON in request body", 400);
      }
    }

    // 3. Verify the Dynamic token (WITH CACHING!)
    const tokenStartTime = Date.now();
    const decodedToken = await verifyDynamicTokenCached(dynamicToken);
    console.log(`🕐 Token verification took: ${Date.now() - tokenStartTime}ms`);

    // Extract user info from token
    const {
      sub: dynamicUserId,
      email,
      name,
      verified_credentials: verifiedCredentials,
    } = decodedToken;

    if (!dynamicUserId) {
      return error("Invalid token: missing user ID", 401);
    }

    // 4. Connect to database (only after token verification passes)
    const dbStartTime = Date.now();
    await connectToDatabase();
    console.log(`🕐 DB connection took: ${Date.now() - dbStartTime}ms`);

    // 5. Find or create user (WITH CACHING!)
    const userStartTime = Date.now();
    let user = await getCachedUser(dynamicUserId);
    console.log(`🕐 User lookup took: ${Date.now() - userStartTime}ms`);

    // Get wallet address from user data
    const walletAddress = userData?.primaryWalletAddress;
    const chain = userData?.chain || "EVM";

    if (!user) {
      // Create new user
      console.log("🆕 Creating new user");
      user = await createNewUser(userData, decodedToken);
    } else {
      // Update existing user with latest info if available (lightweight update)
      if (email || name || Object.keys(userData).length > 0) {
        const shouldUpdate =
          (email && email !== user.email) ||
          (name && name !== user.displayName) ||
          (userData?.avatar && userData.avatar !== user.avatar);

        if (shouldUpdate) {
          user.email = email || userData?.email || user.email;
          user.displayName = name || userData?.displayName || user.displayName;
          user.avatar = userData?.avatar || user.avatar;

          // Non-blocking save (don't wait for it)
          user
            .save()
            .catch((err: Error) =>
              console.log("Non-critical user update failed:", err.message)
            );

          // Update cache
          userCache.set(dynamicUserId, {
            user,
            expiry: Date.now() + USER_CACHE_TTL,
          });
        }
      }
    }

    // 6. Generate our application session token
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

    // 7. Log performance metrics
    const totalTime = Date.now() - startTime;
    console.log(`🎯 Total auth time: ${totalTime}ms`);

    // 8. Return response (no session DB operations for faster response)
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
    console.error("Authentication error:", err);
    return error("Authentication failed", 500);
  }
};

/**
 * Cache management utilities
 */
export const clearJWKSCache = (): void => {
  jwksCache.clear();
  console.log("🧹 JWKS cache cleared");
};

export const clearUserCache = (): void => {
  userCache.clear();
  console.log("🧹 User cache cleared");
};

export const getCacheStats = () => {
  return {
    jwksCache: {
      size: jwksCache.size,
      entries: Array.from(jwksCache.keys()),
    },
    userCache: {
      size: userCache.size,
      entries: Array.from(userCache.keys()),
    },
  };
};

// Clean up expired entries periodically (optional optimization)
setInterval(() => {
  const now = Date.now();

  // Clean JWKS cache
  for (const [key, value] of jwksCache.entries()) {
    if (value.expiry < now) {
      jwksCache.delete(key);
    }
  }

  // Clean user cache
  for (const [key, value] of userCache.entries()) {
    if (value.expiry < now) {
      userCache.delete(key);
    }
  }
}, 600000); // Clean every 10 minutes

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
