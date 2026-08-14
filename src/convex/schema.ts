import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

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
