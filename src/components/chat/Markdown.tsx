import { Check, Copy } from "lucide-react";
import {
  isValidElement,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

function getText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) return node.map(getText).join("");
  if (isValidElement(node)) {
    return getText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function CodeBlock({ children, className }: { children?: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => getText(children), [children]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border/70 bg-[#0b0f14] shadow-sm">
      <div className="flex items-center justify-between border-b border-border/60 bg-white/[0.02] px-3.5 py-2">
        <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {className ?? "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-[var(--mode-hacking)]" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}

const components: Components = {
  pre: ({ children }) => {
    // Pull the language from the child <code className="language-xxx">.
    const codeChild = isValidElement(children)
      ? (children as ReactElement<{ className?: string }>)
      : null;
    const match = /language-([\w+-]+)/.exec(codeChild?.props?.className ?? "");
    return <CodeBlock className={match?.[1]}>{children}</CodeBlock>;
  },
  code: ({ className, children }) => {
    if (!className) {
      return (
        <code className="mx-0.5 rounded-md border border-border/60 bg-muted/70 px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--mode-hacking)]">
          {children}
        </code>
      );
    }
    return (
      <code className="font-mono text-[13px] leading-relaxed">{children}</code>
    );
  },
  p: ({ children }) => <p className="my-2.5 leading-7">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[var(--mode-hacking)] underline decoration-[var(--mode-hacking)]/40 underline-offset-2 transition-colors hover:decoration-[var(--mode-hacking)]"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-lg font-bold tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-base font-bold tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-[15px] font-semibold">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-3 text-sm font-semibold">{children}</h4>
  ),
  ul: ({ children }) => (
    <ul className="my-2.5 list-disc space-y-1.5 pl-6 marker:text-muted-foreground/50">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2.5 list-decimal space-y-1.5 pl-6 marker:text-muted-foreground/50">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 rounded-r-lg border-l-2 border-[var(--mode-hacking)]/60 bg-muted/40 py-1 pl-4 pr-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-border/70" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border/70">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/50 text-left">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border-b border-border/70 px-3 py-2 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border/50 px-3 py-2 align-top">{children}</td>
  ),
};

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("text-[14.5px] text-foreground/90", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
