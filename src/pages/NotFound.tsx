import { Logo } from "@/components/chat/Logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { ArrowLeft, Home, TerminalSquare } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  const { isAuthenticated } = useAuth();
  const homeHref = isAuthenticated ? "/dashboard" : "/";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Ambient background glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(40rem 24rem at 50% -10%, rgba(52,211,153,0.1), transparent 60%), radial-gradient(36rem 22rem at 85% 110%, rgba(56,189,248,0.08), transparent 60%)",
        }}
      />

      {/* Top bar */}
      <header className="relative z-10 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to={homeHref} aria-label="TwinMind home">
            <Logo size={32} />
          </Link>
          <Button
            asChild
            variant="outline"
            className="cursor-pointer rounded-full border-border/80 bg-card/50 font-medium backdrop-blur transition-colors hover:bg-card"
          >
            <Link to={homeHref}>
              <Home className="size-4" />
              Back to app
            </Link>
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative flex flex-1 items-center justify-center px-5 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center"
        >
          <div
            className="mx-auto flex size-16 items-center justify-center rounded-2xl border bg-card shadow-[0_16px_40px_-16px_rgba(52,211,153,0.4)]"
            style={{ borderColor: "rgba(52,211,153,0.25)" }}
          >
            <TerminalSquare className="size-7 text-[var(--mode-hacking)]" strokeWidth={2} />
          </div>

          <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.3em] text-[var(--mode-hacking)]">
            Error 404
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-6xl">
            Page not found
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-muted-foreground">
            This route doesn't exist — or it was moved, renamed, and left no
            trace behind. Even BREACH couldn't find it.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              className="cursor-pointer rounded-full bg-[var(--mode-hacking)] px-6 font-semibold text-background shadow-[0_10px_28px_-10px_rgba(52,211,153,0.8)] transition-all hover:brightness-110"
            >
              <Link to={homeHref}>
                <ArrowLeft className="size-4" />
                Go back home
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="cursor-pointer rounded-full border-border/80 bg-card/50 px-6 font-medium backdrop-blur transition-colors hover:bg-card"
            >
              <Link to="/dashboard">Open dashboard</Link>
            </Button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
