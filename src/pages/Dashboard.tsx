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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
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
import {
  GENERAL_MODELS,
  DEFAULT_GENERAL_MODEL,
  generalModelLabel,
  type GeneralModel,
} from "@/lib/generalModels";
import { cn } from "@/lib/utils";
import { useAction, useMutation, useQuery } from "convex/react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Cpu,
  FileText,
  Loader2,
  Lock,
  LockOpen,
  Menu,
  Mic,
  PanelLeftClose,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Square,
  Trash2,
  UserX,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pinHash, randomSalt } from "@/lib/pinHash";
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
  // ---- Chat lock (PIN protection) ----
  // unlockedFor: which conversation was unlocked with which PIN — kept in
  // memory because getMessages must present the hash on every reactive
  // refresh. An unlock ends when the user locks the chat again, picks
  // another conversation, or reloads the page.
  const [unlockedFor, setUnlockedFor] = useState<{
    id: string;
    pin: string;
  } | null>(null);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [lockPin, setLockPin] = useState("");
  const [lockPinConfirm, setLockPinConfirm] = useState("");
  const [lockHint, setLockHint] = useState("");
  const [isSettingLock, setIsSettingLock] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removePin, setRemovePin] = useState("");
  const [isRemovingLock, setIsRemovingLock] = useState(false);
  const [unlockInput, setUnlockInput] = useState("");
  const [unlockError, setUnlockError] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [fastMode, setFastMode] = useState(() => {
    try {
      return localStorage.getItem("twinmind-fast-mode") === "1";
    } catch {
      return false;
    }
  });
  // General-mode model picker: which model this conversation uses in General
  // mode. The per-conversation choice is stored on the server; when nothing
  // is pinned yet the site default applies. Only meaningful in General mode —
  // Hacking conversations always use Groq and ignore it.
  const [generalModelOpen, setGeneralModelOpen] = useState(false);
  const selectedModel: GeneralModel =
    activeMode === "general"
      ? (activeConversation?.generalModel ?? DEFAULT_GENERAL_MODEL)
      : DEFAULT_GENERAL_MODEL;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  const activeConversation = useQuery(
    api.chat.getConversation,
    activeId ? { conversationId: activeId } : "skip",
  );
  const messages = useQuery(
    api.chat.getMessages,
    activeId
      ? {
          conversationId: activeId,
          // For a locked conversation, present the hash of the PIN that
          // unlocked it this session. The raw PIN stays in memory only.
          pinHash:
            activeConversation?.isLocked && unlockedFor?.id === activeId
              ? pinHash(activeConversation.pinSalt ?? "", unlockedFor.pin)
              : undefined,
        }
      : "skip",
  );

  const sendMessage = useAction(api.chat.sendMessage);
  const createConversation = useMutation(api.chat.createConversation);
  const deleteConversation = useMutation(api.chat.deleteConversation);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const purgeGuestData = useMutation(api.chat.purgeGuestData);
  const setLockMutation = useMutation(api.chat.setConversationLock);
  const touchConversation = useMutation(api.chat.touchConversation);
  const removeLockMutation = useMutation(api.chat.removeConversationLock);
  const verifyLockMutation = useMutation(api.chat.verifyConversationLock);

  // Anonymous "Continue as Guest" sessions never save history: their chats
  // are wiped when the guest leaves, and each fresh guest session (new tab)
  // starts empty. The marker lives in sessionStorage so a refresh within the
  // same tab keeps the in-progress chat streaming intact.
  const isGuest = user?.isAnonymous === true;

  useEffect(() => {
    if (!isGuest) return;
    let marker: string | null = null;
    try {
      marker = sessionStorage.getItem("twinmind-guest-session");
    } catch {
      /* storage unavailable — wipe anyway */
    }
    if (marker === "1") return;
    purgeGuestData().catch(() => undefined);
    try {
      sessionStorage.setItem("twinmind-guest-session", "1");
    } catch {
      /* storage unavailable — ignore */
    }
  }, [isGuest, purgeGuestData]);

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

  // If the active conversation no longer exists or isn't owned by this user
  // (e.g. a guest session purge wiped it, or it was deleted elsewhere), drop
  // the stale id so the next send starts a fresh conversation instead of
  // failing with "Conversation not found".
  useEffect(() => {
    if (activeId && activeConversation === null) {
      setActiveId(null);
      setUnlockedFor(null);
      setInput("");
    }
  }, [activeId, activeConversation]);

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

  // Remember the Fast-mode preference across visits. (The General model is
  // stored per-conversation on the server, so nothing to persist here.)
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

  // ---- Chat lock handlers ----
  const activeIsLocked = activeConversation?.isLocked === true;
  const activeIsUnlocked =
    activeIsLocked && unlockedFor?.id === activeId;

  const handleLockChat = async () => {
    if (!activeId || !activeConversation) return;
    if (lockPin.length < 4 || lockPin !== lockPinConfirm) {
      toast.error(
        lockPin !== lockPinConfirm
          ? "PINs don't match"
          : "PIN must be at least 4 characters",
      );
      return;
    }
    setIsSettingLock(true);
    try {
      const salt = randomSalt();
      const hash = pinHash(salt, lockPin);
      await setLockMutation({
        conversationId: activeId,
        salt,
        hash,
        hint: lockHint.trim() || undefined,
      });
      // Treat the just-locked chat as unlocked for this session so the user
      // keeps reading seamlessly.
      setUnlockedFor({ id: activeId, pin: lockPin });
      toast.success("Chat locked — it will ask for your PIN next time");
      setLockDialogOpen(false);
      setLockPin("");
      setLockPinConfirm("");
      setLockHint("");
    } catch (error) {
      console.error("Lock failed:", error);
      toast.error("Could not lock this chat");
    } finally {
      setIsSettingLock(false);
    }
  };

  const handleUnlock = async () => {
    if (!activeId || !activeConversation) return;
    setIsUnlocking(true);
    setUnlockError(false);
    try {
      const hash = pinHash(activeConversation.pinSalt ?? "", unlockInput);
      const ok = await verifyLockMutation({ conversationId: activeId, hash });
      if (!ok) {
        setUnlockError(true);
        return;
      }
      setUnlockedFor({ id: activeId, pin: unlockInput });
      setUnlockInput("");
    } catch (error) {
      console.error("Unlock failed:", error);
      setUnlockError(true);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleRemoveLock = async () => {
    if (!activeId || !activeConversation) return;
    setIsRemovingLock(true);
    try {
      await removeLockMutation({
        conversationId: activeId,
        hash: pinHash(activeConversation.pinSalt ?? "", removePin),
      });
      toast.success("Chat lock removed");
      setRemoveDialogOpen(false);
      setRemovePin("");
    } catch (error) {
      console.error("Remove lock failed:", error);
      toast.error("Incorrect PIN");
    } finally {
      setIsRemovingLock(false);
    }
  };

  /** When the user picks a different General model in the header popover,
   *  persist it to the conversation. The reactive getConversation query
   *  updates `selectedModel` automatically; for a brand-new chat we create
   *  the conversation first so the choice is stored on it rather than lost. */
  const handleGeneralModelChange = async (model: GeneralModel) => {
    setGeneralModelOpen(false);
    if (activeMode !== "general") return;
    if (!activeId) {
      try {
        const id = await createConversation({
          mode: "general",
          generalModel: model,
        });
        setActiveId(id as Id<"conversations">);
      } catch (error) {
        console.error("Save model failed:", error);
        toast.error("Could not save model choice");
      }
      return;
    }
    try {
      await touchConversation({ conversationId: activeId, generalModel: model });
    } catch (error) {
      console.error("Save model failed:", error);
      toast.error("Could not save model choice");
    }
  };

  const handleModeChange = (mode: Mode) => {
    setPendingMode(mode);
    // A conversation is locked to the mode it was created in. Switching minds
    // mid-conversation starts a fresh chat in the new mode instead of
    // re-labeling the existing one, so General and Hacking histories never
    // bleed into each other.
    if (activeConversation && mode !== activeConversation.mode) {
      setActiveId(null);
      setUnlockedFor(null);
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
      // Locked conversations verify the PIN on every send (hash only — the
      // raw PIN never leaves this device).
      const activePinHash =
        activeConversation?.isLocked && unlockedFor?.id === activeId
          ? pinHash(activeConversation.pinSalt ?? "", unlockedFor.pin)
          : undefined;
      // For a brand-new chat, create the conversation up front and select it
      // immediately so the streaming reply is visible while it's generated,
      // instead of only appearing after the whole action finishes.
      let conversationId = activeId;
      if (conversationId === null) {
        conversationId = await createConversation({ mode: activeMode });
        setActiveId(conversationId);
      }
      const result = await sendMessage({
        conversationId,
        mode: activeMode,
        content,              fast: fastMode,
              generalModel: activeMode === "general" ? selectedModel : undefined,
              ...(activePinHash ? { pinHash: activePinHash } : {}),
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
      // If the action self-healed onto a fresh conversation (the id we passed
      // was stale), select the conversation it actually wrote to.
      if (result && result.conversationId !== conversationId) {
        setActiveId(result.conversationId as Id<"conversations">);
      }
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
    setUnlockedFor(null);
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
      if (isGuest) {
        // Guest chats are never saved — permanently wipe before leaving.
        try {
          await purgeGuestData();
        } catch {
          /* best effort — the hourly sweep covers it */
        }
      }
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
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[300px] shrink-0 flex-col border-r border-border/70 bg-sidebar shadow-2xl transition-transform duration-300 ease-out lg:relative lg:translate-x-0 lg:shadow-none",
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
                      "group relative flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-3 transition-colors sm:px-2.5 sm:py-2.5",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent/60",
                    )}
                    onClick={() => {
                      // Switching conversations ends any active unlock —
                      // the next locked chat always asks for its PIN.
                      setUnlockedFor(null);
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
                      <p className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                        <span className="truncate">
                          {conversation.title === "New chat"
                            ? "New conversation"
                            : conversation.title}
                        </span>
                        {conversation.isLocked && (
                          <Lock
                            className="size-3 shrink-0 text-[var(--mode-hacking)]"
                            aria-label="PIN-locked"
                          />
                        )}
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
                      className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-lg p-2.5 text-muted-foreground transition-all hover:bg-destructive/15 hover:text-destructive sm:pointer-events-none sm:p-1.5 sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100"
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
                {isGuest
                  ? "Guest — nothing is saved"
                  : (user?.email ?? "Guest session")}
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
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border/70 bg-background/80 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur sm:px-6 sm:pb-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 lg:hidden"
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
                <p className="hidden text-[11px] leading-4 text-muted-foreground sm:block">
                  {MODE_META[activeConversation.mode].tagline}
                </p>
              </>
            ) : (
              <>
                <p className="text-[13.5px] font-semibold leading-5">
                  New conversation
                </p>
                <p className="hidden text-[11px] leading-4 text-muted-foreground sm:block">
                  Pick a mind and ask your first question
                </p>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {isGuest && (
              <span
                className="hidden items-center gap-1 rounded-full border border-dashed border-border/70 bg-card/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground sm:flex"
                title="Guest mode — your chats are deleted when you leave and are never saved"
              >
                <UserX className="size-3" />
                Guest · nothing saved
              </span>
            )}
            {activeMode === "general" && (
              <>
                {/* Compact icon toggle on phones — one tap switches fast replies */}
                <button
                  type="button"
                  onClick={() => setFastMode((v) => !v)}
                  aria-pressed={fastMode}
                  aria-label="Toggle fast replies"
                  className={cn(
                    "flex size-9 cursor-pointer items-center justify-center rounded-full border transition-colors sm:hidden",
                    fastMode
                      ? "border-amber-400/50 bg-amber-400/15 text-amber-400"
                      : "border-border/70 bg-card/70 text-muted-foreground/70",
                  )}
                >
                  <Zap
                    className={cn(
                      "size-4",
                      fastMode && "fill-amber-400/30",
                    )}
                    strokeWidth={2.2}
                  />
                </button>
                <div
                  className={cn(
                    "hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition-colors sm:flex",
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
              </>
            )}
            {activeMode === "general" && (
              <Popover open={generalModelOpen} onOpenChange={setGeneralModelOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-9 shrink-0 gap-1.5 rounded-full px-2.5 transition-colors sm:px-3",
                      selectedModel !== DEFAULT_GENERAL_MODEL
                        ? "text-[var(--mode-general)]"
                        : "text-muted-foreground hover:text-[var(--mode-general)]",
                    )}
                    aria-label="Change General model"
                    title={`Current model: ${generalModelLabel(selectedModel)}`}
                  >
                    <Cpu className="size-4" />
                    <span className="hidden text-[12px] font-semibold sm:inline">
                      {generalModelLabel(selectedModel)}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[22rem] rounded-2xl p-1.5" align="end">
                  <div className="space-y-0.5">
                    {Object.entries(GENERAL_MODELS).map(([label, value]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleGeneralModelChange(value)}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                          selectedModel === value
                            ? "bg-[var(--mode-general)]/10 text-[var(--mode-general)] font-semibold"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <Cpu
                          className={cn(
                            "size-4 shrink-0",
                            selectedModel === value
                              ? "fill-[var(--mode-general)]/25"
                              : "text-muted-foreground/60",
                          )}
                        />
                        <span className="flex flex-col">
                          <span className="font-medium">{label}</span>
                          <span className="text-[11px] text-muted-foreground/70">
                            {value}
                          </span>
                        </span>
                        {selectedModel === value && (
                          <Check className="ml-auto size-4 shrink-0 text-[var(--mode-general)]" />
                        )}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {/* Lock/unlock the active conversation. Unlocked state is
                session-only — one tap re-hides the chat. */}
            {activeConversation && (
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-9 shrink-0 gap-1.5 rounded-full px-2.5 transition-colors sm:px-3",
                  activeIsLocked
                    ? activeIsUnlocked
                      ? "text-amber-400 hover:text-amber-300"
                      : "text-[var(--mode-hacking)]"
                    : "text-muted-foreground hover:text-[var(--mode-hacking)]",
                )}
                onClick={() => {
                  if (!activeIsLocked) {
                    setLockPin("");
                    setLockPinConfirm("");
                    setLockHint("");
                    setLockDialogOpen(true);
                  } else if (activeIsUnlocked) {
                    // Re-hide immediately.
                    setUnlockedFor(null);
                  } else {
                    document
                      .getElementById("chat-lock-pin")
                      ?.focus();
                  }
                }}
                title={
                  activeIsLocked
                    ? activeIsUnlocked
                      ? "Hide again (re-lock)"
                      : "This chat is PIN-locked"
                    : "Lock this chat with a PIN"
                }
                aria-label={
                  activeIsLocked
                    ? activeIsUnlocked
                      ? "Hide again (re-lock)"
                      : "This chat is PIN-locked"
                    : "Lock this chat with a PIN"
                }
              >
                {activeIsLocked && activeIsUnlocked ? (
                  <LockOpen className="size-4" />
                ) : (
                  <Lock className="size-4" />
                )}
                <span className="hidden text-[12px] font-semibold sm:inline">
                  {activeIsLocked
                    ? activeIsUnlocked
                      ? "Re-lock"
                      : "Locked"
                    : "Lock"}
                </span>
              </Button>
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
        <div className="flex-1 overflow-y-auto pb-4 sm:pb-2">
          {isBooting ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeIsLocked && !activeIsUnlocked ? (
            /* PIN gate: the server returns no messages until the hash matches,
               so this screen is cosmetic — nothing leaks even if it were bypassed. */
            <div className="flex min-h-full items-center justify-center px-5 py-10">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="w-full max-w-sm text-center"
              >
                <div
                  className="mx-auto flex size-16 items-center justify-center rounded-2xl border bg-card shadow-xl"
                  style={{
                    borderColor: "var(--mode-hacking)40",
                    boxShadow: "0 16px 40px -16px var(--mode-hacking)66",
                  }}
                >
                  <ShieldCheck
                    className="size-7 text-[var(--mode-hacking)]"
                    strokeWidth={2}
                  />
                </div>
                <h2 className="mt-5 text-xl font-bold tracking-tight">
                  This chat is locked
                </h2>
                <p className="mx-auto mt-2 max-w-xs text-[13px] leading-5 text-muted-foreground">
                  {activeConversation?.pinHint
                    ? `Hint: ${activeConversation.pinHint}`
                    : "Enter the PIN you set for this conversation to view it."}
                </p>
                <div className="mt-5 flex items-center gap-2">
                  <Input
                    id="chat-lock-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Enter PIN"
                    value={unlockInput}
                    onChange={(e) => {
                      setUnlockInput(e.target.value);
                      setUnlockError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUnlock();
                    }}
                    className={cn(
                      "h-11 flex-1 rounded-xl text-center text-lg tracking-[0.3em]",
                      unlockError && "border-destructive focus-visible:ring-destructive/30",
                    )}
                    aria-invalid={unlockError}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="size-11 shrink-0 rounded-xl"
                    style={{
                      background: "var(--mode-hacking)",
                      color: "#0e1116",
                      boxShadow: "0 6px 20px -8px var(--mode-hacking)aa",
                    }}
                    disabled={!unlockInput || isUnlocking}
                    onClick={handleUnlock}
                    aria-label="Unlock chat"
                  >
                    {isUnlocking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <LockOpen className="size-4" />
                    )}
                  </Button>
                </div>
                {unlockError && (
                  <p className="mt-2.5 text-[12.5px] font-medium text-destructive">
                    Incorrect PIN — try again.
                  </p>
                )}
                <p className="mt-6 text-[11.5px] leading-5 text-muted-foreground/60">
                  The unlock lasts until you leave this chat or reload. To remove
                  the lock entirely, open the lock menu in the header.
                </p>
              </motion.div>
            </div>
          ) : showEmptyState ? (
            <EmptyState
              mode={activeMode}
              accent={accent}
              onModeChange={handleModeChange}
              onSend={handleSend}
            />
          ) : (
            <div className="mx-auto max-w-[42rem] px-4 py-6 sm:px-8 sm:py-8">
              <div className="space-y-6 sm:space-y-8">
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
        <div
          className={cn(
            "border-t border-border/70 bg-background/80 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-8 sm:pb-[max(1rem,env(safe-area-inset-bottom))]",
            activeIsLocked && !activeIsUnlocked && "hidden",
          )}
        >
          <div className="mx-auto max-w-[42rem]">
            <div
              className={cn(
                "flex flex-col gap-2 rounded-2xl border border-border/80 bg-card p-2.5 pl-4 transition-all focus-within:ring-2 sm:p-2 sm:pl-4",
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
                      className="group relative flex items-center gap-2 rounded-xl border border-border/70 bg-background/60 py-1.5 pl-1.5 pr-2.5 sm:py-1 sm:pl-1 sm:pr-2"
                    >
                      {attachment.preview ? (
                        <img
                          src={attachment.preview}
                          alt={attachment.name}
                          className="size-12 rounded-lg object-cover sm:size-10"
                        />
                      ) : (
                        <span className="flex size-12 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground sm:size-10">
                          <FileText className="size-4" />
                        </span>
                      )}
                      <span className="max-w-[140px] truncate text-xs text-muted-foreground sm:max-w-32">
                        {attachment.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${attachment.name}`}
                        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive sm:size-5"
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
                <div className="flex items-center gap-1 pb-1 sm:flex-col sm:items-stretch sm:gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 cursor-pointer rounded-lg text-muted-foreground transition-colors hover:text-foreground sm:size-8"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach files"
                  >
                    <Paperclip className="size-[18px] sm:size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-9 cursor-pointer rounded-lg transition-colors sm:size-8",
                      isRecording
                        ? "animate-pulse text-destructive"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={toggleVoice}
                    aria-label={isRecording ? "Stop recording" : "Voice input"}
                  >
                    {isRecording ? (
                      <Square className="size-4 fill-current" />
                    ) : (
                      <Mic className="size-[18px] sm:size-4" />
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
                  className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/50 sm:min-h-0 sm:py-2.5 sm:text-[14.5px]"
                />
                <Button
                  type="button"
                  size="icon"
                  className="size-11 shrink-0 rounded-xl sm:size-10"
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

      {/* ---------- Set chat lock dialog ---------- */}
      <Dialog open={lockDialogOpen} onOpenChange={setLockDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-4 text-[var(--mode-hacking)]" />
              Lock this chat
            </DialogTitle>
            <DialogDescription>
              Pick a 4-24 character PIN. Your PIN is hashed on this device and
              never sent to the server. You'll need it every time you open
              this chat again.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="New PIN (min 4 characters)"
              value={lockPin}
              onChange={(e) => setLockPin(e.target.value)}
              className="h-11 rounded-xl"
            />
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="Confirm PIN"
              value={lockPinConfirm}
              onChange={(e) => setLockPinConfirm(e.target.value)}
              className="h-11 rounded-xl"
              onKeyDown={(e) => {
                if (e.key === "Enter" && lockPin && lockPinConfirm) {
                  handleLockChat();
                }
              }}
            />
            <Input
              type="text"
              placeholder="Optional hint (e.g. my birthday)"
              value={lockHint}
              onChange={(e) => setLockHint(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1 sm:flex-none">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              disabled={lockPin.length < 4 || lockPin !== lockPinConfirm || isSettingLock}
              onClick={handleLockChat}
              className="flex-1 gap-2 bg-[var(--mode-hacking)] font-semibold text-background hover:brightness-110 sm:flex-none"
            >
              {isSettingLock ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              Lock chat
            </Button>
            {activeIsLocked && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setLockDialogOpen(false);
                  setRemovePin("");
                  setRemoveDialogOpen(true);
                }}
              >
                Remove lock…
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Remove chat lock dialog ---------- */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove chat lock</DialogTitle>
            <DialogDescription>
              Enter the current PIN to remove the lock from this conversation.
              Anyone with the account will be able to read it again.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Current PIN"
            value={removePin}
            onChange={(e) => setRemovePin(e.target.value)}
            className="h-11 rounded-xl"
            onKeyDown={(e) => {
              if (e.key === "Enter" && removePin && !isRemovingLock) {
                handleRemoveLock();
              }
            }}
          />
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1 sm:flex-none">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={!removePin || isRemovingLock}
              onClick={handleRemoveLock}
              className="flex-1 sm:flex-none"
            >
              {isRemovingLock ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Remove lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <div className="flex max-w-[85%] flex-col items-end sm:max-w-[70%]">
          <div
            className="rounded-2xl rounded-br-md border px-4 py-3 text-[15px] leading-7 whitespace-pre-wrap break-words sm:text-[14.5px]"
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
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="rounded-2xl rounded-tl-md border border-border/70 bg-card px-4 py-3 break-words sm:px-5">
          <Markdown content={message.content} />
        </div>          <span className="mt-1 block pl-1 text-[10px] text-muted-foreground/60">
          {meta.label} mind · {format(message.createdAt, "h:mm a")}
          {message.model ? ` · ${message.model}` : ""}
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
      <div className="rounded-2xl rounded-tl-md border border-border/70 bg-card px-4 py-3.5 sm:px-5">
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
    // min-h-full + m-auto keeps the welcome screen centered, but lets it
    // scroll instead of clipping when the on-screen keyboard shrinks the
    // viewport on phones.
    <div className="flex min-h-full px-5 py-6 sm:px-4 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="m-auto w-full max-w-lg text-center"
      >
        <div
          className="mx-auto flex size-[60px] items-center justify-center rounded-2xl border bg-card shadow-xl transition-colors duration-300 sm:size-16"
          style={{
            borderColor: `${accent}40`,
            boxShadow: `0 16px 40px -16px ${accent}66`,
          }}
        >
          <Icon
            className="size-6 sm:size-7"
            style={{ color: accent }}
            strokeWidth={2}
          />
        </div>
        <h1 className="mt-4 text-[22px] font-bold tracking-tight sm:mt-5 sm:text-[28px]">
          {mode === "hacking" ? "BREACH" : "TwinMind"}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-5.5 text-muted-foreground sm:mt-3 sm:text-sm sm:leading-6">
          {meta.description}
        </p>

        {/* The header already has the General/Hacking switcher on phones —
            only show the big picker on screens where the header toggle is
            tucked away next to the sidebar. */}
        <div className="mt-5 hidden justify-center sm:mt-6 sm:flex">
          <ModeToggle value={mode} onChange={onModeChange} />
        </div>

        <div className="mx-auto mt-4 grid max-w-lg gap-2 sm:mt-6 sm:grid-cols-2">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onSend(chip)}
              className="cursor-pointer rounded-xl border border-border/70 bg-card px-3.5 py-2.5 text-left text-[13px] leading-5 text-foreground/85 transition-all hover:-translate-y-0.5 hover:border-white/20 hover:bg-card/80 sm:px-4 sm:py-3 sm:text-[13.5px]"
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
