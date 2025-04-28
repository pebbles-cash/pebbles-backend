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
      concurrency: 10,
    },
  },
  provider: {
    name: "aws",
    runtime: "nodejs18.x",
    stage: '${opt:stage, "dev"}',
    region: "us-east-1",
    memorySize: 256,
    timeout: 30,
    environment: {
      JWT_SECRET: "${env:JWT_SECRET, ''}",
      DYNAMIC_API_KEY: "${env:DYNAMIC_API_KEY, ''}",
      DYNAMIC_API_URL: "${env:DYNAMIC_API_URL, ''}",
      AUTH_REDIRECT_URL: "${env:AUTH_REDIRECT_URL, ''}",
      PAYMENT_BASE_URL: "${env:PAYMENT_BASE_URL, ''}",
      LLM_PROVIDER: "${env:LLM_PROVIDER, 'openai'}",
      OPENAI_API_KEY: "${env:OPENAI_API_KEY, ''}",
      OPENAI_MODEL: "${env:OPENAI_MODEL, 'gpt-4'}",
      ANTHROPIC_API_KEY: "${env:ANTHROPIC_API_KEY, ''}",
      ANTHROPIC_MODEL: "${env:ANTHROPIC_MODEL, 'claude-3-opus-20240229'}",
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
            serverlessPluginTypescript: {
              tsConfigFilePath: "./tsconfig.json",
            },
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
    authCallback: {
      handler: "src/handlers/auth.callback",
      events: [
        {
          http: {
            path: "/api/auth/callback",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    // User Management Handlers
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
            path: "/api/users/me",
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
    // Wallet Management Handlers
    getUserWallets: {
      handler: "src/handlers/wallets.getUserWallets",
      events: [
        {
          http: {
            path: "/api/wallets",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getWalletDetails: {
      handler: "src/handlers/wallets.getWalletDetails",
      events: [
        {
          http: {
            path: "/api/wallets/{walletId}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getWalletBalance: {
      handler: "src/handlers/wallets.getWalletBalance",
      events: [
        {
          http: {
            path: "/api/wallets/{walletId}/balance",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    createWallet: {
      handler: "src/handlers/wallets.createWallet",
      events: [
        {
          http: {
            path: "/api/wallets/create",
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
    // Assistant Handlers
    sendAssistantMessage: {
      handler: "src/handlers/assistant.sendMessage",
      events: [
        {
          http: {
            path: "/api/assistant/message",
            method: "post",
            cors: true,
          },
        },
      ],
    },
    getAssistantSessions: {
      handler: "src/handlers/assistant.getSessions",
      events: [
        {
          http: {
            path: "/api/assistant/sessions",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    getAssistantSession: {
      handler: "src/handlers/assistant.getSession",
      events: [
        {
          http: {
            path: "/api/assistant/sessions/{sessionId}",
            method: "get",
            cors: true,
          },
        },
      ],
    },
    deleteAssistantSession: {
      handler: "src/handlers/assistant.deleteSession",
      events: [
        {
          http: {
            path: "/api/assistant/sessions/{sessionId}",
            method: "delete",
            cors: true,
          },
        },
      ],
    },
    generateInvoice: {
      handler: "src/handlers/assistant.generateInvoice",
      events: [
        {
          http: {
            path: "/api/assistant/generate-invoice",
            method: "post",
            cors: true,
          },
        },
      ],
    },
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
    },
    customDomain: {
      domainName: "api-${self:provider.stage}.payment-platform.com",
      basePath: "",
      stage: "${self:provider.stage}",
      createRoute53Record: true,
      certificateName: "*.payment-platform.com",
      endpointType: "edge",
      securityPolicy: "tls_1_2",
      apiType: "rest",
      autoDomain: true,
    },
  },
};

module.exports = serverlessConfiguration;
