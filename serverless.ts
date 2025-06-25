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
      AUTH_REDIRECT_URL: "${env:AUTH_REDIRECT_URL, ''}",
      PAYMENT_BASE_URL: "${env:PAYMENT_BASE_URL, ''}",
      MONGODB_URI: "${env:MONGODB_URI, ''}", // Added missing env var
      MONGODB_DATABASE: "${env:MONGODB_DATABASE, ''}", // Added missing env var
      FIREBASE_PROJECT_ID: "${env:FIREBASE_PROJECT_ID, ''}",
      FIREBASE_PRIVATE_KEY: "${env:FIREBASE_PRIVATE_KEY, ''}",
      FIREBASE_CLIENT_EMAIL: "${env:FIREBASE_CLIENT_EMAIL, ''}",
      FIREBASE_SERVICE_ACCOUNT_JSON: "${env:FIREBASE_SERVICE_ACCOUNT_JSON, ''}",
      CORS_ORIGIN: "${self:custom.corsOrigin.${self:provider.stage}, '*'}",
      API_DOMAIN: "${self:custom.domain.${self:provider.stage}}",
      MELD_WEBHOOK_SECRET: "${env:MELD_WEBHOOK_SECRET, ''}",
      MELD_API_KEY: "${env:MELD_API_KEY, ''}",
      MELD_API_URL: "${env:MELD_API_URL, 'https://api.meld.io'}",
      SKIP_FCM_VALIDATION: "${env:SKIP_FCM_VALIDATION, 'false'}",
      FCM_VALIDATION_TIMEOUT: "${env:FCM_VALIDATION_TIMEOUT, '5000'}",
      ENABLE_FIREBASE_DEBUG: "${env:ENABLE_FIREBASE_DEBUG, 'false'}",
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
    // Webhook Handlers
    meldWebhook: {
      handler: "src/handlers/webhooks.handleMeldWebhook",
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
    // Assistant Handlers
    // sendAssistantMessage: {
    //   handler: "src/handlers/assistant.sendMessage",
    //   events: [
    //     {
    //       http: {
    //         path: "/api/assistant/message",
    //         method: "post",
    //         cors: true,
    //       },
    //     },
    //   ],
    // },
    // getAssistantSessions: {
    //   handler: "src/handlers/assistant.getSessions",
    //   events: [
    //     {
    //       http: {
    //         path: "/api/assistant/sessions",
    //         method: "get",
    //         cors: true,
    //       },
    //     },
    //   ],
    // },
    // getAssistantSession: {
    //   handler: "src/handlers/assistant.getSession",
    //   events: [
    //     {
    //       http: {
    //         path: "/api/assistant/sessions/{sessionId}",
    //         method: "get",
    //         cors: true,
    //       },
    //     },
    //   ],
    // },
    // deleteAssistantSession: {
    //   handler: "src/handlers/assistant.deleteSession",
    //   events: [
    //     {
    //       http: {
    //         path: "/api/assistant/sessions/{sessionId}",
    //         method: "delete",
    //         cors: true,
    //       },
    //     },
    //   ],
    // },
    // generateInvoice: {
    //   handler: "src/handlers/assistant.generateInvoice",
    //   events: [
    //     {
    //       http: {
    //         path: "/api/assistant/generate-invoice",
    //         method: "post",
    //         cors: true,
    //       },
    //     },
    //   ],
    // },
  },

  plugins: ["serverless-offline", "serverless-domain-manager"],
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
  },
};

const corsOrigins = {
  dev: "http://localhost:3000",
  staging: "https://dev.pebbles.cash",
  prod: "https://app.pebbles.cash",
};

module.exports = serverlessConfiguration;
