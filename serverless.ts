import type { AWS } from "@serverless/typescript";

const serverlessConfiguration: AWS = {
  service: "payment-platform-api",
  frameworkVersion: "^4.0.0",
  build: {
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      exclude: ["aws-sdk"],
      target: "node18",
      define: {
        "require.resolve": undefined,
      },
      platform: "node",
    },
  },
  provider: {
    name: "aws",
    runtime: "nodejs18.x",
    stage: '${opt:stage, "dev"}',
    region: "us-east-1",
    memorySize: 2048,
    timeout: 15,
    versionFunctions: false,
    deploymentBucket: {
      // Dynamic bucket name based on stage
      name: "pebbles-org-${self:provider.stage}-deploy",
      serverSideEncryption: "AES256",
    },
    environment: {
      JWT_SECRET: "${env:JWT_SECRET, ''}",
      DYNAMIC_API_KEY: "${env:DYNAMIC_API_KEY, ''}",
      DYNAMIC_API_URL: "${env:DYNAMIC_API_URL, ''}",
      DYNAMIC_ENVIRONMENT_ID: "${env:DYNAMIC_ENVIRONMENT_ID, ''}", // Added missing env var
      DYNAMIC_WEBHOOK_SECRET: "${env:DYNAMIC_WEBHOOK_SECRET, ''}",
      AUTH_REDIRECT_URL: "${env:AUTH_REDIRECT_URL, ''}",
      PAYMENT_BASE_URL: "${env:PAYMENT_BASE_URL, ''}",
      MONGODB_URI: "${env:MONGODB_URI, ''}", // Added missing env var
      MONGODB_DATABASE: "${env:MONGODB_DATABASE, ''}", // Added missing env var
      FIREBASE_PROJECT_ID: "${env:FIREBASE_PROJECT_ID, ''}",
      FIREBASE_PRIVATE_KEY: "${env:FIREBASE_PRIVATE_KEY, ''}",
      FIREBASE_CLIENT_EMAIL: "${env:FIREBASE_CLIENT_EMAIL, ''}",
      FIREBASE_SERVICE_ACCOUNT_JSON: "${env:FIREBASE_SERVICE_ACCOUNT_JSON, ''}",
      CORS_ORIGIN: "${self:custom.corsOrigins.${self:provider.stage}, '*'}",
      API_DOMAIN: "${self:custom.domain.${self:provider.stage}}",
      MELD_WEBHOOK_SECRET: "${env:MELD_WEBHOOK_SECRET, ''}",
      MELD_API_KEY: "${env:MELD_API_KEY, ''}",
      MELD_API_URL: "${env:MELD_API_URL, 'https://api.meld.io'}",
      SKIP_FCM_VALIDATION: "${env:SKIP_FCM_VALIDATION, 'false'}",
      FCM_VALIDATION_TIMEOUT: "${env:FCM_VALIDATION_TIMEOUT, '5000'}",
      ENABLE_FIREBASE_DEBUG: "${env:ENABLE_FIREBASE_DEBUG, 'false'}",
      SEPOLIA_RPC_URL: "${env:SEPOLIA_RPC_URL, ''}",
      ETHEREUM_RPC_URL: "${env:ETHEREUM_RPC_URL, ''}",
      ETHERSCAN_API_KEY: "${env:ETHERSCAN_API_KEY, ''}",
    },
    iam: {
      role: {
        statements: [
          {
            Effect: "Allow",
            Action: ["ssm:GetParameters", "ssm:GetParameter"],
            Resource: [
              "arn:aws:ssm:${self:provider.region}:*:parameter/payment-platform/${self:provider.stage}/*",
            ],
            // serverlessPluginTypescript: {
            //   tsConfigFilePath: "./tsconfig.json",
            // },
          },
          {
            Effect: "Allow",
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
            ],
            Resource: "arn:aws:logs:${self:provider.region}:*:*",
          },
        ],
      },
    },
  },
  functions: {
    // Authentication Handlers
    // Global CORS handler for OPTIONS requests
    corsHandler: {
      handler: "src/handlers/cors.handleCors",
      events: [
        {
          http: {
            path: "/api/{proxy+}",
            method: "options",
            cors: true,
          },
        },
      ],
    },
    authLogin: {
      handler: "src/handlers/auth.login",
      events: [
        {
          http: {
            path: "/api/auth/login",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    // ADDED: Get authentication configuration
    authGetConfig: {
      handler: "src/handlers/auth.getConfig",
      events: [
        {
          http: {
            path: "/api/auth/config",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    // ADDED: Verify token endpoint
    authVerifyToken: {
      handler: "src/handlers/auth.verifyToken",
      events: [
        {
          http: {
            path: "/api/auth/verify",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    // ADDED: Logout endpoint
    authLogout: {
      handler: "src/handlers/auth.logout",
      events: [
        {
          http: {
            path: "/api/auth/logout",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    // User Management Handlers
    createUser: {
      handler: "src/handlers/users.createUser",
      events: [
        {
          http: {
            path: "/api/users/new",
            method: "post",
            cors: true,
          },
        },
      ],
    },

    getCurrentUser: {
      handler: "src/handlers/users.getCurrentUser",
      events: [
        {
          http: {
            path: "/api/users/me",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    updateCurrentUser: {
      handler: "src/handlers/users.updateCurrentUser",
      events: [
        {
          http: {
            path: "/api/users/update",
            method: "put",
            cors: true,
          },
        },
      ],
    },
    getUserByUsername: {
      handler: "src/handlers/users.getUserByUsername",
      events: [
        {
          http: {
            path: "/api/users/{username}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getWalletAddress: {
      handler: "src/handlers/users.getWalletAddress",
      events: [
        {
          http: {
            path: "/api/users/wallet/lookup",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    updateSocialStats: {
      handler: "src/handlers/users.updateSocialStats",
      events: [
        {
          http: {
            path: "/api/users/social-stats",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    getUserConfigByIp: {
      handler: "src/handlers/users.getUserConfigByIp",
      events: [
        {
          http: {
            path: "/api/users/ip-config",
            method: "get",
            cors: true,
          },
        },
      ],
    },

    // Payment & QR Code Handlers
    generateQRCode: {
      handler: "src/handlers/payments.generateQRCode",
      events: [
        {
          http: {
            path: "/api/payments/qr-code",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    createPaymentRequest: {
      handler: "src/handlers/payments.createPaymentRequest",
      events: [
        {
          http: {
            path: "/api/payments/request",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    getPaymentRequest: {
      handler: "src/handlers/payments.getPaymentRequest",
      events: [
        {
          http: {
            path: "/api/payments/request/{requestId}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    processPayment: {
      handler: "src/handlers/payments.processPayment",
      events: [
        {
          http: {
            path: "/api/payments/process",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    getPaymentUrl: {
      handler: "src/handlers/payments.getPaymentUrl",
      events: [
        {
          http: {
            path: "/api/payments/url/{username}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    // Transaction Handlers
    createTransaction: {
      handler: "src/handlers/transactions.createTransaction",
      events: [
        {
          http: {
            path: "/api/transactions",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    updateTransaction: {
      handler: "src/handlers/transactions.updateTransaction",
      events: [
        {
          http: {
            path: "/api/transactions/{transactionId}",
            method: "put",
            cors: true,
          },
        },
      ],
    },
    getUserTransactions: {
      handler: "src/handlers/transactions.getUserTransactions",
      events: [
        {
          http: {
            path: "/api/transactions",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getTransactionStats: {
      handler: "src/handlers/transactions.getTransactionStats",
      events: [
        {
          http: {
            path: "/api/transactions/stats",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getRecentInteractionUsers: {
      handler: "src/handlers/transactions.getRecentInteractionUsers",
      events: [
        {
          http: {
            path: "/api/contacts",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    filterTransactions: {
      handler: "src/handlers/transactions.filterTransactions",
      events: [
        {
          http: {
            path: "/api/transactions/filter",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    getTransactionByHash: {
      handler: "src/handlers/transactions.getTransactionByHash",
      events: [
        {
          http: {
            path: "/api/transactions/hash/{txHash}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getTransactionDetails: {
      handler: "src/handlers/transactions.getTransactionDetails",
      events: [
        {
          http: {
            path: "/api/transactions/{transactionId}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    processTransactionHash: {
      handler: "src/handlers/transactions.processTransactionHash",
      events: [
        {
          http: {
            path: "/api/transactions/process",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    getTransactionStatus: {
      handler: "src/handlers/transactions.getTransactionStatus",
      events: [
        {
          http: {
            path: "/api/transactions/status/{txHash}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getSupportedNetworks: {
      handler: "src/handlers/transactions.getSupportedNetworks",
      events: [
        {
          http: {
            path: "/api/transactions/networks",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    // Subscription Handlers
    createSubscriptionPlan: {
      handler: "src/handlers/subscriptions.createSubscriptionPlan",
      events: [
        {
          http: {
            path: "/api/subscriptions",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    getCreatorSubscriptions: {
      handler: "src/handlers/subscriptions.getCreatorSubscriptions",
      events: [
        {
          http: {
            path: "/api/subscriptions",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getSubscriptionDetails: {
      handler: "src/handlers/subscriptions.getSubscriptionDetails",
      events: [
        {
          http: {
            path: "/api/subscriptions/{subscriptionId}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    updateSubscriptionPlan: {
      handler: "src/handlers/subscriptions.updateSubscriptionPlan",
      events: [
        {
          http: {
            path: "/api/subscriptions/{subscriptionId}",
            method: "put",
            cors: true,
          },
        },
      ],
    },
    deleteSubscriptionPlan: {
      handler: "src/handlers/subscriptions.deleteSubscriptionPlan",
      events: [
        {
          http: {
            path: "/api/subscriptions/{subscriptionId}",
            method: "delete",
            cors: true,
          },
        },
      ],
    },
    subscribeToPlan: {
      handler: "src/handlers/subscriptions.subscribeToPlan",
      events: [
        {
          http: {
            path: "/api/subscriptions/{subscriptionId}/subscribe",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    manageSubscriptionInstance: {
      handler: "src/handlers/subscriptions.manageSubscriptionInstance",
      events: [
        {
          http: {
            path: "/api/subscriptions/manage/{instanceId}",
            method: "post",
            cors: true,
          },
        },
      ],
    },

    // Database Health Check
    checkDbConnection: {
      handler: "src/handlers/health.checkDbConnection",
      events: [
        {
          http: {
            path: "/api/health/db",
            method: "get",
            cors: true,
          },
        },
      ],
    },

    // Notifications Handlers
    subscribeToNotifications: {
      handler: "src/handlers/notifications.subscribe",
      events: [
        {
          http: {
            path: "/api/notifications/subscribe",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    unsubscribeToNotifications: {
      handler: "src/handlers/notifications.unsubscribe",
      events: [
        {
          http: {
            path: "/api/notifications/unsubscribe",
            method: "delete",
            cors: true,
          },
        },
      ],
    },
    updateNotificationPreferences: {
      handler: "src/handlers/notifications.updatePreferences",
      events: [
        {
          http: {
            path: "/api/notifications/preferences",
            method: "put",
            cors: true,
          },
        },
      ],
    },
    getNotificationPreferences: {
      handler: "src/handlers/notifications.getPreferences",
      events: [
        {
          http: {
            path: "/api/notifications/preferences",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getNotificationHistory: {
      handler: "src/handlers/notifications.getHistory",
      events: [
        {
          http: {
            path: "/api/notifications/history",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    markNotificationsAsRead: {
      handler: "src/handlers/notifications.markAsRead",
      events: [
        {
          http: {
            path: "/api/notifications/history/read",
            method: "put",
            cors: true,
          },
        },
      ],
    },
    markAllNotificationsAsRead: {
      handler: "src/handlers/notifications.markAllAsRead",
      events: [
        {
          http: {
            path: "/api/notifications/history/read-all",
            method: "put",
            cors: true,
          },
        },
      ],
    },
    clearAllNotifications: {
      handler: "src/handlers/notifications.clearAll",
      events: [
        {
          http: {
            path: "/api/notifications/history/clear",
            method: "delete",
            cors: true,
          },
        },
      ],
    },
    getUnreadNotificationCount: {
      handler: "src/handlers/notifications.getUnreadCount",
      events: [
        {
          http: {
            path: "/api/notifications/history/unread-count",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    // Webhook Handlers
    meldWebhook: {
      handler: "src/handlers/webhooks/meld.handleMeldWebhook",
      events: [
        {
          http: {
            path: "/api/webhooks/meld",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    dynamicWebhook: {
      handler: "src/handlers/webhooks/dynamic.handleDynamicWebhook",
      events: [
        {
          http: {
            path: "/api/webhooks/dynamic",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    // Meld API Handlers
    getMeldPaymentMethods: {
      handler: "src/handlers/meld.getPaymentMethods",
      events: [
        {
          http: {
            path: "/api/meld/payment-methods",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getFiatCurrencies: {
      handler: "src/handlers/meld.getFiatCurrencies",
      events: [
        {
          http: {
            path: "/api/meld/fiat-currencies",
            method: "get",
            cors: true,
          },
        },
      ],
    },

    getCryptoQuote: {
      handler: "src/handlers/meld.getCryptoQuote",
      events: [
        {
          http: {
            path: "/api/meld/crypto-quote",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    createWidgetSession: {
      handler: "src/handlers/meld.createWidgetSession",
      events: [
        {
          http: {
            path: "/api/meld/widget-session",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    // FiatInteraction endpoints
    createFiatInteraction: {
      handler: "src/handlers/fiat-interactions.createFiatInteraction",
      events: [
        {
          http: {
            path: "/api/fiat-interactions",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    getUserFiatInteractions: {
      handler: "src/handlers/fiat-interactions.getUserFiatInteractions",
      events: [
        {
          http: {
            path: "/api/fiat-interactions",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getFiatInteractionById: {
      handler: "src/handlers/fiat-interactions.getFiatInteractionById",
      events: [
        {
          http: {
            path: "/api/fiat-interactions/customer/{partnerCustomerId}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getFiatInteractionBySessionId: {
      handler: "src/handlers/fiat-interactions.getFiatInteractionBySessionId",
      events: [
        {
          http: {
            path: "/api/fiat-interactions/session/{sessionId}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getFiatInteractionStats: {
      handler: "src/handlers/fiat-interactions.getFiatInteractionStats",
      events: [
        {
          http: {
            path: "/api/fiat-interactions/stats",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    // Tips Handlers
    configureTipPage: {
      handler: "src/handlers/tips.configureTipPage",
      events: [
        {
          http: {
            path: "/api/tips/configure",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    updateTipPage: {
      handler: "src/handlers/tips.updateTipPage",
      events: [
        {
          http: {
            path: "/api/tips/configure",
            method: "put",
            cors: true,
          },
        },
      ],
    },
    getTipPage: {
      handler: "src/handlers/tips.getTipPage",
      events: [
        {
          http: {
            path: "/api/tips/{username}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getCryptoCurrencies: {
      handler: "src/handlers/meld.getCryptoCurrencies",
      events: [
        {
          http: {
            path: "/api/meld/crypto-list",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getUserActivity: {
      handler: "src/handlers/user-activity.getUserActivity",
      events: [
        {
          http: {
            path: "/api/user/activity",
            method: "get",
            cors: true,
          },
        },
      ],
    },
  },

  plugins: [
    "serverless-offline",
    "serverless-domain-manager",
    "serverless-prune-plugin",
  ],
  custom: {
    serverlessPluginTypescript: {
      tsConfigFilePath: "./tsconfig.json",
    },
    serverlessOffline: {
      httpPort: 3000,
      lambdaPort: 3002,
      useChildProcesses: true,
      websocketPort: 3001,
      noPrependStageInUrl: true,
      dotenv: true,
    },
    customDomain: {
      enabled: true,
      domainName: "${self:custom.domain.${self:provider.stage}}",
      basePath: "",
      stage: "${self:provider.stage}",
      createRoute53Record: false,
      certificateName: "*.payment-platform.com",
      endpointType: "regional",
      securityPolicy: "tls_1_2",
      apiType: "rest",
      autoDomain: false,
      certificateArn: "${env:CERTIFICATE_ARN}",
      hostedZoneId: false, // Disable Route53 validation
      validationDomain: "pebbles.cash",
    },
    domain: {
      dev: "dev-api.pebbles.cash",
      staging: "staging-api.pebbles.cash",
      prod: "api.pebbles.cash",
    },
    corsOrigins: {
      dev: "https://qa.pebbles.cash",
      staging: "https://dev.pebbles.cash",
      prod: "https://app.pebbles.cash",
    },
  },
};

module.exports = serverlessConfiguration;
