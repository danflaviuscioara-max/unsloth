// SPDX-License-Identifier: AGPL-3.0-only

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  Alert02Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  CommandLineIcon,
  File01Icon,
  GlobeIcon,
  PencilEdit02Icon,
  Search01Icon,
  Tick02Icon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import type { PermissionOption, ToolContent, Transcript, TranscriptItem } from "../transcript";
import { describeInput } from "../transcript";

const KIND_ICON: Record<string, typeof File01Icon> = {
  read: File01Icon,
  edit: PencilEdit02Icon,
  delete: PencilEdit02Icon,
  move: PencilEdit02Icon,
  search: Search01Icon,
  execute: CommandLineIcon,
  fetch: GlobeIcon,
};

export function RunTranscript({
  transcript,
  onAnswer,
  className,
}: {
  transcript: Transcript;
  onAnswer?: (requestId: string, optionId: string | null) => void;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const live = transcript.status === "running" || transcript.status === "waiting" || transcript.status === "starting";
  const count = transcript.items.length;
  const lastText = transcript.items.at(-1);

  // Follow the bottom while the run is live (cheap: one scroll per visible change).
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on content change
  useEffect(() => {
    if (live) endRef.current?.scrollIntoView({ block: "end" });
  }, [count, lastText, live]);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {transcript.items.map((item, i) => (
        <Item key={item.key} item={item} streaming={live && i === count - 1} onAnswer={onAnswer} />
      ))}
      {live && transcript.status !== "waiting" && lastText?.kind !== "thought" && lastText?.kind !== "message" && (
        <div className="flex items-center gap-2 text-ui-12 text-muted-foreground">
          <Spinner className="size-3.5" /> Working…
        </div>
      )}
      {transcript.error && transcript.status === "failed" && <ErrorNote text={transcript.error} />}
      <div ref={endRef} />
    </div>
  );
}

function Item({
  item,
  streaming,
  onAnswer,
}: {
  item: TranscriptItem;
  streaming: boolean;
  onAnswer?: (requestId: string, optionId: string | null) => void;
}) {
  switch (item.kind) {
    case "message":
      return (
        <div className="prose-sm max-w-none text-ui-14 leading-relaxed text-foreground">
          <Streamdown mode={streaming ? "streaming" : "static"} controls={false}>
            {localLinksAsCode(item.text)}
          </Streamdown>
        </div>
      );
    case "thought":
      return <Thought text={item.text} streaming={streaming} />;
    case "tool":
      return <ToolCard item={item} />;
    case "permission":
      return <PermissionCard item={item} onAnswer={onAnswer} />;
    case "error":
      return <ErrorNote text={item.text} />;
    case "notice":
      return (
        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-ui-12 text-muted-foreground">
          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
          {item.text}
        </div>
      );
  }
}

function Thought({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const preview = text.trim().split("\n").at(-1) ?? "";
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      className="group flex w-full flex-col items-start gap-1 rounded-lg px-1 text-left text-ui-12 text-muted-foreground hover:text-foreground"
    >
      <span className="flex items-center gap-1.5 font-medium">
        {streaming ? <Spinner className="size-3" /> : null}
        Thinking
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
      </span>
      <span className={cn("whitespace-pre-wrap", !open && "line-clamp-1")}>{open ? text.trim() : preview}</span>
    </button>
  );
}

function ToolCard({ item }: { item: Extract<TranscriptItem, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const detail = describeInput(item.input);
  const running = item.status === "pending" || item.status === "in_progress";
  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <HugeiconsIcon icon={KIND_ICON[item.toolKind] ?? Wrench01Icon} className="size-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-ui-13 font-medium">{prettyToolName(item.name)}</span>
          {detail && <span className="block truncate font-mono text-ui-11 text-muted-foreground">{detail}</span>}
        </span>
        <ToolStatusIcon status={item.status} />
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-border/60 px-3 py-2.5">
          {item.input != null && <CodeBlock label="Input" text={stringify(item.input)} />}
          {item.content.map((c, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list per render
            <ContentBlock key={i} content={c} />
          ))}
          {item.output != null && <CodeBlock label="Output" text={stringify(item.output)} />}
          {running && !item.content.length && item.output == null && (
            <span className="text-ui-12 text-muted-foreground">Running…</span>
          )}
        </div>
      )}
    </div>
  );
}

function ToolStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <HugeiconsIcon icon={Tick02Icon} className="size-4 text-emerald-600 dark:text-emerald-500" />;
  if (status === "failed") return <HugeiconsIcon icon={Cancel01Icon} className="size-4 text-destructive" />;
  return <Spinner className="size-3.5 text-muted-foreground" />;
}

function ContentBlock({ content }: { content: ToolContent }) {
  if (content.type === "diff") {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-ui-11 text-muted-foreground">{content.path}</span>
        <DiffView oldText={content.oldText ?? ""} newText={content.newText ?? ""} />
      </div>
    );
  }
  return content.text ? <CodeBlock text={content.text} /> : null;
}

/** Minimal line diff: shared prefix/suffix as context, middle as removed/added. Enough for agent edits. */
function DiffView({ oldText, newText }: { oldText: string; newText: string }) {
  const a = oldText ? oldText.split("\n") : [];
  const b = newText.split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const ctx = (lines: string[]) => lines.slice(-3);
  const rows: { sign: " " | "-" | "+"; text: string }[] = [
    ...ctx(a.slice(0, pre)).map((text) => ({ sign: " " as const, text })),
    ...a.slice(pre, a.length - suf).map((text) => ({ sign: "-" as const, text })),
    ...b.slice(pre, b.length - suf).map((text) => ({ sign: "+" as const, text })),
    ...a.slice(a.length - suf).slice(0, 3).map((text) => ({ sign: " " as const, text })),
  ];
  return (
    <pre className="max-h-72 overflow-auto rounded-lg bg-muted/40 py-1.5 font-mono text-ui-11 leading-5">
      {rows.map((r, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static rows
          key={i}
          className={cn(
            "px-2",
            r.sign === "-" && "bg-red-500/10 text-red-700 dark:text-red-400",
            r.sign === "+" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          )}
        >
          {r.sign} {r.text}
        </div>
      ))}
    </pre>
  );
}

function CodeBlock({ label, text }: { label?: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-ui-11 font-medium uppercase tracking-wider text-muted-foreground">{label}</span>}
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-2 py-1.5 font-mono text-ui-11 leading-5">
        {text}
      </pre>
    </div>
  );
}

function PermissionCard({
  item,
  onAnswer,
}: {
  item: Extract<TranscriptItem, { kind: "permission" }>;
  onAnswer?: (requestId: string, optionId: string | null) => void;
}) {
  const pending = item.answer === undefined;
  const chosen = item.options.find((o) => o.optionId === item.answer);
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border px-3.5 py-3",
        pending ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card",
      )}
    >
      <div className="flex items-start gap-2.5">
        <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-ui-13 font-medium">
            {pending ? "The agent wants to run this — allow it?" : chosen ? `You chose: ${chosen.name}` : "Denied"}
          </div>
          <div className="truncate font-mono text-ui-12 text-muted-foreground">{item.title}</div>
        </div>
      </div>
      {pending && onAnswer && (
        <div className="flex flex-wrap gap-2">
          {sortOptions(item.options).map((o) => (
            <Button
              key={o.optionId}
              size="sm"
              variant={o.kind.startsWith("allow") ? (o.kind === "allow_once" ? "default" : "outline") : "ghost"}
              onClick={() => onAnswer(item.requestId, o.optionId)}
            >
              {o.name}
            </Button>
          ))}
          {!item.options.some((o) => o.kind.startsWith("reject")) && (
            <Button size="sm" variant="ghost" onClick={() => onAnswer(item.requestId, null)}>
              Deny
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-ui-13 text-destructive">
      <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0" />
      <span className="whitespace-pre-wrap break-words">{friendlyError(text)}</span>
    </div>
  );
}

const ORDER: Record<string, number> = { allow_once: 0, allow_always: 1, reject_once: 2, reject_always: 3 };
function sortOptions(options: PermissionOption[]) {
  return [...options].sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9));
}

function prettyToolName(name: string) {
  // Delegation tools come from our team MCP server (see backend mcp.py).
  const ask = name.match(/(?:^|__)delegate_to_([a-z0-9_]+)$/);
  if (ask) return `Delegated to ${ask[1].replace(/_/g, " ")}`;
  if (/(?:^|__)check_teammate$/.test(name)) return "Waiting on teammate";
  if (name === "skill" || name === "load_skill" || name === "read_skill") return "Used skill";
  const n = name.replace(/^mcp__[^_]+__/, "").replace(/[_-]+/g, " ").trim();
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function stringify(v: unknown) {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

/** Agents link local files (`[a.py](C:\x\a.py)`), which the markdown renderer blocks; show them as code. */
function localLinksAsCode(text: string) {
  return text.replace(/\[([^\]]+)\]\((?!https?:)[^)]*\)/g, "`$1`");
}

function friendlyError(text: string) {
  if (/No model loaded/i.test(text)) return "No model is loaded. Load one in the Model hub, then try again.";
  return text.replace(/^Internal error: /, "");
}
