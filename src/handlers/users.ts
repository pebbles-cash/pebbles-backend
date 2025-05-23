import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User } from "../models";
import { requireAuth } from "../middleware/auth";
import {
  AuthenticatedAPIGatewayProxyEvent,
  CreateUserRequestBody,
  UpdateUserRequestBody,
  SocialStatsRequestBody,
} from "../types";

/**
 * Create new user profile
 * GET /api/users/new
 */
export const createUser = async (
  event: AuthenticatedAPIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    await connectToDatabase(); // Make sure to connect to DB

    const body: CreateUserRequestBody = JSON.parse(event.body || "{}");

    const {
      userId: dynamicUserId,
      email,
      username,
      verifiedCredentials,
      primaryWallet,
    } = body;

    // Validate required fields
    if (!dynamicUserId || !email || !verifiedCredentials || !primaryWallet) {
      return error("Missing required fields", 400);
    }

    // Validate username
    if (username !== null && (username.length < 3 || username.length > 15)) {
      return error("Username must be between 3-15 characters", 400);
    }

    // Check for existing user
    const queryConditions = [
      { email },
      { dynamicUserId },
      { primaryWalletAddress: primaryWallet.address },
    ];

    const existingUser = await User.findOne({
      $or: queryConditions,
    });

    if (existingUser) {
      return error(
        "User with this email, username, wallet address or Dynamic ID already exists",
        409
      );
    }

    // Create new user with all required fields from schema
    const user = new User({
      email,
      username: username || null,
      dynamicUserId,
      primaryWalletAddress: primaryWallet.address,
      chain: primaryWallet.chain.toLowerCase(),
      displayName: username,
      avatar: null,
      socialProfiles: [],
      preferences: {
        defaultCurrency: "USD",
        defaultLanguage: "en",
        notificationsEnabled: true,
        twoFactorEnabled: false,
        preferredTimeZone: "UTC",
      },
    });

    await user.save();

    return success(
      {
        _id: user._id,
        email: user.email,
        username: user.username,
        dynamicUserId: user.dynamicUserId,
        primaryWalletAddress: user.primaryWalletAddress,
        chain: user.chain,
        displayName: user.displayName,
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      201
    );
  } catch (err) {
    console.error("Error creating user:", err);
    return error(
      "Error creating user: " +
        (err instanceof Error ? err.message : "Unknown error"),
      500
    );
  }
};

/**
 * Get user profile by username
 * GET /api/users/:username
 */
export const getUserByUsername = async (
  event: AuthenticatedAPIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Connect to database
    await connectToDatabase();

    if (!event.pathParameters?.username) {
      return error("Username parameter is required", 400);
    }

    const username = event.pathParameters.username;

    // Get user from database
    const user = await User.findOne({ username });

    if (!user) {
      return error("User not found", 404);
    }

    // Format response (exclude sensitive info)
    const userProfile = {
      id: user._id,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: (user as any).bio, // Add bio if it exists
      createdAt: user.createdAt,
    };

    return success(userProfile);
  } catch (err) {
    console.error("Get user by username error:", err);
    return error("Could not retrieve user profile", 500);
  }
};

/**
 * Update user social media statistics
 * POST /api/users/social-stats
 */
export const updateSocialStats = requireAuth(
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

      const body: SocialStatsRequestBody = JSON.parse(event.body);
      const { platform, followers, engagement, rank } = body;

      // Basic validation
      if (!platform) {
        return error("Platform name is required", 400);
      }

      // Get user
      const user = await User.findById(userId);

      if (!user) {
        return error("User not found", 404);
      }

      // Find if this platform already exists in the user's social profiles
      const existingProfileIndex = user.socialProfiles.findIndex(
        (profile) => profile.platform === platform
      );

      if (existingProfileIndex !== -1) {
        // Update existing profile
        if (followers !== undefined) {
          user.socialProfiles[existingProfileIndex].followerCount = followers;
        }

        if (engagement !== undefined) {
          (user.socialProfiles[existingProfileIndex] as any).engagement =
            engagement;
        }

        if (rank !== undefined) {
          (user.socialProfiles[existingProfileIndex] as any).rank = rank;
        }

        user.socialProfiles[existingProfileIndex].lastUpdated = new Date();
      } else {
        // Create new social profile
        user.socialProfiles.push({
          platform,
          profileId: `manual-${platform}-${Date.now()}`,
          username: user.username || "",
          followerCount: followers || 0,
          lastUpdated: new Date(),
        });
      }

      await user.save();

      return success({
        username: user.username,
        socialProfiles: user.socialProfiles,
      });
    } catch (err) {
      console.error("Update social stats error:", err);
      return error("Could not update social statistics", 500);
    }
  }
);

/**
 * Get current user profile
 * GET /api/users/update
 */
export const getCurrentUser = requireAuth(
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

      // Get user from database
      const user = await User.findById(userId);

      if (!user) {
        return error("User not found", 404);
      }

      // Format response to match schema fields
      const userProfile = {
        _id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        primaryWalletAddress: user.primaryWalletAddress, // Correct field name
        chain: user.chain, // Include chain
        socialProfiles: user.socialProfiles,
        preferences: user.preferences,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      return success(userProfile);
    } catch (err) {
      console.error("Get current user error:", err);
      return error("Could not retrieve user profile", 500);
    }
  }
);

/**
 * Update user profile
 * PUT /api/users/me
 */
export const updateCurrentUser = requireAuth(
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

      const body: UpdateUserRequestBody = JSON.parse(event.body);
      const {
        username,
        displayName,
        avatar,
        primaryWallet, // New field for wallet updates
        preferences, // User preferences
      } = body;

      // Basic validation
      if (username && (username.length < 3 || username.length > 15)) {
        return error("Username must be between 3 and 15 characters", 400);
      }

      // Check if username is taken (if changing)
      if (username) {
        const existingUser = await User.findOne({
          username,
          _id: { $ne: userId },
        });

        if (existingUser) {
          return error("Username is already taken", 409);
        }
      }

      // Check if new wallet address is already used
      if (primaryWallet && primaryWallet.address) {
        const existingWallet = await User.findOne({
          primaryWalletAddress: primaryWallet.address,
          _id: { $ne: userId },
        });

        if (existingWallet) {
          return error(
            "Wallet address is already associated with another account",
            409
          );
        }
      }

      // Update fields
      const updateData: Record<string, any> = {
        updatedAt: new Date(),
      };

      if (username) updateData.username = username;
      if (displayName) updateData.displayName = displayName;
      if (avatar) updateData.avatar = avatar;

      // Update wallet if provided
      if (primaryWallet && primaryWallet.address) {
        updateData.primaryWalletAddress = primaryWallet.address;
        if (primaryWallet.chain) {
          updateData.chain = primaryWallet.chain.toLowerCase();
        }
      }

      // Update specific preferences if provided
      if (preferences) {
        for (const [key, value] of Object.entries(preferences)) {
          if (
            [
              "defaultCurrency",
              "defaultLanguage",
              "notificationsEnabled",
              "twoFactorEnabled",
              "preferredTimeZone",
            ].includes(key)
          ) {
            updateData[`preferences.${key}`] = value;
          }
        }
      }

      // Update user in database
      await User.findByIdAndUpdate(userId, { $set: updateData });

      // Get updated user
      const updatedUser = await User.findById(userId);

      if (!updatedUser) {
        return error("User not found after update", 404);
      }

      return success({
        _id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        avatar: updatedUser.avatar,
        primaryWalletAddress: updatedUser.primaryWalletAddress,
        chain: updatedUser.chain,
        preferences: updatedUser.preferences,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (err) {
      console.error("Update user error:", err);
      return error("Could not update user profile", 500);
    }
  }
);
