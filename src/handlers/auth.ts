import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import jwt from "jsonwebtoken";
import axios from "axios";
import mongoose from "mongoose";
import { connectToDatabase } from "../services/mongoose";
import { success, error } from "../utils/response";
import { User } from "../models";
import {
  LoginRequestBody,
  CallbackRequestBody,
  ISocialProfile,
} from "../types";

/**
 * Initiate Dynamic login flow
 * POST /api/auth/login
 */
export const login = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Connect to database
    await connectToDatabase();

    if (!event.body) {
      return error("Missing request body", 400);
    }

    const body: LoginRequestBody = JSON.parse(event.body);
    const { loginMethod, redirectUrl } = body;

    if (!loginMethod) {
      return error("Login method is required", 400);
    }

    // Verify JWT secret exists
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined");
    }

    // Generate a state token to verify callback
    const stateToken = jwt.sign({ timestamp: Date.now() }, jwtSecret, {
      expiresIn: "15m",
    });

    // Verify API URL and key exist
    const dynamicApiUrl = process.env.DYNAMIC_API_URL;
    const dynamicApiKey = process.env.DYNAMIC_API_KEY;
    const authRedirectUrl = process.env.AUTH_REDIRECT_URL;

    if (!dynamicApiUrl || !dynamicApiKey) {
      throw new Error("Dynamic API configuration is missing");
    }

    // Call Dynamic API to start login flow
    const dynamicResponse = await axios.post(`${dynamicApiUrl}/auth/login`, {
      apiKey: dynamicApiKey,
      loginMethod,
      redirectUrl: redirectUrl || authRedirectUrl,
      state: stateToken,
    });

    // Store login attempt in database
    await mongoose.connection.db.collection("authAttempts").insertOne({
      stateToken,
      createdAt: new Date(),
      status: "initiated",
    });

    return success({
      authUrl: dynamicResponse.data.authUrl,
      stateToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    return error("Authentication service unavailable", 503);
  }
};

/**
 * Handle Dynamic authentication callback
 * POST /api/auth/callback
 */
export const callback = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Connect to database
    await connectToDatabase();

    if (!event.body) {
      return error("Missing request body", 400);
    }

    const body: CallbackRequestBody = JSON.parse(event.body);
    const { code, state } = body;

    if (!code || !state) {
      return error("Invalid callback parameters", 400);
    }

    // Verify JWT secret exists
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET is not defined");
    }

    // Verify state token
    try {
      jwt.verify(state, jwtSecret);
    } catch (err) {
      return error("Invalid or expired state token", 401);
    }

    // Check if this auth attempt exists
    const authAttempt = await mongoose.connection.db
      .collection("authAttempts")
      .findOne({ stateToken: state });

    if (!authAttempt) {
      return error("Unknown authentication attempt", 400);
    }

    // Verify API URL and key exist
    const dynamicApiUrl = process.env.DYNAMIC_API_URL;
    const dynamicApiKey = process.env.DYNAMIC_API_KEY;

    if (!dynamicApiUrl || !dynamicApiKey) {
      throw new Error("Dynamic API configuration is missing");
    }

    // Exchange code for tokens with Dynamic
    const tokenResponse = await axios.post(`${dynamicApiUrl}/auth/token`, {
      apiKey: dynamicApiKey,
      code,
      grantType: "authorization_code",
    });

    const { accessToken, refreshToken, idToken, expiresIn } =
      tokenResponse.data;

    // Get user information from Dynamic
    const userResponse = await axios.get(`${dynamicApiUrl}/users/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const dynamicUser = userResponse.data;

    // Map social accounts from Dynamic to our format
    const socialProfiles: ISocialProfile[] =
      dynamicUser.socialAccounts?.map((account: any) => ({
        platform: account.provider,
        profileId: account.id,
        username: account.username,
        lastUpdated: new Date(),
      })) || [];

    // Find or create user in our database
    let user = await User.findOne({ dynamicUserId: dynamicUser.id });

    if (!user) {
      // Create new user
      user = new User({
        email: dynamicUser.email,
        username: dynamicUser.username || `user_${Date.now()}`,
        displayName: dynamicUser.displayName || dynamicUser.username,
        avatar: dynamicUser.avatar,
        dynamicUserId: dynamicUser.id,
        walletAddress: dynamicUser.walletAddress,
        socialProfiles,
      });

      await user.save();
    } else {
      // Update existing user with latest info
      user.email = dynamicUser.email || user.email;
      user.displayName = dynamicUser.displayName || user.displayName;
      user.avatar = dynamicUser.avatar || user.avatar;
      user.walletAddress = dynamicUser.walletAddress || user.walletAddress;

      if (socialProfiles.length > 0) {
        user.socialProfiles = socialProfiles;
      }

      await user.save();
    }

    // Update auth attempt
    await mongoose.connection.db.collection("authAttempts").updateOne(
      { stateToken: state },
      {
        $set: {
          status: "completed",
          userId: user._id,
          completedAt: new Date(),
        },
      }
    );

    // Generate our own session token
    const sessionToken = jwt.sign(
      {
        userId: user._id.toString(),
        dynamicId: user.dynamicUserId,
      },
      jwtSecret,
      { expiresIn: "7d" }
    );

    return success({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        walletAddress: user.walletAddress,
      },
      token: sessionToken,
      dynamicTokens: {
        accessToken,
        refreshToken,
        idToken,
        expiresIn,
      },
    });
  } catch (err) {
    console.error("Auth callback error:", err);
    return error("Authentication failed", 500);
  }
};
