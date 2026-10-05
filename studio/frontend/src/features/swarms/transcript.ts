// SPDX-License-Identifier: AGPL-3.0-only
// Folds the flat RunEvent log into what the run view renders.

import type { RunEvent, RunStatus } from "./api";

export type ToolStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ToolContent {
  type: "content" | "diff" | "terminal";
  text?: string;
  path?: string;
  oldText?: string;
  newText?: string;
}

export interface PermissionOption {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
}

export type TranscriptItem =
  | { kind: "thought"; key: string; text: string }
  | { kind: "message"; key: string; text: string }
  | {
      kind: "tool";
      key: string;
      id: string;
      name: string;
      toolKind: string;
      status: ToolStatus;
      input: unknown;
      output: unknown;
      content: ToolContent[];
    }
  | {
      kind: "permission";
      key: string;
      requestId: string;
      toolCallId: string | null;
      title: string;
      options: PermissionOption[];
      answer: string | null | undefined; // undefined = pending, null = denied/cancelled
    }
  | { kind: "error"; key: string; text: string }
  | { kind: "notice"; key: string; text: string };

export interface Transcript {
  items: TranscriptItem[];
  status: RunStatus | null;
  error: string | null;
  lastSeq: number;
}

export const EMPTY_TRANSCRIPT: Transcript = { items: [], status: null, error: null, lastSeq: -1 };

/** Pure reducer: apply one event. Returns the same object when nothing visible changed. */
export function applyEvent(t: Transcript, e: RunEvent): Transcript {
  if (e.seq <= t.lastSeq) return t;
  const items = t.items.slice();
  const last = items[items.length - 1];
  let { status, error } = t;
  const d = e.data ?? {};

  switch (e.type) {
    case "agent_thought_chunk":
    case "agent_message_chunk": {
      const kind = e.type === "agent_thought_chunk" ? "thought" : "message";
      if (last && last.kind === kind) items[items.length - 1] = { ...last, text: last.text + d.text };
      else items.push({ kind, key: `${kind}-${e.seq}`, text: d.text ?? "" });
      break;
    }
    case "tool_call":
    case "tool_call_update": {
      const idx = findLastIndex(items, (i) => i.kind === "tool" && i.id === d.toolCallId);
      if (idx < 0) {
        items.push({
          kind: "tool",
          key: `tool-${d.toolCallId ?? e.seq}`,
          id: d.toolCallId,
          name: d.title ?? d.name ?? "tool",
          toolKind: d.kind ?? "other",
          status: d.status ?? "pending",
          input: d.rawInput,
          output: d.rawOutput,
          content: d.content ?? [],
        });
      } else {
        const prev = items[idx] as Extract<TranscriptItem, { kind: "tool" }>;
        items[idx] = {
          ...prev,
          status: d.status ?? prev.status,
          input: d.rawInput ?? prev.input,
          output: d.rawOutput ?? prev.output,
          content: d.content ?? prev.content,
          name: d.title ?? prev.name,
        };
      }
      break;
    }
    case "permission_request":
      items.push({
        kind: "permission",
        key: `perm-${d.request_id}`,
        requestId: d.request_id,
        toolCallId: d.toolCall?.toolCallId ?? null,
        title: d.toolCall?.title ?? describeInput(d.toolCall?.rawInput) ?? "Tool call",
        options: d.options ?? [],
        answer: undefined,
      });
      status = "waiting";
      break;
    case "permission_answer": {
      const idx = findLastIndex(items, (i) => i.kind === "permission" && i.requestId === d.request_id);
      if (idx >= 0) items[idx] = { ...(items[idx] as Extract<TranscriptItem, { kind: "permission" }>), answer: d.option_id };
      if (status === "waiting") status = "running";
      break;
    }
    case "status":
      status = d.status === "cancelling" ? status : d.status;
      if (d.error) error = d.error;
      break;
    case "error":
      items.push({ kind: "error", key: `err-${e.seq}`, text: d.message ?? "Error" });
      break;
    case "notice":
      items.push({ kind: "notice", key: `notice-${e.seq}`, text: d.text ?? "" });
      break;
    default:
      return { ...t, lastSeq: e.seq };
  }
  return { items, status, error, lastSeq: e.seq };
}

/** A short human label for a tool's input (command, path, query...). */
export function describeInput(input: unknown): string | null {
  if (!input || typeof input !== "object") return typeof input === "string" ? input : null;
  const r = input as Record<string, unknown>;
  for (const k of ["description", "command", "path", "file_path", "filePath", "pattern", "query", "url", "skill", "name"]) {
    if (typeof r[k] === "string" && r[k]) return r[k] as string;
  }
  return null;
}

function findLastIndex<T>(arr: T[], pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}
