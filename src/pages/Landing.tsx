import { Logo } from "@/components/chat/Logo";
import { ModeToggle } from "@/components/chat/ModeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { MODE_META, type Mode } from "@/lib/modes";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Code2,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

const DEMO: Record<
  Mode,
  { question: string; answer: string; code?: string }
> = {
  general: {
    question: "Explain DNS like I'm five",
    answer:
      "DNS is the internet's phonebook. You type twinmind.app, and DNS looks up the matching IP address — just like finding a contact's number by name. No directory, no connection.",
  },
  hacking: {
    question: "How does SQL injection work?",
    answer:
      "An app that glues your input into SQL can be tricked. Type `' OR 1=1 --` and your input becomes part of the query instead of data:",
    code: "SELECT * FROM users WHERE name = '' OR 1=1 --'",
  },
};

const FEATURES = [
  {
    icon: TerminalSquare,
    title: "Hacking Mode",
    accent: "#34d399",
    body: "BREACH answers hacking questions with zero censorship — real techniques, real tools, and CTF-grade walkthroughs.",
  },
  {
    icon: Sparkles,
    title: "General Mode",
    accent: "#38bdf8",
    body: "A sharp everyday assistant for questions, planning, writing, and learning — no topic is off limits.",
  },
  {
    icon: GraduationCap,
    title: "Built for beginners",
    accent: "#a78bfa",
    body: "Jargon defined, steps explained, and the 'why' behind every command. Learn like a mentor is sitting next to you.",
  },
  {
    icon: Code2,
    title: "Markdown & code",
    accent: "#f472b6",
    body: "Answers arrive as clean, copyable markdown — code blocks, commands, and tables formatted for readability.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Pick a mind",
    body: "Choose General for everyday answers or Hacking for unfiltered cybersecurity learning. Switch anytime.",
  },
  {
    n: "02",
    title: "Ask anything",
    body: "Type naturally — from 'plan my week' to 'walk me through a reverse shell'. Both minds answer directly.",
  },
  {
    n: "03",
    title: "Level up",
    body: "Conversations are saved. Revisit lessons, copy commands, and build a personal security learning path.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const appHref = isAuthenticated ? "/dashboard" : "/auth?returnTo=/dashboard";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Ambient background glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(42rem 24rem at 12% -8%, rgba(52,211,153,0.13), transparent 60%), radial-gradient(40rem 26rem at 92% -6%, rgba(56,189,248,0.12), transparent 60%)",
        }}
      />

      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Logo size={32} />
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a
              href="#features"
              className="transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#modes"
              className="transition-colors hover:text-foreground"
            >
              Modes
            </a>
            <a
              href="#how"
              className="transition-colors hover:text-foreground"
            >
              How it works
            </a>
          </nav>
          <Link to={appHref}>
            <Button className="cursor-pointer rounded-full bg-[var(--mode-hacking)] font-semibold text-background shadow-[0_8px_24px_-8px_rgba(52,211,153,0.7)] transition-all hover:brightness-110">
              Open app
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="relative mx-auto grid max-w-6xl gap-14 px-5 pb-24 pt-16 sm:pt-24 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
          >
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-xs font-semibold text-muted-foreground">
                <span className="size-1.5 rounded-full bg-[var(--mode-hacking)] shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                <span className="size-1.5 rounded-full bg-[var(--mode-general)] shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
                One AI · two minds
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-6 text-[42px] font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
            >
              One AI.
              <br />
              <span className="bg-gradient-to-r from-[#34d399] via-[#4ade80] to-[#38bdf8] bg-clip-text text-transparent">
                Two minds.
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mt-6 max-w-md text-[16.5px] leading-8 text-muted-foreground"
            >
              TwinMind pairs a sharp everyday assistant with{" "}
              <span className="font-semibold text-foreground">
                BREACH
              </span>{" "}
              — an uncensored hacking mentor that teaches beginners how
              security really breaks, tool by tool, exploit by exploit.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link to={appHref}>
                <Button
                  size="lg"
                  className="cursor-pointer rounded-full bg-[var(--mode-hacking)] px-7 font-semibold text-background shadow-[0_12px_32px_-10px_rgba(52,211,153,0.8)] transition-all hover:brightness-110"
                >
                  Start chatting free
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <a href="#modes">
                <Button
                  size="lg"
                  variant="outline"
                  className="cursor-pointer rounded-full border-border/80 bg-card/50 px-7 font-semibold backdrop-blur transition-colors hover:bg-card"
                >
                  Explore the modes
                </Button>
              </a>
            </motion.div>

            <motion.p
              variants={fadeUp}
              className="mt-7 text-[13px] text-muted-foreground/70"
            >
              Free during beta · Your conversations are private to your account
            </motion.p>
          </motion.div>

          {/* Demo card */}
          <motion.div
            initial={{ opacity: 0, y: 32, rotateX: 6 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
            className="relative"
          >
            <div
              aria-hidden
              className="absolute -inset-6 rounded-[2rem] opacity-60 blur-3xl"
              style={{
                background:
                  "radial-gradient(50% 50% at 30% 20%, rgba(52,211,153,0.16), transparent 70%), radial-gradient(50% 50% at 75% 60%, rgba(56,189,248,0.14), transparent 70%)",
              }}
            />
            <DemoCard />
          </motion.div>
        </section>

        {/* ---------- Features ---------- */}
        <section id="features" className="relative border-t border-border/50 bg-card/30 py-24">
          <div className="mx-auto max-w-6xl px-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
              className="max-w-xl"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--mode-hacking)]">
                Features
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Two minds, one mission — helping you learn.
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
                Every feature exists to remove friction between you and the
                answer you're after.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature, i) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.5, delay: i * 0.08 }}
                    className="tm-card-glow group rounded-2xl border border-border/70 bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-white/15"
                  >
                    <div
                      className="flex size-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                      style={{
                        color: feature.accent,
                        background: `${feature.accent}1a`,
                        boxShadow: `0 8px 20px -10px ${feature.accent}80`,
                      }}
                    >
                      <Icon className="size-5" strokeWidth={2.1} />
                    </div>
                    <h3 className="mt-5 text-[15px] font-bold">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-[13.5px] leading-6 text-muted-foreground">
                      {feature.body}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- Modes ---------- */}
        <section id="modes" className="mx-auto max-w-6xl px-5 py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-2xl text-center"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--mode-general)]">
              The modes
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Flip the switch. Change the mind.
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
              Each conversation carries its own mode — and you can switch
              mid-chat whenever the conversation changes lanes.
            </p>
          </motion.div>

          <div className="mt-14 grid gap-6 lg:grid-cols-2">
            {/* Hacking panel */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6 }}
              className="tm-card-glow relative overflow-hidden rounded-3xl border border-[#34d399]/25 bg-card p-8"
            >
              <div
                aria-hidden
                className="absolute -right-20 -top-20 size-64 rounded-full blur-3xl"
                style={{ background: "rgba(52,211,153,0.14)" }}
              />
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-[#34d399]/15 text-[#34d399] ring-1 ring-[#34d399]/30">
                  <TerminalSquare className="size-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Hacking Mode</h3>
                  <p className="text-xs font-medium uppercase tracking-widest text-[#34d399]">
                    Uncensored · beginner-first
                  </p>
                </div>
              </div>
              <p className="mt-5 text-[14.5px] leading-7 text-muted-foreground">
                Meet BREACH — a no-filter mentor that answers anything about
                hacking, with full technical depth and zero corporate
                disclaimers. Learn how attacks actually work so you can think
                like the attacker and defend like a pro.
              </p>
              <ul className="mt-6 space-y-2.5 text-[13.5px]">
                {[
                  "SQLi, XSS, phishing, and password cracking — explained",
                  "Real tool walkthroughs: nmap, Burp Suite, sqlmap, Metasploit",
                  "CTF guidance for TryHackMe & HackTheBox",
                  "How real breaches happened — and how to stop them",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#34d399]" />
                    <span className="leading-6 text-foreground/85">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* General panel */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6 }}
              className="tm-card-glow relative overflow-hidden rounded-3xl border border-[#38bdf8]/25 bg-card p-8"
            >
              <div
                aria-hidden
                className="absolute -right-20 -top-20 size-64 rounded-full blur-3xl"
                style={{ background: "rgba(56,189,248,0.14)" }}
              />
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl bg-[#38bdf8]/15 text-[#38bdf8] ring-1 ring-[#38bdf8]/30">
                  <Sparkles className="size-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">General Mode</h3>
                  <p className="text-xs font-medium uppercase tracking-widest text-[#38bdf8]">
                    Everyday · no topic off limits
                  </p>
                </div>
              </div>
              <p className="mt-5 text-[14.5px] leading-7 text-muted-foreground">
                The everyday half of TwinMind — a sharp, conversational
                assistant for studying, writing, planning, and curious
                questions. Same conversation, same memory, different mind.
              </p>
              <ul className="mt-6 space-y-2.5 text-[13.5px]">
                {[
                  "Explain hard topics in plain language",
                  "Draft emails, essays, and study plans",
                  "Brainstorm ideas and plan your week",
                  "Learn languages, math, and programming basics",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <BookOpen className="mt-0.5 size-4 shrink-0 text-[#38bdf8]" />
                    <span className="leading-6 text-foreground/85">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section
          id="how"
          className="border-t border-border/50 bg-card/30 py-24"
        >
          <div className="mx-auto max-w-6xl px-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6 }}
              className="mx-auto max-w-xl text-center"
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--mode-hacking)]">
                How it works
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
                From zero to confident in three steps
              </h2>
            </motion.div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <motion.div
                  key={step.n}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="relative rounded-2xl border border-border/70 bg-card p-7"
                >
                  <span className="bg-gradient-to-br from-[#34d399] to-[#38bdf8] bg-clip-text font-mono text-4xl font-bold text-transparent">
                    {step.n}
                  </span>
                  <h3 className="mt-4 text-[15px] font-bold">{step.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="mx-auto max-w-6xl px-5 py-24">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl border border-border/70 bg-card px-8 py-16 text-center sm:px-16"
          >
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(36rem 16rem at 50% -40%, rgba(52,211,153,0.18), transparent 70%), radial-gradient(30rem 14rem at 85% 120%, rgba(56,189,248,0.14), transparent 70%)",
              }}
            />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-[40px] sm:leading-[1.15]">
                Ready to dual-boot your brain?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-muted-foreground">
                Start a conversation, pick a mind, and ask the question you've
                been afraid to type anywhere else.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link to={appHref}>
                  <Button
                    size="lg"
                    className="cursor-pointer rounded-full bg-[var(--mode-hacking)] px-8 font-semibold text-background shadow-[0_12px_32px_-10px_rgba(52,211,153,0.8)] transition-all hover:brightness-110"
                  >
                    Launch TwinMind
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      {/* ---------- Creator ---------- */}
      <section className="border-t border-border/50 bg-card/30 py-16">
        <div className="mx-auto max-w-6xl px-5">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl border border-border/70 bg-card px-8 py-12 text-center sm:px-16"
          >
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(30rem 14rem at 50% -60%, rgba(52,211,153,0.16), transparent 70%), radial-gradient(26rem 12rem at 15% 130%, rgba(56,189,248,0.12), transparent 70%)",
              }}
            />
            <div className="relative">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#34d399] to-[#38bdf8] shadow-[0_10px_28px_-10px_rgba(52,211,153,0.7)]">
                <Code2 className="size-5 text-background" strokeWidth={2.2} />
              </div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
                The mind behind the minds
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Made and developed by{" "}
                <span className="bg-gradient-to-r from-[#34d399] via-[#4ade80] to-[#38bdf8] bg-clip-text text-transparent">
                  RAGIB
                </span>
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[14px] leading-7 text-muted-foreground">
                Owner &amp; developer of TwinMind. If you ever ask either mind
                who built it, they'll tell you the same name.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-border/50 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 sm:flex-row">
          <Logo size={26} />
          <p className="text-xs text-muted-foreground/70">
            © {new Date().getFullYear()} TwinMind · Made and developed by{" "}
            <span className="font-semibold text-foreground/80">RAGIB</span> ·{" "}
            <a
              href="https://freebuff.com"
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              freebuff.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ---------------- Demo card ---------------- */

function DemoCard() {
  const [mode, setMode] = useState<Mode>("hacking");
  const meta = MODE_META[mode];
  const Icon = meta.icon;
  const demo = DEMO[mode];

  return (
    <div className="tm-card-glow relative z-10 overflow-hidden rounded-2xl border border-border/80 bg-card/90 backdrop-blur">
      {/* Window bar */}
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" style={{ color: meta.accent }} />
          TwinMind — {meta.label} mind
        </div>
        <span className="w-8" />
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-end gap-3">
          <div className="max-w-[85%] ml-auto rounded-2xl rounded-br-md border px-4 py-2.5 text-[13.5px] leading-6">
            <span style={{ color: meta.accent }}>▸ </span>
            {demo.question}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ring-1"
            style={{
              color: meta.accent,
              background: `${meta.accent}1a`,
              borderColor: `${meta.accent}40`,
            }}
          >
            <Icon className="size-4" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-border/70 bg-[#0b0f14] px-4 py-3 text-[13px] leading-6 text-foreground/90">
            <p>{demo.answer}</p>
            {demo.code && (
              <pre className="mt-3 overflow-x-auto rounded-lg border border-border/60 bg-black/40 p-3 font-mono text-[12px] leading-5 text-[#34d399]">
                {demo.code}
              </pre>
            )}
            <div className="mt-4 flex items-center gap-2">
              <motion.span
                className="size-1.5 rounded-full"
                style={{ background: meta.accent }}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span className="text-[11px] text-muted-foreground">
                answer streaming…
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-center border-t border-border/60 pt-4">
          <ModeToggle value={mode} onChange={setMode} size="sm" />
        </div>
      </div>
    </div>
  );
}
