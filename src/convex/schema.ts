import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import {
  DEFAULT_GENERAL_MODEL,
  GENERAL_MODELS,
  generalModelLabel,
  type GeneralModel,
} from "../lib/generalModels";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;
export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// TwinMind chat modes
export const MODES = {
  GENERAL: "general",
  HACKING: "hacking",
} as const;
export const modeValidator = v.union(
  v.literal(MODES.GENERAL),
  v.literal(MODES.HACKING),
);
export type Mode = Infer<typeof modeValidator>;

// The General-mode model list lives in src/lib/generalModels.ts so the client
// can import it without dragging Convex server code into the browser bundle.
// Re-exported here for the backend functions that read it from ./schema.
export { DEFAULT_GENERAL_MODEL, GENERAL_MODELS, generalModelLabel };
export type { GeneralModel };

// Validator mirrors GENERAL_MODELS — add a literal here when adding a model
// there. Retired picks stay valid so conversations still pinned to them remain
// schema-valid; they read as the default model:
//   - "gpt-6-astra": Astra / GPT-6 option removed from the picker.
//   - "gemini-2.5-flash": retired by Google (404, September 2026); replaced
//     in the picker by "gemini-3.6-flash".
export const generalModelValidator = v.union(
  v.literal(GENERAL_MODELS["Gemini Flash"]),
  v.literal(GENERAL_MODELS["Gemini Flash Lite"]),
  v.literal(GENERAL_MODELS["Gemini 3.6 Flash"]),
  v.literal("gpt-6-astra"),
  v.literal("gemini-2.5-flash"),
);

// File/image attachment metadata stored on user messages.
export const attachmentValidator = v.object({
  storageId: v.string(),
  name: v.string(),
  type: v.string(),
  size: v.number(),
  url: v.string(),
});
export type Attachment = Infer<typeof attachmentValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // TwinMind chat conversations
    conversations: defineTable({
      userId: v.id("users"),
      title: v.string(),
      mode: modeValidator,
      updatedAt: v.number(),

      // When this is set it pins the General-mode model for this conversation.
      // Hacking-mode conversations ignore it (Hacking always uses Groq).
      generalModel: v.optional(generalModelValidator),

      // Chat lock: when pinHash is set the conversation's messages are only
      // returned/sent when the caller presents the matching PIN hash.
      // The raw PIN never reaches the server — the client stores only
      // sha256(pinSalt + ":" + pin). pinHint is an optional reminder shown
      // on the lock screen.
      pinSalt: v.optional(v.string()),
      pinHash: v.optional(v.string()),
      pinHint: v.optional(v.string()),
    }).index("by_user", ["userId", "updatedAt"]),

    // TwinMind chat messages
    messages: defineTable({
      conversationId: v.id("conversations"),
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
      mode: modeValidator,
      model: v.optional(v.string()),
      attachments: v.optional(v.array(attachmentValidator)),
      createdAt: v.number(),
    }).index("by_conversation", ["conversationId", "createdAt"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
