// TwinMind chat backend: conversations + messages, and the sendMessage action
// that calls the configured provider through the selected mode persona.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { modeValidator, type Mode } from "./schema";
import { generateChatCompletion } from "./ai";

const HISTORY_LIMIT = 20; // recent messages sent to the model as context

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});

export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) return null;
    return conversation;
  },
});

export const getMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) return null;
    return ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("asc")
      .collect();
  },
});

export const createConversation = mutation({
  args: { mode: modeValidator },
  handler: async (ctx, { mode }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return ctx.db.insert("conversations", {
      userId,
      title: "New chat",
      mode,
      updatedAt: Date.now(),
    });
  },
});

export const setMode = mutation({
  args: { conversationId: v.id("conversations"), mode: modeValidator },
  handler: async (ctx, { conversationId, mode }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }
    await ctx.db.patch(conversationId, { mode });
  },
});

export const touchConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.optional(v.string()),
    mode: v.optional(modeValidator),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, title, mode, updatedAt }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }
    await ctx.db.patch(conversationId, {
      ...(title !== undefined ? { title } : {}),
      ...(mode !== undefined ? { mode } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    });
  },
});

export const insertMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, { conversationId, role, content }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }
    await ctx.db.insert("messages", {
      conversationId,
      role,
      content,
      createdAt: Date.now(),
    });
  },
});

export const deleteConversation = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", conversationId),
      )
      .collect();
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
    await ctx.db.delete(conversationId);
  },
});

/** Friendly in-chat notice shown when the provider key(s) are not configured. */
const SETUP_NOTICE = `Heads up — I can't reach my brain right now. The app is missing an **AI API key**.

- **General mode** needs a **Gemini API key** (\`GEMINI_API_KEY\`).
- **Hacking mode** needs a **Groq API key** (\`GROQ_API_KEY\`, or several comma-separated in \`GROQ_API_KEYS\`).

Add them in your project's **Keys/API keys** settings, and I'll be ready to answer anything in both modes.`;

export const sendMessage = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    mode: modeValidator,
    content: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ conversationId: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const content = args.content.trim();
    if (!content) throw new Error("Message cannot be empty");

    let conversationId = args.conversationId;
    if (conversationId === undefined) {
      conversationId = await ctx.runMutation(api.chat.createConversation, {
        mode: args.mode,
      });
    }

    // Ownership check + fetch current conversation state.
    const conversation = await ctx.runQuery(api.chat.getConversation, {
      conversationId,
    });
    if (conversation === null) throw new Error("Conversation not found");

    // Persist the user message right away so it appears instantly.
    await ctx.runMutation(api.chat.insertMessage, {
      conversationId,
      role: "user",
      content,
    });

    // Auto-title the conversation from the first message.
    const title =
      conversation.title === "New chat"
        ? content.length > 48
          ? `${content.slice(0, 48)}…`
          : content
        : conversation.title;
    await ctx.runMutation(api.chat.touchConversation, {
      conversationId,
      title,
      mode: args.mode,
      updatedAt: Date.now(),
    });

    // Build recent history for context (oldest -> newest).
    const allMessages = await ctx.runQuery(api.chat.getMessages, {
      conversationId,
    });
    const history = (allMessages ?? [])
      .slice(-HISTORY_LIMIT)
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.content,
      }));

    const mode: Mode = args.mode;
    const result = await generateChatCompletion(mode, history);

    let reply: string;
    if (!result.ok) {
      reply =
        result.error === "missing-key"
          ? SETUP_NOTICE
          : "I hit a snag while thinking. Please try again in a moment.";
    } else {
      reply = result.content;
    }

    await ctx.runMutation(api.chat.insertMessage, {
      conversationId,
      role: "assistant",
      content: reply,
    });

    return { conversationId };
  },
});
