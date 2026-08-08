import { cn } from "@/lib/utils";

/** TwinMind brand mark: a two-tone split square — green (hacking) and sky
 *  (general) — signalling the app's dual minds. */
export function LogoMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative shrink-0 rounded-[28%] border border-white/10 shadow-[0_8px_24px_-8px_rgba(52,211,153,0.45)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        background:
          "linear-gradient(135deg, #34d399 0%, #34d399 49.5%, #0e1116 49.5%, #0e1116 50.5%, #38bdf8 50.5%, #38bdf8 100%)",
      }}
      aria-hidden
    >
      <div className="absolute inset-0 rounded-[28%] ring-1 ring-inset ring-white/10" />
    </div>
  );
}

export function Logo({
  size = 36,
  showWordmark = true,
  className,
}: {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {showWordmark && (
        <span className="text-[17px] font-bold tracking-tight text-foreground">
          Twin<span className="text-[var(--mode-hacking)]">Mind</span>
        </span>
      )}
    </div>
  );
}
