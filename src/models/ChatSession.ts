import { Schema, model, Document, Types } from "mongoose";
import { IMessage, IChatSession } from "../types";

const messageSchema = new Schema<IMessage>(
  {
    role: {
      type: String,
      required: true,
      enum: ["user", "assistant", "system"],
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const chatSessionSchema = new Schema<IChatSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      default: "New Conversation",
    },
    messages: [messageSchema],
    lastInteraction: {
      type: Date,
      default: Date.now,
    },
    active: {
      type: Boolean,
      default: true,
    },
    metadata: {
      context: {
        dateRange: {
          start: Date,
          end: Date,
        },
        transactionTypes: [String],
        clients: [String],
        projects: [String],
      },
      aiProvider: String,
      modelVersion: String,
    },
  },
  { timestamps: true }
);

// Create indexes
chatSessionSchema.index({ userId: 1, lastInteraction: -1 });
chatSessionSchema.index({ userId: 1, active: 1 });
chatSessionSchema.index({
  userId: 1,
  "metadata.context.transactionTypes": 1,
  "metadata.context.clients": 1,
});

// Method to add a new message to the session
chatSessionSchema.methods.addMessage = function (
  role: "user" | "assistant" | "system",
  content: string
): void {
  this.messages.push({
    role,
    content,
    timestamp: new Date(),
  });
  this.lastInteraction = new Date();
};

// Method to generate title based on first user message
chatSessionSchema.methods.generateTitle = function (): string {
  const firstUserMessage = this.messages.find(
    (msg: IMessage) => msg.role === "user"
  );
  if (firstUserMessage) {
    // Create a title from the first 30 chars of the first message
    const title = firstUserMessage.content.substring(0, 30).trim();
    this.title = title + (title.length === 30 ? "..." : "");
    return this.title;
  }
  return this.title;
};

// Method to get conversation history in format suitable for LLM APIs
chatSessionSchema.methods.getFormattedConversation = function (
  maxMessages = 10
): IMessage[] {
  // Return the most recent N messages (or all if less than N)
  return this.messages.slice(-maxMessages);
};

export const ChatSession = model<IChatSession>(
  "ChatSession",
  chatSessionSchema
);
