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

    const {
      statement,
      gifts,
      exclusiveContentEnabled,
      exclusiveContentMessage,
    } = body;
    if (!Array.isArray(gifts) || gifts.length < 1) {
      return error("At least one gift option is required", 400);
    }

    // Upsert tip config
    const config = await TipConfig.findOneAndUpdate(
      { userId },
      {
        statement: statement || "",
        gifts,
        exclusiveContentEnabled: !!exclusiveContentEnabled,
        exclusiveContentMessage: exclusiveContentMessage || "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

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
    config: {
      statement: config.statement,
      gifts: config.gifts,
      exclusiveContentEnabled: config.exclusiveContentEnabled,
      exclusiveContentMessage: config.exclusiveContentMessage,
    },
    tippers,
  });
};
