import admin from "firebase-admin";
import {
  FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_SERVICE_ACCOUNT_JSON,
  NODE_ENV,
} from "../config/env";

// Global variables for Lambda container reuse
let firebaseApp: admin.app.App | null = null;
let messagingInstance: admin.messaging.Messaging | null = null;
let initializationPromise: Promise<admin.app.App> | null = null;

// Cache TTL settings
const FIREBASE_INIT_TIMEOUT = 10000; // 10 seconds max for initialization

export function initializeFirebase(): admin.app.App {
  if (firebaseApp) {
    console.log("🔥 Firebase already initialized, reusing instance");
    return firebaseApp;
  }

  // Prevent multiple concurrent initializations
  if (initializationPromise) {
    console.log("🔥 Firebase initialization in progress, waiting...");
    throw new Error("Firebase initialization in progress");
  }

  const startTime = Date.now();
  console.log("🔥 Initializing Firebase Admin SDK...");

  try {
    let serviceAccount: admin.ServiceAccount;

    // Prioritize JSON string (faster parsing)
    if (FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
      console.log("🔥 Using Firebase service account from JSON string");
    } else if (
      FIREBASE_PRIVATE_KEY &&
      FIREBASE_CLIENT_EMAIL &&
      FIREBASE_PROJECT_ID
    ) {
      serviceAccount = {
        projectId: FIREBASE_PROJECT_ID,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        clientEmail: FIREBASE_CLIENT_EMAIL,
      };
      console.log("🔥 Using Firebase service account from individual env vars");
    } else {
      throw new Error("Firebase credentials not configured properly");
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: FIREBASE_PROJECT_ID,
    });

    // Pre-initialize messaging to avoid lazy loading
    messagingInstance = admin.messaging(firebaseApp);

    const duration = Date.now() - startTime;
    console.log(`✅ Firebase initialized successfully in ${duration}ms`);

    return firebaseApp;
  } catch (error) {
    console.error("❌ Firebase initialization failed:", error);
    // Reset state on failure
    firebaseApp = null;
    messagingInstance = null;
    initializationPromise = null;
    throw error;
  }
}

// OPTIMIZED: Firebase token validation with timeout and retry
export async function validateToken(token: string): Promise<boolean> {
  const startTime = Date.now();

  try {
    // Initialize Firebase if not already done
    if (!messagingInstance) {
      try {
        initializeFirebase();
      } catch (error) {
        console.error(
          "❌ Firebase initialization failed during validation:",
          error
        );
        return false;
      }
    }

    // Create timeout promise
    const timeoutMs = 5000; // 5 second timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Firebase validation timeout")),
        timeoutMs
      )
    );

    // Create validation promise
    const validationPromise = messagingInstance!.send(
      {
        token,
        data: { validation: "test" },
      },
      true
    ); // dryRun = true

    // Race between validation and timeout
    await Promise.race([validationPromise, timeoutPromise]);

    const duration = Date.now() - startTime;
    console.log(`✅ Token validated successfully in ${duration}ms`);
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Log different types of errors
    if (errorMessage.includes("timeout")) {
      console.warn(`⏰ Token validation timeout after ${duration}ms`);
    } else if (errorMessage.includes("invalid-registration-token")) {
      console.warn(`❌ Invalid FCM token (${duration}ms)`);
    } else {
      console.warn(`❌ Token validation failed (${duration}ms):`, errorMessage);
    }

    return false;
  }
}

// OPTIMIZED: Send notification with timeout and error handling
export async function sendNotificationToToken(
  token: string,
  options: NotificationOptions
): Promise<string> {
  const startTime = Date.now();

  try {
    // Initialize Firebase if needed
    if (!messagingInstance) {
      initializeFirebase();
    }

    const message: admin.messaging.Message = {
      token,
      ...options,
    };

    // Add timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Send notification timeout")), 10000)
    );

    const sendPromise = messagingInstance!.send(message);
    const response = await Promise.race([sendPromise, timeoutPromise]);

    const duration = Date.now() - startTime;
    console.log(
      `📱 Notification sent successfully in ${duration}ms:`,
      response
    );
    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Failed to send notification (${duration}ms):`, error);
    throw error;
  }
}

// Keep existing sendNotificationToTokens function but with timeout
export async function sendNotificationToTokens(
  tokens: string[],
  options: NotificationOptions
): Promise<admin.messaging.BatchResponse> {
  const startTime = Date.now();

  try {
    if (tokens.length === 0) {
      throw new Error("No tokens provided");
    }

    if (!messagingInstance) {
      initializeFirebase();
    }

    const message: admin.messaging.MulticastMessage = {
      tokens,
      ...options,
    };

    // Add timeout for batch operations
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Batch send timeout")), 15000)
    );

    const sendPromise = messagingInstance!.sendEachForMulticast(message);
    const response = await Promise.race([sendPromise, timeoutPromise]);

    const duration = Date.now() - startTime;

    // Log failed tokens for cleanup
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          console.error(`Failed to send to token ${tokens[idx]}:`, resp.error);
        }
      });
      console.log(`⚠️ Failed to send to ${failedTokens.length} tokens`);
    }

    console.log(
      `📱 Batch notification completed in ${duration}ms: ${response.successCount}/${tokens.length} successful`
    );
    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Batch notification failed (${duration}ms):`, error);
    throw error;
  }
}

// Notification payload interfaces (keep existing)
export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  clickAction?: string;
  sound?: string;
}

export interface DataPayload {
  [key: string]: string;
}

export interface NotificationOptions {
  notification?: NotificationPayload;
  data?: DataPayload;
  android?: admin.messaging.AndroidConfig;
  apns?: admin.messaging.ApnsConfig;
  webpush?: admin.messaging.WebpushConfig;
}

// Keep existing NotificationTemplates
export const NotificationTemplates = {
  paymentReceived: (
    amount: string,
    senderName: string
  ): NotificationOptions => ({
    notification: {
      title: "Payment Received",
      body: `You received $${amount} from ${senderName}`,
      icon: "/icons/payment-icon.png",
      clickAction: "/transactions",
    },
    data: {
      type: "payment_received",
      amount,
      sender: senderName,
      timestamp: new Date().toISOString(),
    },
  }),

  tipReceived: (amount: string, senderName?: string): NotificationOptions => ({
    notification: {
      title: "Tip Received",
      body: senderName
        ? `${senderName} sent you a $${amount} tip!`
        : `You received a $${amount} tip!`,
      icon: "/icons/tip-icon.png",
      clickAction: "/transactions",
    },
    data: {
      type: "tip_received",
      amount,
      sender: senderName || "anonymous",
      timestamp: new Date().toISOString(),
    },
  }),

  subscriptionRenewal: (
    planName: string,
    amount: string
  ): NotificationOptions => ({
    notification: {
      title: "Subscription Renewed",
      body: `Your ${planName} subscription ($${amount}) will renew in 3 days`,
      icon: "/icons/subscription-icon.png",
      clickAction: "/subscriptions",
    },
    data: {
      type: "subscription_renewal",
      planName,
      amount,
      timestamp: new Date().toISOString(),
    },
  }),

  newSubscriber: (
    planName: string,
    subscriberName: string
  ): NotificationOptions => ({
    notification: {
      title: "New Subscriber",
      body: `${subscriberName} subscribed to your ${planName} plan`,
      icon: "/icons/subscriber-icon.png",
      clickAction: "/subscriptions",
    },
    data: {
      type: "new_subscriber",
      planName,
      subscriber: subscriberName,
      timestamp: new Date().toISOString(),
    },
  }),

  securityAlert: (message: string): NotificationOptions => ({
    notification: {
      title: "Security Alert",
      body: message,
      icon: "/icons/security-icon.png",
      clickAction: "/settings/security",
    },
    data: {
      type: "security_alert",
      message,
      timestamp: new Date().toISOString(),
    },
    android: {
      priority: "high",
    },
    apns: {
      headers: {
        "apns-priority": "10",
      },
    },
  }),
};
