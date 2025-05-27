import admin from "firebase-admin";
import {
  FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_SERVICE_ACCOUNT_JSON,
} from "../config/env";

// Initialize Firebase Admin SDK
let firebaseApp: admin.app.App | null = null;

export function initializeFirebase(): admin.app.App {
  if (firebaseApp) {
    return firebaseApp;
  }

  try {
    let serviceAccount: admin.ServiceAccount;

    // Try to use the JSON string first (recommended for production)
    if (FIREBASE_SERVICE_ACCOUNT_JSON) {
      serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
    } else if (
      FIREBASE_PRIVATE_KEY &&
      FIREBASE_CLIENT_EMAIL &&
      FIREBASE_PROJECT_ID
    ) {
      // Fallback to individual environment variables
      serviceAccount = {
        projectId: FIREBASE_PROJECT_ID,
        privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        clientEmail: FIREBASE_CLIENT_EMAIL,
      };
    } else {
      throw new Error(
        "Firebase service account credentials not properly configured"
      );
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: FIREBASE_PROJECT_ID,
    });

    console.log("Firebase Admin SDK initialized successfully");
    return firebaseApp;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error);
    throw error;
  }
}

// Notification payload interfaces
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

/**
 * Send notification to a single FCM token
 */
export async function sendNotificationToToken(
  token: string,
  options: NotificationOptions
): Promise<string> {
  try {
    const app = initializeFirebase();
    const messaging = admin.messaging(app);

    const message: admin.messaging.Message = {
      token,
      ...options,
    };

    const response = await messaging.send(message);
    console.log("Successfully sent message:", response);
    return response;
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}

/**
 * Send notification to multiple FCM tokens
 */
export async function sendNotificationToTokens(
  tokens: string[],
  options: NotificationOptions
): Promise<admin.messaging.BatchResponse> {
  try {
    if (tokens.length === 0) {
      throw new Error("No tokens provided");
    }

    const app = initializeFirebase();
    const messaging = admin.messaging(app);

    const message: admin.messaging.MulticastMessage = {
      tokens,
      ...options,
    };

    const response = await messaging.sendEachForMulticast(message);

    // Log failed tokens for cleanup
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];
      response.responses.forEach(
        (resp: admin.messaging.SendResponse, idx: number) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
            console.error(
              `Failed to send to token ${tokens[idx]}:`,
              resp.error
            );
          }
        }
      );
      console.log(
        `Failed to send to ${failedTokens.length} tokens:`,
        failedTokens
      );
    }

    console.log(
      `Successfully sent to ${response.successCount} out of ${tokens.length} tokens`
    );
    return response;
  } catch (error) {
    console.error("Error sending multicast message:", error);
    throw error;
  }
}

/**
 * Validate FCM token
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const app = initializeFirebase();
    const messaging = admin.messaging(app);

    // Try to send a minimal message to validate the token
    await messaging.send(
      {
        token,
        data: { test: "validation" },
      },
      true
    ); // dryRun = true

    return true;
  } catch (error) {
    console.error("Token validation failed:", error);
    return false;
  }
}

/**
 * Create notification templates for different event types
 */
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
