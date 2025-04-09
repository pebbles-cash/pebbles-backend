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
          username: user.username,
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
import { APIGatewayProxyResult } from "aws-lambda";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User, Wallet } from "../models";
import { requireAuth } from "../middleware/auth";
import {
  AuthenticatedAPIGatewayProxyEvent,
  UpdateUserRequestBody,
  SocialStatsRequestBody,
} from "../types";

/**
 * Get current user profile
 * GET /api/users/me
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

      // Get wallet information
      const wallets = await Wallet.find({ userId: user._id });

      // Format response
      const userProfile = {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        walletAddresses: wallets.map((w) => w.address),
        socialProfiles: user.socialProfiles,
        preferences: user.preferences,
        createdAt: user.createdAt,
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
      const { username, displayName, bio } = body;

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

      // Update fields
      const updateData: Partial<UpdateUserRequestBody> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (username) updateData.username = username;
      if (displayName) updateData.displayName = displayName;
      if (bio) updateData.bio = bio;

      // Update user in database
      await User.findByIdAndUpdate(userId, { $set: updateData });

      // Get updated user
      const updatedUser = await User.findById(userId);

      if (!updatedUser) {
        return error("User not found after update", 404);
      }

      return success({
        id: updatedUser._id,
        username: updatedUser.username,
        displayName: updatedUser.displayName,
        bio: bio,
        email: updatedUser.email,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (err) {
      console.error("Update user error:", err);
      return error("Could not update user profile", 500);
    }
  }
);
