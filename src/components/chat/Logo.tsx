import { cn } from "@/lib/utils";

/** TwinMind brand mark — the official logo image. */
export function LogoMark({
  size = 36,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/logo.png"
      alt="TwinMind"
      className={cn(
        "shrink-0 rounded-[18%] object-cover",
        className,
      )}
      style={{ width: size, height: size }}
      draggable={false}
    />
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
