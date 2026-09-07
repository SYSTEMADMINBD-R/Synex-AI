// General-mode model picker data, shared by the client (header popover) and
// the Convex backend (schema validator + provider routing). Keep this file
// dependency-free so it can be imported from src/convex/* without bundling
// browser-only code into the server.

export const GENERAL_MODELS = {
  "Gemini Flash": "gemini-3.5-flash",
  "Gemini Flash Lite": "gemini-3.1-flash-lite",
  "Gemini 2.5 Flash": "gemini-2.5-flash",
  "Astra (GPT-6)": "gpt-6-astra",
} as const;

export type GeneralModel = (typeof GENERAL_MODELS)[keyof typeof GENERAL_MODELS];

/** Default General-model when a conversation doesn't pin one. */
export const DEFAULT_GENERAL_MODEL: GeneralModel = GENERAL_MODELS["Gemini Flash"];

/** Human-readable label for a General-model value (falls back to the raw id). */
export function generalModelLabel(model: string): string {
  return (
    Object.entries(GENERAL_MODELS).find(([, value]) => value === model)?.[0] ??
    model
  );
}
