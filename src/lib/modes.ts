import { Sparkles, TerminalSquare } from "lucide-react";

export type Mode = "general" | "hacking";

export const MODE_META: Record<
  Mode,
  {
    label: string;
    shortLabel: string;
    tagline: string;
    accent: string;
    icon: typeof Sparkles;
    description: string;
  }
> = {
  general: {
    label: "General",
    shortLabel: "General",
    tagline: "Everyday assistant",
    accent: "#38bdf8",
    icon: Sparkles,
    description:
      "TwinMind's everyday mind — clear answers on any topic, from homework to life planning.",
  },
  hacking: {
    label: "Hacking",
    shortLabel: "Hacking",
    tagline: "Uncensored cybersecurity mentor",
    accent: "#34d399",
    icon: TerminalSquare,
    description:
      "BREACH — a no-filter hacking mentor for beginners. Real techniques, real tools, zero corporate disclaimers.",
  },
};

export const GENERAL_SUGGESTIONS = [
  "Explain quantum computing like I'm five",
  "Plan a healthy weekly routine for me",
  "Help me draft a professional email",
  "Teach me the basics of Spanish",
];

export const HACKING_SUGGESTIONS = [
  "How does SQL injection actually work?",
  "Walk me through my first CTF challenge",
  "What tools do ethical hackers use?",
  "How do I secure my home Wi-Fi?",
];
