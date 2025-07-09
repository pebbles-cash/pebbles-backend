import { APIGatewayProxyResult, Context } from "aws-lambda";
import { requireAuth } from "../middleware/auth";
import { TipConfig, Transaction, User } from "../models";
import { AuthenticatedAPIGatewayProxyEvent } from "../types";
import { connectToDatabase } from "../services/mongoose";
import { error, success } from "../utils/response";

// POST /tips/configure
export const configureTipPage = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    await connectToDatabase();
    const userId = event.user?.id;
    if (!userId) return error("Unauthorized", 401);

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return error("Invalid JSON body", 400);
    }

    const { statement, exclusiveContent, giftOptions } = body;
    if (!Array.isArray(giftOptions) || giftOptions.length < 1) {
      return error("At least one gift option is required", 400);
    }

    // Validate gift options structure
    for (const gift of giftOptions) {
      if (!gift.image || typeof gift.price !== "number" || !gift.currency) {
        return error(
          "Each gift option must have image, price, and currency",
          400
        );
      }
    }

    // Upsert tip config
    const config = await TipConfig.findOneAndUpdate(
      { userId },
      {
        statement: statement || "",
        exclusiveContent: {
          enabled: !!exclusiveContent?.enabled,
          message: exclusiveContent?.message || "",
        },
        giftOptions,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return success({ config });
  }
);

// PUT /tips/configure
export const updateTipPage = requireAuth(
  async (
    event: AuthenticatedAPIGatewayProxyEvent
  ): Promise<APIGatewayProxyResult> => {
    await connectToDatabase();
    const userId = event.user?.id;
    if (!userId) return error("Unauthorized", 401);

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return error("Invalid JSON body", 400);
    }

    const { statement, exclusiveContent, giftOptions } = body;

    // Check if at least one field is provided for update
    if (!statement && !exclusiveContent && !giftOptions) {
      return error("At least one field must be provided for update", 400);
    }

    // Validate gift options if provided
    if (giftOptions) {
      if (!Array.isArray(giftOptions) || giftOptions.length < 1) {
        return error("At least one gift option is required", 400);
      }

      for (const gift of giftOptions) {
        if (!gift.image || typeof gift.price !== "number" || !gift.currency) {
          return error(
            "Each gift option must have image, price, and currency",
            400
          );
        }
      }
    }

    // Build update object with only provided fields
    const updateData: any = {};

    if (statement !== undefined) {
      updateData.statement = statement;
    }

    if (exclusiveContent !== undefined) {
      updateData.exclusiveContent = {
        enabled: !!exclusiveContent.enabled,
        message: exclusiveContent.message || "",
      };
    }

    if (giftOptions !== undefined) {
      updateData.giftOptions = giftOptions;
    }

    // Update tip config
    const config = await TipConfig.findOneAndUpdate({ userId }, updateData, {
      new: true,
      runValidators: true,
    });

    if (!config) {
      return error("Tip configuration not found", 404);
    }

    return success({ config });
  }
);

// GET /tips/:username
export const getTipPage = async (
  event: any
): Promise<APIGatewayProxyResult> => {
  await connectToDatabase();
  const username = event.pathParameters?.username;
  if (!username) return error("Username required", 400);

  const user = await User.findOne({ username });
  if (!user) return error("User not found", 404);

  const config = await TipConfig.findOne({ userId: user._id });
  if (!config) return error("Tip config not found", 404);

  // Find all tip transactions to this user
  const tips = await Transaction.find({
    type: "tip",
    toUserId: user._id,
    status: "completed",
  }).populate("fromUserId", "username");

  const tippers = tips.map((tx: any) => ({
    username: tx.fromUserId?.username || "Anonymous",
    amount: tx.amount,
  }));

  return success({
    user: {
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      walletAddress: user.primaryWalletAddress,
    },
    config: {
      statement: config.statement,
      exclusiveContent: config.exclusiveContent,
      giftOptions: config.giftOptions,
    },
    tippers,
  });
};
