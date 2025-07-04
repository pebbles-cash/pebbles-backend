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

export interface IFCMToken {
  token: string;
  device: string;
  lastUsed: Date;
  active: boolean;
}

export interface INotificationPreferences {
  payments: boolean;
  tips: boolean;
  subscriptions: boolean;
  security: boolean;
  marketing: boolean;
  pushEnabled: boolean;
}

export interface RegisterFCMTokenRequestBody {
  token: string;
  device?: string;
}

export interface UpdateNotificationPreferencesRequestBody {
  payments?: boolean;
  tips?: boolean;
  subscriptions?: boolean;
  security?: boolean;
  marketing?: boolean;
  pushEnabled?: boolean;
}

export interface IUser extends Document {
  email: string;
  primaryWalletAddress: string;
  walletName: string;
  walletProvider: string;
  chain: string;
  username?: string;
  displayName?: string;
  avatar?: string;
  dynamicUserId?: string;
  walletLinkedAt?: Date; // When wallet was linked
  lastLoginAt?: Date; // Last login timestamp
  lastDynamicEvent?: string; // Last Dynamic event ID processed
  socialProfiles: ISocialProfile[];
  preferences: IUserPreferences;
  fcmTokens: IFCMToken[];
  notificationPreferences: INotificationPreferences;
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

// Login Cache Types
export interface ICachedJWKSKey {
  key: any;
  expiry: number;
}

export interface ICachedUser {
  user: any;
  expiry: number;
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
    id?: string;
  };
  phoneNumber?: string;
  newUser?: boolean;
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

// Core Fiat Interaction Types
export interface IFeeBreakdown {
  serviceFee: {
    value: number;
    currency: string;
  };
  networkFee: {
    value: number;
    currency: string;
  };
  totalFees: {
    value: number;
    currency: string;
  };
}

export interface IAccountDetails {
  type: "bank_account" | "card" | "crypto_wallet" | "other";
  identifier: string; // last 4 digits, wallet address, etc.
  name?: string; // Bank name, card type, wallet name
  country?: string;
}

export interface IAmount {
  value: number;
  currency: string;
}

export interface ICryptoAmount extends IAmount {
  tokenAddress?: string; // For ERC-20 tokens
}

export interface IDeviceInfo {
  userAgent?: string;
  platform?: string;
  fingerprint?: string;
}

export interface ILimits {
  dailyRemaining?: number;
  monthlyRemaining?: number;
  transactionLimit?: number;
}

export interface IWebhookEvent {
  event: string;
  timestamp: Date;
  data: any;
}

export interface IFiatInteraction extends Document {
  userId: Types.ObjectId;
  type: "onramp" | "offramp";
  status:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "cancelled"
    | "expired";
  serviceProvider: "meld" | "moonpay" | "ramp" | "transak" | "other";
  externalTransactionId: string;
  fiatAmount: IAmount;
  cryptoAmount: ICryptoAmount;
  exchangeRate: number;
  fees: IFeeBreakdown;
  sourceAccount: IAccountDetails;
  destinationAccount: IAccountDetails;
  blockchain: string;
  transactionHash?: string;
  initiatedAt: Date;
  processingStartedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  cancelledAt?: Date;
  failureReason?: string;
  ipAddress: string;
  deviceInfo: IDeviceInfo;
  kycLevel: "none" | "basic" | "full";
  limits?: ILimits;
  metadata: Record<string, any>;
  webhookEvents: IWebhookEvent[];
  createdAt: Date;
  updatedAt: Date;

  // Virtual fields
  netFiatAmount: number;

  // Instance methods
  updateStatus(status: string, additionalData?: any): Promise<IFiatInteraction>;
  addWebhookEvent(event: string, data: any): Promise<IFiatInteraction>;
}

// Add these interfaces to your src/types/index.ts file

// Meld API request/response types
export interface MeldCryptoQuoteRequest {
  sourceAmount?: number;
  sourceCurrency?: string;
  destinationAmount?: number;
  destinationCurrency?: string;
  paymentMethod?: string;
  countryCode?: string;
  walletAddress?: string;
}

export interface MeldWidgetSessionRequest {
  sessionData: {
    additionalParams?: Record<string, any>;
    serviceProvider?: string;
    countryCode?: string;
    walletAddress?: string;
    sourceAmount?: number;
    sourceCurrency?: string;
    destinationCurrency?: string;
    paymentMethodId?: string;
  };
  sessionType: "BUY" | "SELL";
  authenticationBypassDetails?: {
    category: string;
  };
}

export interface MeldPaymentMethodsResponse {
  serviceProviders: Array<{
    id: string;
    name: string;
    status: string;
    paymentMethods: Array<{
      id: string;
      name: string;
      type: string;
      currencies: string[];
      countries: string[];
      limits: {
        min: number;
        max: number;
        currency: string;
      };
      fees: {
        percentage: number;
        fixed: number;
        currency: string;
      };
    }>;
  }>;
}

export interface MeldCryptoQuoteResponse {
  quote: {
    sourceAmount: number;
    sourceCurrency: string;
    destinationAmount: number;
    destinationCurrency: string;
    exchangeRate: number;
    fees: {
      totalFees: number;
      serviceFee: number;
      networkFee: number;
      currency: string;
    };
    expiresAt: string;
    quoteId: string;
  };
  paymentMethod: {
    id: string;
    name: string;
    type: string;
  };
  serviceProvider: {
    id: string;
    name: string;
  };
}

export interface MeldWidgetSessionResponse {
  sessionToken: string;
  widgetUrl: string;
  expiresAt: string;
  sessionId: string;
}

export interface FiatInteractionModel extends Model<IFiatInteraction> {
  getUserStats(
    userId: string,
    timeframe: "day" | "week" | "month" | "year"
  ): Promise<any[]>;
}

export interface ITipGift {
  emoji: string;
  label: string;
  price: number;
  isCustom?: boolean;
}

export interface ITipConfig extends Document {
  userId: Types.ObjectId;
  statement: string;
  gifts: ITipGift[];
  exclusiveContentEnabled: boolean;
  exclusiveContentMessage: string;
  createdAt: Date;
  updatedAt: Date;
}
