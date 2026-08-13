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
import { Switch } from "@/components/ui/switch";
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
  FileText,
  Loader2,
  Menu,
  Mic,
  PanelLeftClose,
  Paperclip,
  Plus,
  Send,
  Square,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
  start: () => void;
  stop: () => void;
};

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
  const [historyFilter, setHistoryFilter] = useState<"all" | Mode>("all");
  const [attachments, setAttachments] = useState<
    {
      storageId: string;
      name: string;
      type: string;
      size: number;
      preview?: string;
    }[]
  >([]);
  const [isRecording, setIsRecording] = useState(false);
  const [fastMode, setFastMode] = useState(() => {
    try {
      return localStorage.getItem("twinmind-fast-mode") === "1";
    } catch {
      return false;
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const activeConversation = useQuery(
    api.chat.getConversation,
    activeId ? { conversationId: activeId } : "skip",
  );
  const messages = useQuery(
    api.chat.getMessages,
    activeId ? { conversationId: activeId } : "skip",
  );

  const sendMessage = useAction(api.chat.sendMessage);
  const createConversation = useMutation(api.chat.createConversation);
  const deleteConversation = useMutation(api.chat.deleteConversation);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const didInit = useRef(false);

  // Keep the composer focused on desktop; on touch devices auto-focusing
  // pops the keyboard open over the chat, so leave it alone.
  const focusComposer = () => {
    if (window.matchMedia("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  };

  const activeMode: Mode = activeConversation?.mode ?? pendingMode;
  const accent = MODE_META[activeMode].accent;
  const ModeIcon = MODE_META[activeMode].icon;

  // While the backend streams the reply, the assistant's placeholder message
  // row carries the thinking indicator — so only show the trailing bubble when
  // the last row isn't already the streaming reply.
  const lastMessage = (messages ?? [])[(messages ?? []).length - 1];
  const showThinkingBubble =
    isThinking && lastMessage?.role !== "assistant";

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
    if (activeId) focusComposer();
  }, [activeId]);

  // Stop any in-flight speech recognition when leaving the page.
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  // Remember the Fast-mode preference across visits.
  useEffect(() => {
    try {
      localStorage.setItem("twinmind-fast-mode", fastMode ? "1" : "0");
    } catch {
      // storage unavailable — the preference just won't persist
    }
  }, [fastMode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isThinking, activeId]);

  const handleModeChange = (mode: Mode) => {
    setPendingMode(mode);
    // A conversation is locked to the mode it was created in. Switching minds
    // mid-conversation starts a fresh chat in the new mode instead of
    // re-labeling the existing one, so General and Hacking histories never
    // bleed into each other.
    if (activeConversation && mode !== activeConversation.mode) {
      setActiveId(null);
      setInput("");
      setAttachments((prev) => {
        prev.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
        return [];
      });
      focusComposer();
    }
  };

  const handleSend = async (preset?: string) => {
    const content = (preset ?? input).trim();
    if ((!content && attachments.length === 0) || isThinking) return;
    setIsThinking(true);
    setInput("");
    try {
      // For a brand-new chat, create the conversation up front and select it
      // immediately so the streaming reply is visible while it's generated,
      // instead of only appearing after the whole action finishes.
      let conversationId = activeId;
      if (conversationId === null) {
        conversationId = await createConversation({ mode: activeMode });
        setActiveId(conversationId);
      }
      await sendMessage({
        conversationId,
        mode: activeMode,
        content,
        fast: fastMode,
        ...(attachments.length > 0
          ? {
              attachments: attachments.map(
                ({ storageId, name, type, size }) => ({
                  storageId,
                  name,
                  type,
                  size,
                }),
              ),
            }
          : {}),
      });
    } catch (error) {
      console.error("Send failed:", error);
      toast.error("Message failed to send. Please try again.");
      setInput(content);
    } finally {
      setAttachments((prev) => {
        prev.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
        return [];
      });
      setIsThinking(false);
    }
  };

  /** Upload selected files to Convex storage and stage them as attachments. */
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const queue = Array.from(files);
    const staged: {
      storageId: string;
      name: string;
      type: string;
      size: number;
      preview?: string;
    }[] = [];
    for (const file of queue) {
      try {
        const uploadUrl = await generateUploadUrl();
        const response = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
        const { storageId } = (await response.json()) as { storageId: string };
        staged.push({
          storageId,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          preview: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
        });
      } catch (error) {
        console.error("Upload failed:", error);
        toast.error(`Could not upload ${file.name}`);
      }
    }
    setAttachments((prev) => [...prev, ...staged]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Toggle voice input using the browser's Web Speech API. */
  const toggleVoice = () => {
    const SR =
      (window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }).SpeechRecognition ??
      (window as unknown as {
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }).webkitSpeechRecognition;

    if (!SR) {
      toast.error(
        "Voice input isn't supported in this browser. Try Chrome or Edge.",
      );
      return;
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const e = event as {
        resultIndex: number;
        results: ArrayLike<{ [index: number]: { transcript: string } }>;
      };
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput((prev) =>
        prev ? `${prev} ${transcript}` : transcript,
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsRecording(false);
    };
    recognition.onerror = (event) => {
      const e = event as { error?: string };
      if (e.error === "not-allowed") {
        toast.error("Microphone access was denied.");
      } else if (e.error === "no-speech") {
        toast.error("No speech detected — try again.");
      }
      recognitionRef.current = null;
      setIsRecording(false);
    };
    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  const handleNewChat = () => {
    setActiveId(null);
    setPendingMode(historyFilter === "all" ? "general" : historyFilter);
    setInput("");
    setSidebarOpen(false);
    setAttachments((prev) => {
      prev.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
      return [];
    });
    focusComposer();
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
    !isBooting &&
    (activeId === null ||
      (messages !== undefined && (messages ?? []).length === 0));

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
          <Link to="/" aria-label="Go to TwinMind home">
            <Logo size={32} />
          </Link>
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
          <div className="mb-2 flex items-center gap-1 px-1">
            {(["all", "general", "hacking"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setHistoryFilter(filter)}
                className={cn(
                  "cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                  historyFilter === filter
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {filter === "all" ? "All" : MODE_META[filter].shortLabel}
              </button>
            ))}
          </div>
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
              {conversations
                .filter(
                  (conversation) =>
                    historyFilter === "all" ||
                    conversation.mode === historyFilter,
                )
                .map((conversation) => {
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
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium"
                          style={{
                            color: cMode.accent,
                            background: `${cMode.accent}1a`,
                          }}
                        >
                          <cMode.icon className="size-2.5" />
                          {cMode.shortLabel}
                        </span>
                        {conversationTime(conversation.updatedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Delete conversation"
                      className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md p-2 text-muted-foreground transition-all hover:bg-destructive/15 hover:text-destructive sm:pointer-events-none sm:p-1.5 sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(conversation._id);
                      }}
                    >
                      <Trash2 className="size-4 sm:size-3.5" />
                    </button>
                  </div>
                );
              })}
              {conversations.filter(
                (conversation) =>
                  historyFilter === "all" ||
                  conversation.mode === historyFilter,
              ).length === 0 && (
                <p className="px-2 py-3 text-[13px] leading-6 text-muted-foreground">
                  No {MODE_META[historyFilter as Mode]?.shortLabel.toLowerCase()}{" "}
                  conversations yet.
                </p>
              )}
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
          <p className="mt-2 px-2 text-center text-[10.5px] tracking-wide text-muted-foreground/60">
            Made &amp; developed by{" "}
            <span className="font-semibold text-foreground/75">RAGIB</span>
          </p>
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 bg-background/80 px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur sm:px-5">
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
          <div className="ml-auto flex items-center gap-1">
            {activeMode === "general" && (
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition-colors",
                  fastMode
                    ? "border-amber-400/40 bg-amber-400/10"
                    : "border-border/70 bg-card/70",
                )}
                title={
                  fastMode
                    ? "Fast replies on — using the lite model (gemini-3.1-flash-lite)"
                    : "Fast replies off — using the full model (gemini-3.5-flash)"
                }
              >
                <Zap
                  className={cn(
                    "size-3.5 transition-colors",
                    fastMode
                      ? "fill-amber-400/25 text-amber-400"
                      : "text-muted-foreground/70",
                  )}
                />
                <span
                  className={cn(
                    "hidden text-[11px] font-semibold sm:inline",
                    fastMode ? "text-amber-300" : "text-muted-foreground",
                  )}
                >
                  Fast
                </span>
                <Switch
                  checked={fastMode}
                  onCheckedChange={setFastMode}
                  className="scale-90"
                  aria-label="Toggle fast replies"
                />
              </div>
            )}
            {activeConversation && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 text-muted-foreground transition-colors hover:text-destructive lg:hidden"
                onClick={() => setDeleteTarget(activeConversation._id)}
                aria-label="Delete conversation"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
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
                {showThinkingBubble && <ThinkingBubble mode={activeMode} />}
              </div>
              <div ref={endRef} className="h-px" />
            </div>
          )}
        </div>

        {/* ---------- Composer ---------- */}
        <div className="border-t border-border/70 bg-background/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6 sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-3xl">
            <div
              className={cn(
                "flex flex-col gap-2 rounded-2xl border border-border/80 bg-card p-2 pl-4 transition-all focus-within:ring-2",
                activeMode === "hacking"
                  ? "focus-within:border-[var(--mode-hacking)]/50 focus-within:ring-[var(--mode-hacking)]/15"
                  : "focus-within:border-[var(--mode-general)]/50 focus-within:ring-[var(--mode-general)]/15",
              )}
            >
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <div
                      key={attachment.storageId}
                      className="group relative flex items-center gap-2 rounded-xl border border-border/70 bg-background/60 py-1 pl-1 pr-2"
                    >
                      {attachment.preview ? (
                        <img
                          src={attachment.preview}
                          alt={attachment.name}
                          className="size-10 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                          <FileText className="size-4" />
                        </span>
                      )}
                      <span className="max-w-32 truncate text-xs text-muted-foreground">
                        {attachment.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${attachment.name}`}
                        className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => {
                          setAttachments((prev) => {
                            const next = prev.filter(
                              (_, i) => i !== index,
                            );
                            if (attachment.preview) {
                              URL.revokeObjectURL(attachment.preview);
                            }
                            return next;
                          });
                        }}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.txt,.md,.zip,.py,.js,.json,.csv"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <div className="flex flex-col gap-0.5 pb-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 cursor-pointer rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach files"
                  >
                    <Paperclip className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-8 cursor-pointer rounded-lg transition-colors",
                      isRecording
                        ? "animate-pulse text-destructive"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={toggleVoice}
                    aria-label={isRecording ? "Stop recording" : "Voice input"}
                  >
                    {isRecording ? (
                      <Square className="size-3.5 fill-current" />
                    ) : (
                      <Mic className="size-4" />
                    )}
                  </Button>
                </div>
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
                    isRecording
                      ? "Listening… speak now"
                      : activeMode === "hacking"
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
                  disabled={
                    (!input.trim() && attachments.length === 0) || isThinking
                  }
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
            </div>
            <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground/70">
              <span>
                {isRecording
                  ? "Recording — click the stop button when done"
                  : activeMode === "hacking"
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
  const isUser = message.role === "user";
  // Each message remembers its own mode, so a General question stays labeled
  // General even if the toggle was switched later.
  const meta = MODE_META[message.mode ?? mode];
  const Icon = meta.icon;

  // An assistant message with no content yet is the streaming placeholder —
  // show the animated thinking bubble in its place until tokens arrive.
  if (!isUser && !message.content.trim()) {
    return <ThinkingBubble mode={message.mode ?? mode} />;
  }

  const renderAttachments = () =>
    message.attachments && message.attachments.length > 0 ? (
      <div className="mt-2.5 flex flex-wrap gap-2">
        {message.attachments.map((attachment) =>
          attachment.type.startsWith("image/") ? (
            <a
              key={attachment.storageId}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group relative block overflow-hidden rounded-lg border border-border/70"
            >
              <img
                src={attachment.url}
                alt={attachment.name}
                className="max-h-48 w-auto max-w-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              />
            </a>
          ) : (
            <span
              key={attachment.storageId}
              className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5 py-1.5 text-xs text-muted-foreground"
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{attachment.name}</span>
            </span>
          ),
        )}
      </div>
    ) : null;

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
            {renderAttachments()}
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
