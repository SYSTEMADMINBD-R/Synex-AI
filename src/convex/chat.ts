// TwinMind chat backend: conversations + messages, and the sendMessage action
// that calls the configured provider through the selected mode persona.
//
// History separation: every message records which mode (general/hacking) it
// belongs to. When building the context sent to the model we only include
// messages from the current mode, so flipping the toggle mid-conversation
// never leaks one persona's history into the other's context.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { MODES, modeValidator, type Mode } from "./schema";
import {
  generateChatCompletion,
  isRomoniCommand,
  romoniReplyFor,
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
    return ctx.db.insert("messages", {
      conversationId,
      role,
      content,
      mode,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      createdAt: Date.now(),
    });
  },
});

/** Patch a single message's content — used by sendMessage to stream the
 *  assistant reply into the database progressively so the reactive
 *  getMessages query shows text appearing in real time. Ownership-checked. */
export const updateMessageContent = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { messageId, content, model }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const message = await ctx.db.get(messageId);
    if (!message) throw new Error("Message not found");
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }
    await ctx.db.patch(messageId, {
      content,
      ...(model !== undefined ? { model } : {}),
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

/** Guest mode: permanently delete every conversation and message owned by the
 *  current user. Anonymous guest sessions use this so their chats never
 *  survive — it runs when a guest starts a fresh session and when they leave. */
export const purgeGuestData = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const conversation of conversations) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversation._id),
        )
        .collect();
      for (const message of messages) {
        await ctx.db.delete(message._id);
      }
      await ctx.db.delete(conversation._id);
    }
    return { deleted: conversations.length };
  },
});

/** Internal sweep run by the hourly cron: remove abandoned guest data —
 *  conversations belonging to anonymous users that haven't been touched in
 *  24h. Covers guests who close the browser without signing out, so nothing
 *  they typed can linger on the server. */
export const cleanupGuestData = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const users = await ctx.db.query("users").collect();
    const anonymousIds = new Set(
      users.filter((user) => user.isAnonymous === true).map((user) => user._id),
    );
    if (anonymousIds.size === 0) return { deleted: 0 };
    let deleted = 0;
    for (const userId of anonymousIds) {
      const conversations = await ctx.db
        .query("conversations")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.lt(q.field("updatedAt"), cutoff))
        .collect();
      for (const conversation of conversations) {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversation", (q) =>
            q.eq("conversationId", conversation._id),
          )
          .collect();
        for (const message of messages) {
          await ctx.db.delete(message._id);
        }
        await ctx.db.delete(conversation._id);
        deleted += 1;
      }
    }
    return { deleted };
  },
});

/** Friendly in-chat notice shown when the provider key(s) are not configured. */
const SETUP_NOTICE = `Heads up — I can't reach my brain right now. The app is missing an **AI API key**.

- **General mode** needs a **Gemini API key** (\`GEMINI_API_KEY\`). For extra
  speed and reliability, add more keys in \`GEMINI_API_KEYS\` (comma-separated)
  or \`GEMINI_API_KEY_2\`, \`GEMINI_API_KEY_3\`… — they're rotated automatically.
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
    fast: v.optional(v.boolean()),
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

    // The \romoni command is answered locally with a crafted reply — no
    // provider call, so it's instant and works even without API keys.
    const romoniCommand = isRomoniCommand(content);

    // Resolve the conversation: use the caller's id if it still exists and
    // belongs to them; otherwise self-heal by starting a fresh conversation.
    // A stale id happens in practice when a guest's data is purged (fresh
    // guest sessions start empty) while the UI still holds the old id — the
    // old code failed the whole send with "Conversation not found". The
    // returned conversationId is what the caller should select afterwards.
    let conversationId = args.conversationId;
    let conversation: { title: string; mode: Mode } | null = null;
    if (conversationId !== undefined) {
      conversation = await ctx.runQuery(api.chat.getConversation, {
        conversationId,
      });
    }
    if (conversation === null) {
      conversationId = await ctx.runMutation(api.chat.createConversation, {
        mode: args.mode,
      });
      conversation = { title: "New chat", mode: args.mode };
    }
    // Both branches above guarantee an id; this narrows it for the rest of
    // the function (unreachable in practice).
    if (conversationId === undefined) {
      throw new Error("Conversation not found");
    }

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
      romoniCommand
        ? args.mode === MODES.HACKING
          ? "Love Protocol — Romoni"
          : "Love letter — Romoni"
        : conversation.title === "New chat"
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

    // The \romoni command is answered locally and instantly — no streaming.
    if (romoniCommand) {
      await ctx.runMutation(api.chat.insertMessage, {
        conversationId,
        role: "assistant",
        content: romoniReplyFor(args.mode),
        mode: args.mode,
      });
      return { conversationId };
    }

    // Stream the AI reply into the chat: insert an empty assistant message
    // first, then progressively write the provider's tokens into it. The
    // reactive getMessages query picks up each patch, so the reply appears to
    // type itself instead of the UI staying frozen until the whole answer is
    // ready (the reason General mode felt so slow).
    const assistantMessageId = await ctx.runMutation(api.chat.insertMessage, {
      conversationId,
      role: "assistant",
      content: "",
      mode: args.mode,
    });

    // Throttled persistence: write at most once every ~200ms (or sooner if a
    // big chunk lands). Intermediate writes are fire-and-forget so DB latency
    // never throttles the stream itself (the old `await` made every chunk wait
    // on a full mutation round-trip — that alone stretched answers by seconds).
    // The final forced write is awaited so the exact stored text is guaranteed
    // before the action returns, even if the stream died partway.
    let flushedLength = 0;
    let lastFlushAt = 0;
    let inFlight = 0;
    const flush = (text: string, force = false, model?: string): Promise<void> => {
      const now = Date.now();
      if (
        !force &&
        now - lastFlushAt < 200 &&
        text.length - flushedLength < 150
      ) {
        return Promise.resolve();
      }
      lastFlushAt = now;
      flushedLength = text.length;
      const write = ctx
        .runMutation(api.chat.updateMessageContent, {
          messageId: assistantMessageId,
          content: text,
          ...(model !== undefined ? { model } : {}),
        })
        .then(
          () => undefined,
          () => undefined,
        );
      if (force) return write;
      inFlight += 1;
      write.then(() => {
        inFlight -= 1;
      });
      // If writes pile up (slow DB), yield briefly so we don't queue
      // unboundedly — then keep streaming.
      if (inFlight > 3) {
        return new Promise((resolve) => setTimeout(resolve, 25));
      }
      return Promise.resolve();
    };

    const result = await generateChatCompletion(args.mode, history, flush, {
      fast: args.fast === true,
    });
    // Always land the final text (or an error message) in the database, even
    // if the stream died partway through.
    await flush(
      result.ok
        ? result.content
        : result.error === "missing-key"
          ? SETUP_NOTICE
          : "I hit a snag while thinking. Please try again in a moment.",
      true,
      result.ok ? result.model : undefined,
    );

    return { conversationId };
  },
});
