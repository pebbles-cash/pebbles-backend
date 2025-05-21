import { APIGatewayProxyEvent } from "aws-lambda";
import { Document, Model, Types } from "mongoose";

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
  defaultLanguage: string;
  notificationsEnabled: boolean;
  twoFactorEnabled: boolean;
  preferredTimeZone: string;
}

export interface IUser extends Document {
  email: string;
  primaryWalletAddress: string;
  chain: string;
  username?: string;
  displayName?: string;
  avatar?: string;
  dynamicUserId?: string;
  socialProfiles: ISocialProfile[];
  preferences: IUserPreferences;
  createdAt: Date;
  updatedAt: Date;
}
// Dynamic User interfaces
export interface IDynamicUserAccount {
  provider: string;
  id: string;
  username: string;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
}

export interface IDynamicUser {
  username?: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  walletAddress?: string; // Note: This maps to primaryWalletAddress in our system
  chain?: string;
  socialAccounts?: IDynamicUserAccount[];

  // Allow for additional properties
  [key: string]: any;
}

// Frontend request body interface
export interface IUserData {
  // Basic user information
  username?: string;
  email?: string;
  displayName?: string;
  avatar?: string;

  // Wallet information
  primaryWalletAddress?: string;
  chain?: string;

  // User preferences
  preferences?: {
    defaultCurrency?: string;
    defaultLanguage?: string;
    notificationsEnabled?: boolean;
    twoFactorEnabled?: boolean;
    preferredTimeZone?: string;
  };
  [key: string]: any;
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
  category: string; // e.g., 'design', 'writing', 'consulting'
  tags: string[]; // user-defined tags
  client?: string; // for freelancers to tag client-specific work
  projectId?: string; // to group transactions by project
}

export interface CreateTransactionRequestBody {
  type: "payment" | "tip" | "subscription";
  toUserId: string;
  fromAddress?: string;
  toAddress: string;
  amount: string | number;
  tokenAddress?: string;
  sourceChain: string;
  destinationChain: string;
  category?: string;
  tags?: string[];
  client?: string;
  projectId?: string;
  metadata?: Record<string, any>;
}

export interface UpdateTransactionRequestBody {
  status?: "pending" | "completed" | "failed";
  category?: string;
  tags?: string[];
  client?: string;
  projectId?: string;
  metadata?: Record<string, any>;
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
    primaryWalletAddress?: string;
    chain?: string;
    preferences?: {
      defaultCurrency?: string;
      defaultLanguage?: string;
      notificationsEnabled?: boolean;
      twoFactorEnabled?: boolean;
      preferredTimeZone?: string;
    };
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

export interface CreateUserRequestBody {
  userId: string; // Dynamic user ID
  email: string;
  username: string;
  verifiedCredentials: {
    address: string;
    chain: string;
  }[];
  primaryWallet: {
    address: string;
    chain: string;
    id?: string; // Optional wallet ID from Dynamic
  };
  phoneNumber?: string; // Optional field
  newUser?: boolean; // Flag indicating if this is a new user
}

export interface UpdateUserRequestBody {
  username?: string;
  displayName?: string;
  avatar?: string;
  primaryWallet?: {
    address: string;
    chain: string;
  };
  preferences?: {
    defaultCurrency?: string;
    defaultLanguage?: string;
    notificationsEnabled?: boolean;
    twoFactorEnabled?: boolean;
    preferredTimeZone?: string;
  };
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
  smartContractId?: string;
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

export interface IMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface IChatSession extends Document {
  userId: Types.ObjectId;
  title: string;
  messages: IMessage[];
  lastInteraction: Date;
  active: boolean;
  metadata: {
    context?: {
      dateRange?: {
        start?: Date;
        end?: Date;
      };
      transactionTypes?: string[];
      clients?: string[];
      projects?: string[];
    };
    aiProvider?: string;
    modelVersion?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  addMessage(sender: string, content: string): void;
  generateTitle(): string;
}

export interface IAnalyticsCache extends Document {
  userId: Types.ObjectId;
  queryType: string;
  params: {
    period?: "day" | "week" | "month" | "quarter" | "year";
    startDate?: Date;
    endDate?: Date;
    transactionType?: string;
    categories?: string[];
    tags?: string[];
    clients?: string[];
    groupBy?: string;
    currency?: string;
    includeDetails?: boolean;
  };
  results: any;
  createdAt: Date;
  expiresAt: Date;
  lastAccessed: Date;
  accessCount: number;
  isValid(): boolean;
  updateAccess(): void;
  generateCacheKey(queryType: string, params: Record<string, any>): string;
  findByParams(
    userId: Types.ObjectId,
    queryType: string,
    params: Record<string, any>
  ): Promise<IAnalyticsCache | null>;
}

// Model interface (for static methods)
export interface AnalyticsCacheModel extends Model<IAnalyticsCache> {
  generateCacheKey(queryType: string, params: Record<string, any>): string;
  findByParams(
    userId: Types.ObjectId,
    queryType: string,
    params: Record<string, any>
  ): Promise<IAnalyticsCache | null>;
}
