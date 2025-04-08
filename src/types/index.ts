import { APIGatewayProxyEvent } from "aws-lambda";
import { Document, Types } from "mongoose";

// User-related types
export interface ISocialProfile {
  platform: string;
  profileId: string;
  username: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  lastUpdated?: Date;
}

export interface IUserPreferences {
  defaultCurrency: string;
  notificationsEnabled: boolean;
  twoFactorEnabled: boolean;
}

export interface IUser extends Document {
  email: string;
  username: string;
  displayName?: string;
  avatar?: string;
  dynamicUserId?: string;
  walletAddress?: string;
  socialProfiles: ISocialProfile[];
  preferences: IUserPreferences;
  createdAt: Date;
  updatedAt: Date;
}

// Wallet-related types
export interface IWalletBalance {
  amount: string;
  lastUpdated: Date;
}

export interface IWallet extends Document {
  userId: Types.ObjectId;
  address: string;
  type: "eip7702" | "eoa";
  chain: "ethereum" | "polygon" | "arbitrum" | "optimism" | "base";
  isDefault: boolean;
  balance: Map<string, IWalletBalance>;
  createdAt: Date;
  updatedAt: Date;
}

// Transaction-related types
export interface ITransactionMetadata {
  orderId?: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  note?: string;
  category?: string;
  anonymous?: boolean;
}

export interface ITransaction extends Document {
  type: "payment" | "tip" | "subscription";
  fromUserId?: Types.ObjectId;
  toUserId: Types.ObjectId;
  fromAddress?: string;
  toAddress: string;
  amount: string;
  tokenAddress?: string;
  sourceChain: string;
  destinationChain: string;
  txHash?: string;
  status: "pending" | "completed" | "failed";
  metadata: ITransactionMetadata;
  createdAt: Date;
  updatedAt: Date;
}

// Order-related types
export interface IAmount {
  value: number;
  currency: string;
}

export interface IOrder extends Document {
  creatorId: Types.ObjectId;
  title: string;
  description?: string;
  amount: IAmount;
  qrCodeUrl?: string;
  paymentUrl: string;
  expiresAt?: Date;
  status: "active" | "expired" | "completed";
  transactionId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Subscription-related types
export interface IBillingCycle {
  interval: "day" | "week" | "month" | "year";
  count: number;
}

export interface ISubscription extends Document {
  creatorId: Types.ObjectId;
  name: string;
  description?: string;
  price: IAmount;
  billingCycle: IBillingCycle;
  features: string[];
  active: boolean;
  smartContractId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscriptionInstance extends Document {
  subscriptionId: Types.ObjectId;
  creatorId: Types.ObjectId;
  subscriberId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  price: IAmount;
  autoRenew: boolean;
  status: "active" | "canceled" | "expired";
  transactions: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

// Tip Jar-related types
export interface ISuggestedAmount extends IAmount {
  label: string;
}

export interface ITipJar extends Document {
  creatorId: Types.ObjectId;
  title: string;
  description?: string;
  suggestedAmounts: ISuggestedAmount[];
  qrCodeUrl?: string;
  paymentUrl: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Authentication-related types
export interface IDecodedToken {
  userId: string;
  dynamicId?: string;
  iat: number;
  exp: number;
}

// Extend APIGatewayProxyEvent to include user info
export interface AuthenticatedAPIGatewayProxyEvent
  extends APIGatewayProxyEvent {
  user?: {
    id: string;
    username: string;
    email: string;
    displayName?: string;
    walletAddress?: string;
  };
}

// Request body types
export interface LoginRequestBody {
  loginMethod: string;
  redirectUrl?: string;
}

export interface CallbackRequestBody {
  code: string;
  state: string;
}

export interface UpdateUserRequestBody {
  username?: string;
  displayName?: string;
  bio?: string;
}

export interface SocialStatsRequestBody {
  platform: string;
  followers?: number;
  engagement?: number;
  rank?: number;
}

export interface CreateWalletRequestBody {
  chain: "ethereum" | "polygon" | "arbitrum" | "optimism" | "base";
  type?: "eip7702" | "eoa";
}

export interface PaymentRequestBody {
  title: string;
  amount: number;
  currency: string;
  description?: string;
}

export interface ProcessPaymentRequestBody {
  orderId?: string;
  requestId?: string;
  recipientUsername?: string;
  senderWalletAddress: string;
  amount?: number;
  currency?: string;
  paymentMethod: string;
  description?: string;
}

export interface SubscriptionPlanRequestBody {
  name: string;
  description?: string;
  price: IAmount;
  billingCycle: IBillingCycle;
  features?: string[];
  active?: boolean;
}

export interface SubscribeRequestBody {
  paymentMethod: string;
  walletAddress?: string;
}

export interface ManageSubscriptionRequestBody {
  action: "cancel" | "reactivate" | "terminate";
}

export interface TipJarRequestBody {
  title?: string;
  description?: string;
  suggestedAmounts?: ISuggestedAmount[];
}

export interface SendTipRequestBody {
  username: string;
  amount: number;
  currency?: string;
  senderWalletAddress: string;
  message?: string;
  anonymous?: boolean;
}
