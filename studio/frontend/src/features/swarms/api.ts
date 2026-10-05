// SPDX-License-Identifier: AGPL-3.0-only
// Swarms extension (unslotth-agent). Backend: swarms/backend/unsloth_swarms in the wrapper repo.

import { authFetch } from "@/features/auth";
import { readFastApiError } from "@/lib/format-fastapi-error";

export type Permission = "ask" | "auto" | "full";
/** How a parent uses a subagent: when it decides, or on every task (enforced by the runner). */
export type CallMode = "auto" | "always";

export interface AgentDef {
  name: string;
  /** Also tells the parent when to delegate to this agent. */
  description: string;
  icon: string;
  instructions: string;
  model: string | null;
  /** null = use the run's folder. */
  folder: string | null;
  permission: Permission;
  max_minutes: number;
  env: Record<string, string>;
  /** Studio Agent Skill names (see skillsApi). */
  skills: string[];
  /** Subagents only. */
  call: CallMode;
}

export interface TeamNode {
  id: string;
  parent: string | null;
  agent: AgentDef;
  x: number | null;
  y: number | null;
}

export interface TeamDef {
  name: string;
  description: string;
  nodes: TeamNode[];
}

export interface Team extends TeamDef {
  id: number;
}

export type RunStatus = "starting" | "running" | "waiting" | "succeeded" | "failed" | "cancelled";

export interface Run {
  id: number;
  team_id: number | null;
  node_id: string;
  parent_run_id: number | null;
  root_run_id: number | null;
  agent: AgentDef;
  task: string;
  cwd: string;
  model: string | null;
  status: RunStatus;
  stop_reason: string | null;
  error: string | null;
  started_at: string;
  ended_at: string | null;
}

export interface RunEvent {
  seq: number;
  type: string;
  ts: string;
  // biome-ignore lint/suspicious/noExplicitAny: raw ACP payloads
  data: any;
}

export interface LocalModel {
  id: string;
  loaded: boolean;
  context_length?: number;
}

/** Studio Agent Skill (shared with Studio chat), from /api/skills. */
export interface Skill {
  name: string;
  description: string;
  source: "agents" | "claude" | "bundled";
  enabled: boolean;
  valid: boolean;
  shadowed: boolean;
  error?: string | null;
  path?: string | null;
  /** SKILL.md `metadata`; `icon` is the skill's picture (see AGENT_ICONS). */
  metadata?: Record<string, string> | null;
}

export interface SkillManifest extends Skill {
  instructions: string;
}

export interface BuilderMessage {
  role: "user" | "assistant";
  content: string;
}

export interface BuilderAction {
  kind: "skill_created" | "skill_updated" | "team_updated";
  summary: string;
  skill?: string;
  team_id?: number;
}

export interface BuilderResult {
  reply: string;
  actions: BuilderAction[];
  steps: { tool: string; args: unknown; ok: boolean }[];
}

export const TERMINAL: ReadonlySet<RunStatus> = new Set(["succeeded", "failed", "cancelled"]);
export const isLive = (s: RunStatus | null | undefined) => s != null && !TERMINAL.has(s);

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  if (!res.ok) throw new Error(await readFastApiError(res));
  return (await res.json()) as T;
}

const body = (v: unknown) => JSON.stringify(v);

export const swarmsApi = {
  teams: () => json<Team[]>("/api/swarms/teams"),
  createTeam: (def: TeamDef) => json<Team>("/api/swarms/teams", { method: "POST", body: body(def) }),
  saveTeam: (id: number, def: TeamDef) => json<Team>(`/api/swarms/teams/${id}`, { method: "PUT", body: body(def) }),
  deleteTeam: (id: number) => json<{ ok: boolean }>(`/api/swarms/teams/${id}`, { method: "DELETE" }),

  start: (teamId: number, task: string, folder?: string | null) =>
    json<{ run_id: number }>(`/api/swarms/teams/${teamId}/runs`, {
      method: "POST",
      body: body({ task, folder: folder || null }),
    }),
  runs: (teamId?: number, limit = 30) =>
    json<Run[]>(`/api/swarms/runs?limit=${limit}${teamId != null ? `&team_id=${teamId}` : ""}`),
  tree: (rootRunId: number) => json<Run[]>(`/api/swarms/runs/${rootRunId}/tree`),
  cancel: (runId: number) => json<{ ok: boolean }>(`/api/swarms/runs/${runId}/cancel`, { method: "POST" }),
  answer: (runId: number, requestId: string, optionId: string | null) =>
    json<{ ok: boolean }>(`/api/swarms/runs/${runId}/permissions/${requestId}`, {
      method: "POST",
      body: body({ option_id: optionId }),
    }),

  /** One builder-assistant turn; the server applies any changes it makes. */
  builder: (messages: BuilderMessage[], teamId: number | null, skill: string | null) =>
    json<BuilderResult>("/api/swarms/builder", {
      method: "POST",
      body: body({ messages, team_id: teamId, skill }),
    }),

  /** Models Studio can serve right now (OpenAI-compatible list; unloaded entries filtered). */
  loadedModels: async (): Promise<LocalModel[]> => {
    const res = await json<{ data: LocalModel[] }>("/v1/models");
    return res.data.filter((m) => m.loaded !== false);
  },
};

/** Follow a run's SSE stream through authFetch (headers + token refresh), replaying from `after`.
 *  Resolves when the server sends `end`, the stream drops, or `signal` aborts. */
export async function streamRunEvents(
  runId: number,
  after: number,
  onEvent: (e: RunEvent) => void,
  signal: AbortSignal,
): Promise<"end" | "dropped"> {
  const res = await authFetch(`/api/swarms/runs/${runId}/events?after=${after}`, { signal });
  if (!res.ok || !res.body) throw new Error(await readFastApiError(res));
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return "dropped";
    buf += value;
    let sep = buf.indexOf("\n\n");
    while (sep >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      sep = buf.indexOf("\n\n");
      if (/^event: end$/m.test(frame)) return "end";
      const data = frame.split("\n").find((l) => l.startsWith("data: "));
      if (data) onEvent(JSON.parse(data.slice(6)) as RunEvent);
    }
  }
}

const enc = encodeURIComponent;

export const skillsApi = {
  /** Our extension: SKILL.md metadata.icon (Studio's own API has no metadata writes). */
  setIcon: (name: string, icon: string) =>
    json<Skill>(`/api/swarms/skills/${enc(name)}/icon`, { method: "PUT", body: body({ icon }) }),
  list: () => json<Skill[]>("/api/skills"),
  get: (name: string) => json<SkillManifest>(`/api/skills/${enc(name)}`),
  create: (name: string, description: string, instructions: string) =>
    json<Skill>("/api/skills", { method: "POST", body: body({ name, description, instructions }) }),
  update: (name: string, description: string, instructions: string) =>
    json<Skill>(`/api/skills/${enc(name)}`, { method: "PUT", body: body({ description, instructions }) }),
  remove: async (name: string) => {
    const res = await authFetch(`/api/skills/${enc(name)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await readFastApiError(res));
  },
  setEnabled: (name: string, enabled: boolean) =>
    json<Skill>(`/api/skills/${enc(name)}/enabled`, { method: "PUT", body: body({ enabled }) }),
};
