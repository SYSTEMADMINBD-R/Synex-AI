import { motion } from "framer-motion";
import { MODE_META, type Mode } from "@/lib/modes";
import { cn } from "@/lib/utils";

export function ModeToggle({
  value,
  onChange,
  size = "md",
}: {
  value: Mode;
  onChange: (mode: Mode) => void;
  size?: "sm" | "md";
}) {
  const modes = (Object.keys(MODE_META) as Mode[]).sort((a) =>
    a === "general" ? -1 : 1,
  );

  return (
    <div
      className={cn(
        "relative inline-flex items-center rounded-full border border-border/80 bg-muted/50 p-1",
        size === "sm" ? "h-9" : "h-11",
      )}
      role="tablist"
      aria-label="AI mode"
    >
      {modes.map((mode) => {
        const meta = MODE_META[mode];
        const active = value === mode;
        const Icon = meta.icon;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(mode)}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-full px-3.5 font-medium transition-colors duration-200 sm:px-4",
              size === "sm" ? "text-xs" : "text-sm",
              active
                ? "text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 -z-10 rounded-full shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${meta.accent}, ${meta.accent}cc)`,
                  boxShadow: `0 4px 20px -6px ${meta.accent}80`,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <Icon
              className={size === "sm" ? "size-3.5" : "size-4"}
              strokeWidth={2.2}
            />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
