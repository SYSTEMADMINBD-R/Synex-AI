// TwinMind chat backend: conversations + messages, and the sendMessage action
// that calls the configured provider through the selected mode persona.
//
// History separation: every message records which mode (general/hacking) it
// belongs to. When building the context sent to the model we only include
// messages from the current mode, so flipping the toggle mid-conversation
// never leaks one persona's history into the other's context.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { modeValidator, type Mode } from "./schema";
import {
  generateChatCompletion,
  type ChatContentPart,
  type ChatMessage,
} from "./ai";

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

/** Returns a one-time URL the client uploads a file to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    return ctx.storage.generateUploadUrl();
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

export const touchConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  },
  handler: async (ctx, { conversationId, title, updatedAt }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }
    await ctx.db.patch(conversationId, {
      ...(title !== undefined ? { title } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    });
  },
});

export const insertMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    mode: modeValidator,
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.string(),
          name: v.string(),
          type: v.string(),
          size: v.number(),
          url: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, { conversationId, role, content, mode, attachments }) => {
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
      mode,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      createdAt: Date.now(),
    });
  },
});

/** One-off repair for legacy data: conversations are locked to the mode they
 *  were created in (the first message's mode). The old mode-toggle used to
 *  re-label conversations, so some existing rows disagree with their own
 *  messages. This syncs every conversation back to its first message's mode.
 *  Idempotent — safe to re-run. */
export const repairConversationModes = mutation({
  args: {},
  handler: async (ctx) => {
    const conversations = await ctx.db.query("conversations").collect();
    let fixed = 0;
    for (const conversation of conversations) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversation._id),
        )
        .order("asc")
        .collect();
      const firstMode = messages[0]?.mode;
      if (firstMode && firstMode !== conversation.mode) {
        await ctx.db.patch(conversation._id, { mode: firstMode });
        fixed += 1;
      }
    }
    return { fixed };
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

/** Build OpenAI-style content for a stored user message: plain text plus image
 *  attachments as image_url parts (only images; other files are just named). */
function contentPartsFor(
  content: string,
  attachments?: { url: string; type: string; name: string }[],
): string | ChatContentPart[] {
  const images = (attachments ?? []).filter((a) =>
    a.type.startsWith("image/"),
  );
  if (images.length === 0) return content;
  const parts: ChatContentPart[] = [];
  if (content.trim()) parts.push({ type: "text", text: content });
  for (const image of images) {
    parts.push({ type: "image_url", image_url: { url: image.url } });
  }
  return parts;
}

export const sendMessage = action({
  args: {
    conversationId: v.optional(v.id("conversations")),
    mode: modeValidator,
    content: v.string(),
    attachments: v.optional(
      v.array(
        v.object({
          storageId: v.string(),
          name: v.string(),
          type: v.string(),
          size: v.number(),
        }),
      ),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ conversationId: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    const content = args.content.trim();
    if (!content && (args.attachments ?? []).length === 0) {
      throw new Error("Message cannot be empty");
    }

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

    // Resolve attachment storage ids to public URLs.
    const attachments = await Promise.all(
      (args.attachments ?? []).map(async (attachment) => {
        const url = await ctx.storage.getUrl(attachment.storageId);
        if (!url) return null;
        return { ...attachment, url };
      }),
    );
    const resolvedAttachments = attachments.filter(
      (a): a is NonNullable<typeof a> => a !== null,
    );

    // Persist the user message right away so it appears instantly.
    await ctx.runMutation(api.chat.insertMessage, {
      conversationId,
      role: "user",
      content,
      mode: args.mode,
      ...(resolvedAttachments.length > 0
        ? { attachments: resolvedAttachments }
        : {}),
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
      updatedAt: Date.now(),
    });

    // Build recent history for context (oldest -> newest), filtered to the
    // current mode so hacking and general history never mix in the model's
    // context.
    const allMessages = await ctx.runQuery(api.chat.getMessages, {
      conversationId,
    });
    const history: ChatMessage[] = (allMessages ?? [])
      // Legacy rows (pre-mode) are included; everything else must match the
      // current mode so hacking and general history stay separate.
      .filter(
        (message) => message.mode === undefined || message.mode === args.mode,
      )
      .slice(-HISTORY_LIMIT)
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content:
          message.role === "user"
            ? contentPartsFor(message.content, message.attachments)
            : message.content,
      }));

    const result = await generateChatCompletion(args.mode, history);

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
      mode: args.mode,
    });

    return { conversationId };
  },
});
