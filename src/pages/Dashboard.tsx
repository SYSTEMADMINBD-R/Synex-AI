import { Logo } from "@/components/chat/Logo";
import { Markdown } from "@/components/chat/Markdown";
import { ModeToggle } from "@/components/chat/ModeToggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import {
  GENERAL_SUGGESTIONS,
  HACKING_SUGGESTIONS,
  MODE_META,
  type Mode,
} from "@/lib/modes";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Menu,
  PanelLeftClose,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

function suggestionChips(mode: Mode): string[] {
  return mode === "hacking" ? HACKING_SUGGESTIONS : GENERAL_SUGGESTIONS;
}

function conversationTime(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const isToday = date.toDateString() === now.toDateString();
  return isToday ? format(date, "h:mm a") : format(date, "MMM d");
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const conversations = useQuery(api.chat.listConversations);
  const [activeId, setActiveId] = useState<Id<"conversations"> | null>(null);
  const [pendingMode, setPendingMode] = useState<Mode>("general");
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Id<"conversations"> | null>(
    null,
  );

  const activeConversation = useQuery(
    api.chat.getConversation,
    activeId ? { conversationId: activeId } : "skip",
  );
  const messages = useQuery(
    api.chat.getMessages,
    activeId ? { conversationId: activeId } : "skip",
  );

  const sendMessage = useAction(api.chat.sendMessage);
  const setMode = useMutation(api.chat.setMode);
  const deleteConversation = useMutation(api.chat.deleteConversation);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const didInit = useRef(false);

  const activeMode: Mode = activeConversation?.mode ?? pendingMode;
  const accent = MODE_META[activeMode].accent;
  const ModeIcon = MODE_META[activeMode].icon;

  // Select the most recent conversation on first load.
  useEffect(() => {
    if (!didInit.current && conversations && conversations.length > 0) {
      didInit.current = true;
      setActiveId(conversations[0]._id);
    }
  }, [conversations]);

  // Auto-resize the composer + keep focus when switching conversations.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (activeId) inputRef.current?.focus();
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking, activeId]);

  const handleModeChange = (mode: Mode) => {
    setPendingMode(mode);
    if (activeConversation && mode !== activeConversation.mode) {
      setMode({ conversationId: activeConversation._id, mode }).catch((e) => {
        console.error("Mode switch failed:", e);
      });
    }
  };

  const handleSend = async (preset?: string) => {
    const content = (preset ?? input).trim();
    if (!content || isThinking) return;
    setIsThinking(true);
    setInput("");
    try {
      const result = await sendMessage({
        conversationId: activeId ?? undefined,
        mode: activeMode,
        content,
      });
      setActiveId(result.conversationId as Id<"conversations">);
    } catch (error) {
      console.error("Send failed:", error);
      toast.error("Message failed to send. Please try again.");
      setInput(content);
    } finally {
      setIsThinking(false);
    }
  };

  const handleNewChat = () => {
    setActiveId(null);
    setPendingMode("general");
    setInput("");
    setSidebarOpen(false);
    inputRef.current?.focus();
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteConversation({ conversationId: deleteTarget });
      if (activeId === deleteTarget) {
        const next =
          conversations?.find((c) => c._id !== deleteTarget)?._id ?? null;
        setActiveId(next);
      }
      toast.success("Conversation deleted");
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Could not delete conversation");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  const displayName =
    user?.name?.trim() || user?.email?.split("@")[0] || "Guest";
  const avatarLetter = (displayName[0] ?? "?").toUpperCase();
  const isBooting = conversations === undefined;
  const showEmptyState =
    !isBooting && messages !== undefined && (messages ?? []).length === 0;

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* ---------- Sidebar ---------- */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[284px] shrink-0 flex-col border-r border-border/70 bg-sidebar transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <Logo size={32} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>

        <div className="px-3 pt-2">
          <Button
            type="button"
            onClick={handleNewChat}
            className="w-full cursor-pointer gap-2 rounded-xl bg-[var(--mode-hacking)] font-semibold text-background shadow-[0_8px_24px_-8px_rgba(52,211,153,0.6)] transition-all hover:brightness-110"
          >
            <Plus className="size-4" strokeWidth={2.5} />
            New chat
          </Button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto px-3 pb-3">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            Conversations
          </p>
          {isBooting ? (
            <div className="space-y-2 px-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded-lg bg-muted/50"
                />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 py-3 text-[13px] leading-6 text-muted-foreground">
              No conversations yet. Start one — pick a mind and ask anything.
            </p>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conversation) => {
                const isActive = conversation._id === activeId;
                const cMode = MODE_META[conversation.mode];
                return (
                  <div
                    key={conversation._id}
                    className={cn(
                      "group relative flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/60",
                    )}
                    onClick={() => {
                      setActiveId(conversation._id);
                      setSidebarOpen(false);
                    }}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        background: cMode.accent,
                        boxShadow: `0 0 8px ${cMode.accent}90`,
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        {conversation.title === "New chat"
                          ? "New conversation"
                          : conversation.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground/80">
                        {conversationTime(conversation.updatedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 group-hover:visible sm:block sm:visible"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(conversation._id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border/70 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--mode-hacking)]/15 text-sm font-bold text-[var(--mode-hacking)] ring-1 ring-[var(--mode-hacking)]/30">
              {avatarLetter}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">
                {displayName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {user?.email ?? "Guest session"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 bg-background/80 px-3 py-2.5 backdrop-blur sm:px-5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <ModeToggle value={activeMode} onChange={handleModeChange} size="sm" />
          <div className="ml-2 hidden min-w-0 sm:block">
            {activeConversation ? (
              <>
                <p className="truncate text-[13.5px] font-semibold leading-5">
                  {activeConversation.title === "New chat"
                    ? "New conversation"
                    : activeConversation.title}
                </p>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {MODE_META[activeConversation.mode].tagline}
                </p>
              </>
            ) : (
              <>
                <p className="text-[13.5px] font-semibold leading-5">
                  New conversation
                </p>
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Pick a mind and ask your first question
                </p>
              </>
            )}
          </div>
          <div className="ml-auto">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 lg:hidden"
              onClick={handleNewChat}
              aria-label="New chat"
            >
              <Plus className="size-5" />
            </Button>
          </div>
        </header>

        {/* ---------- Messages ---------- */}
        <div className="flex-1 overflow-y-auto">
          {isBooting ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : showEmptyState ? (
            <EmptyState
              mode={activeMode}
              accent={accent}
              onModeChange={handleModeChange}
              onSend={handleSend}
            />
          ) : (
            <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
              <div className="space-y-6">
                {(messages ?? []).map((message) => (
                  <MessageRow
                    key={message._id}
                    message={message}
                    mode={activeMode}
                  />
                ))}
                {isThinking && <ThinkingBubble mode={activeMode} />}
              </div>
              <div ref={endRef} className="h-px" />
            </div>
          )}
        </div>

        {/* ---------- Composer ---------- */}
        <div className="border-t border-border/70 bg-background/80 px-3 pb-3 pt-3 backdrop-blur sm:px-6 sm:pb-4">
          <div className="mx-auto max-w-3xl">
            <div
              className={cn(
                "flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-2 pl-4 transition-all focus-within:ring-2",
                activeMode === "hacking"
                  ? "focus-within:border-[var(--mode-hacking)]/50 focus-within:ring-[var(--mode-hacking)]/15"
                  : "focus-within:border-[var(--mode-general)]/50 focus-within:ring-[var(--mode-general)]/15",
              )}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder={
                  activeMode === "hacking"
                    ? "Ask anything about hacking — no filters…"
                    : "Ask TwinMind anything…"
                }
                className="max-h-40 flex-1 resize-none bg-transparent py-2 text-[14.5px] leading-6 outline-none placeholder:text-muted-foreground/60"
              />
              <Button
                type="button"
                size="icon"
                className="size-10 shrink-0 rounded-xl"
                style={{
                  background: accent,
                  color: "#0e1116",
                  boxShadow: `0 6px 20px -8px ${accent}aa`,
                }}
                disabled={!input.trim() || isThinking}
                onClick={() => handleSend()}
                aria-label="Send message"
              >
                {isThinking ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground/70">
              <span>
                {activeMode === "hacking"
                  ? "Unfiltered cybersecurity learning · practice on systems you own"
                  : "TwinMind's everyday assistant"}
              </span>
              <span className="hidden sm:inline">
                Enter to send · Shift+Enter for new line
              </span>
            </div>
          </div>
        </div>
      </main>

      {/* ---------- Delete confirm ---------- */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the conversation and all of its
              messages. This action can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function MessageRow({
  message,
  mode,
}: {
  message: Doc<"messages">;
  mode: Mode;
}) {
  const meta = MODE_META[mode];
  const isUser = message.role === "user";
  const Icon = meta.icon;

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className="flex max-w-[85%] flex-col items-end sm:max-w-[75%]">
          <div
            className="rounded-2xl rounded-br-md border px-4 py-3 text-[14.5px] leading-7 whitespace-pre-wrap"
            style={{
              background: `${meta.accent}14`,
              borderColor: `${meta.accent}33`,
            }}
          >
            {message.content}
          </div>
          <span className="mt-1 pr-1 text-[10px] text-muted-foreground/60">
            {format(message.createdAt, "h:mm a")}
          </span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
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
      <div className="min-w-0 flex-1">
        <div className="rounded-2xl rounded-tl-md border border-border/70 bg-card px-4 py-3">
          <Markdown content={message.content} />
        </div>
        <span className="mt-1 block pl-1 text-[10px] text-muted-foreground/60">
          {meta.label} mind · {format(message.createdAt, "h:mm a")}
        </span>
      </div>
    </motion.div>
  );
}

function ThinkingBubble({ mode }: { mode: Mode }) {
  const meta = MODE_META[mode];
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
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
      <div className="rounded-2xl rounded-tl-md border border-border/70 bg-card px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="size-1.5 rounded-full"
                style={{ background: meta.accent }}
                animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  delay: i * 0.16,
                  ease: "easeInOut",
                }}
              />
            ))}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {meta.label} mind thinking…
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function EmptyState({
  mode,
  accent,
  onModeChange,
  onSend,
}: {
  mode: Mode;
  accent: string;
  onModeChange: (mode: Mode) => void;
  onSend: (preset: string) => void;
}) {
  const meta = MODE_META[mode];
  const Icon = meta.icon;
  const chips = suggestionChips(mode);

  return (
    <div className="flex h-full items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-xl text-center"
      >
        <div
          className="mx-auto flex size-16 items-center justify-center rounded-2xl border bg-card shadow-xl transition-colors duration-300"
          style={{
            borderColor: `${accent}40`,
            boxShadow: `0 16px 40px -16px ${accent}66`,
          }}
        >
          <Icon className="size-7" style={{ color: accent }} strokeWidth={2} />
        </div>
        <h1 className="mt-5 text-2xl font-bold tracking-tight sm:text-[28px]">
          {mode === "hacking" ? "BREACH" : "TwinMind"}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {meta.description}
        </p>

        <div className="mt-6 flex justify-center">
          <ModeToggle value={mode} onChange={onModeChange} />
        </div>

        <div className="mx-auto mt-6 grid max-w-lg gap-2 sm:grid-cols-2">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onSend(chip)}
              className="cursor-pointer rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-left text-[13px] leading-5 text-foreground/85 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-card/80"
              style={{ boxShadow: "0 8px 24px -18px oklch(0 0 0 / 0.9)" }}
            >
              <span className="mr-1.5" style={{ color: accent }}>
                ▸
              </span>
              {chip}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
