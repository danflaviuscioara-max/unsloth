// SPDX-License-Identifier: AGPL-3.0-only
// Builder assistant: describe what you want; it creates/edits skills and the open team for you.

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AiMagicIcon, ArrowUp02Icon, Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { type BuilderAction, type BuilderMessage, swarmsApi } from "../api";

type Undo = (actions: BuilderAction[]) => Promise<void>;

type Entry =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; actions: BuilderAction[]; undo?: Undo; undone?: boolean }
  | { kind: "error"; text: string };

export function BuilderPanel({
  teamId,
  skill,
  suggestions,
  onActions,
  onClose,
  initialPrompt = null,
  onInitialPromptSent,
  prepareUndo,
}: {
  teamId: number | null;
  skill: string | null;
  suggestions: string[];
  /** Sent automatically once on mount (e.g. "describe your team" from the welcome screen). */
  initialPrompt?: string | null;
  onInitialPromptSent?: () => void;
  /** Called before each turn; returns how to revert that turn's actions. */
  prepareUndo?: () => Undo | Promise<Undo>;
  /** Called after the assistant changed something, so the page can reload. */
  onActions: (actions: BuilderAction[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new entries
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [entries.length, busy]);

  const sentInitial = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once for the initial prompt
  useEffect(() => {
    if (initialPrompt && !sentInitial.current) {
      sentInitial.current = true;
      onInitialPromptSent?.();
      send(initialPrompt);
    }
  }, []);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || busy) return;
    const next: Entry[] = [...entries, { kind: "user", text: msg }];
    setEntries(next);
    setInput("");
    setBusy(true);
    try {
      const history: BuilderMessage[] = next
        .filter((e): e is Exclude<Entry, { kind: "error" }> => e.kind !== "error")
        .map((e) => ({ role: e.kind, content: e.text }));
      const undo = await prepareUndo?.();
      const res = await swarmsApi.builder(history, teamId, skill);
      setEntries((es) => [...es, { kind: "assistant", text: res.reply, actions: res.actions, undo }]);
      if (res.actions.length) await onActions(res.actions);
    } catch (e) {
      setEntries((es) => [...es, { kind: "error", text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-border/60 bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <HugeiconsIcon icon={AiMagicIcon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-ui-14 font-semibold">Builder</div>
          <div className="text-ui-11 text-muted-foreground">Describe it — I'll build it for you</div>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Close builder" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-ui-13 text-muted-foreground">
              Tell me what you want {teamId != null ? "this swarm" : "a skill"} to do. I can create and edit skills
              {teamId != null ? ", add or change agents, and attach skills to them" : ""}. Try:
            </p>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="rounded-xl border border-border/60 px-3 py-2 text-left text-ui-13 hover:border-primary/50 hover:bg-primary/5"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {entries.map((e, i) =>
            e.kind === "user" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
              <div key={i} className="self-end rounded-2xl rounded-br-md bg-muted px-3 py-2 text-ui-13">
                {e.text}
              </div>
            ) : e.kind === "error" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
              <div key={i} className="rounded-xl bg-destructive/5 px-3 py-2 text-ui-13 text-destructive">
                {e.text}
              </div>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
              <div key={i} className="flex flex-col gap-2">
                {e.actions.length > 0 && (
                  <div className={cn("flex flex-col gap-1", e.undone && "opacity-50 line-through")}>
                    {e.actions.map((a, j) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: static per message
                        key={j}
                        className="flex items-center gap-1.5 rounded-lg bg-primary/5 px-2 py-1 text-ui-12 text-primary"
                      >
                        <HugeiconsIcon icon={Tick02Icon} className="size-3.5 shrink-0" />
                        {a.summary}
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-ui-13 leading-relaxed">
                  <Streamdown mode="static" controls={false}>
                    {e.text}
                  </Streamdown>
                </div>
                {e.undo && e.actions.length > 0 && !e.undone && i === lastAssistant(entries) && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="self-start text-muted-foreground"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await e.undo?.(e.actions);
                        setEntries((es) => es.map((x, k) => (k === i && x.kind === "assistant" ? { ...x, undone: true } : x)));
                        await onActions(e.actions);
                      } catch (err) {
                        setEntries((es) => [...es, { kind: "error", text: `Undo failed: ${(err as Error).message}` }]);
                      }
                    }}
                  >
                    Undo these changes
                  </Button>
                )}
              </div>
            ),
          )}
          {busy && (
            <div className="flex items-center gap-2 text-ui-12 text-muted-foreground">
              <Spinner className="size-3.5" /> Working on it…
            </div>
          )}
        </div>
        <div ref={endRef} />
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-border/70 bg-background p-2">
          <Textarea
            className={cn("max-h-40 min-h-10 resize-none border-0 bg-transparent px-1 py-1 text-ui-13 shadow-none focus-visible:ring-0")}
            placeholder={teamId != null ? "e.g. Add a tester that writes pytest tests" : "e.g. A skill for writing release notes"}
            value={input}
            disabled={busy}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <Button size="icon-sm" aria-label="Send" disabled={busy || !input.trim()} onClick={() => send(input)}>
            <HugeiconsIcon icon={ArrowUp02Icon} className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}

/** Only the latest turn can be undone (earlier snapshots would also revert later turns). */
function lastAssistant(entries: Entry[]) {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].kind === "assistant") return i;
  return -1;
}
