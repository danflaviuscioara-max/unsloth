// SPDX-License-Identifier: AGPL-3.0-only
// Swarms: a lead (orchestrator) + subagents, built on MiniMax Code, running on Studio's local model.

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  Add01Icon,
  AiMagicIcon,
  Alert02Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  Clock01Icon,
  Delete02Icon,
  FolderOpenIcon,
  PlayIcon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentDef,
  type LocalModel,
  type Run,
  type Team,
  type TeamDef,
  type TeamNode,
  swarmsApi,
  isLive,
  skillsApi,
} from "./api";
import { AgentEditor } from "./components/agent-editor";
import { BuilderPanel } from "./components/builder-panel";
import { AgentIcon } from "./components/agent-icon";
import { RunTranscript } from "./components/run-transcript";
import { type NodeLive, TeamGraph, layoutTeam } from "./components/team-graph";
import { agentLook, ensureTemplateSkills, useSkillsStore } from "./skills-store";
import { SKILL_TEMPLATES, TEAM_TEMPLATES, type TeamTemplate, agentForSkill, blankAgent, newNodeId, skillsUsed } from "./templates";
import { useRunTranscript } from "./use-run-transcript";

export function SwarmsPage() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [picking, setPicking] = useState(false);
  const [builderPrompt, setBuilderPrompt] = useState<string | null>(null);
  const refreshSkills = useSkillsStore((s) => s.refresh);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    const list = await swarmsApi.teams();
    setTeams(list);
    return list;
  }, []);

  useEffect(() => {
    refresh()
      .then((list) => setTeamId((id) => id ?? list[0]?.id ?? null))
      .catch((e) => toast.error(String(e.message ?? e)));
    refreshSkills();
    const loadModels = () => swarmsApi.loadedModels().then(setModels).catch(() => setModels([]));
    loadModels();
    const t = window.setInterval(loadModels, 15000);
    return () => window.clearInterval(t);
  }, [refresh, refreshSkills]);

  // Blank team (just a lead), then hand the description to the Builder, which fills it in.
  const createFromPrompt = async (prompt: string) => {
    const t = await swarmsApi.createTeam({
      name: "New swarm",
      description: "",
      nodes: [{ id: "lead", parent: null, x: null, y: null, agent: { ...blankAgent(), name: "Lead", icon: "crown" } }],
    });
    await refresh();
    setBuilderPrompt(`Set up this swarm: ${prompt}. Give it a fitting name.`);
    setTeamId(t.id);
    setPicking(false);
  };

  const createFrom = async (tpl: TeamTemplate) => {
    const def: TeamDef = structuredClone(tpl.def);
    await ensureTemplateSkills(skillsUsed(def));
    def.nodes = layoutTeam(def.nodes, true);
    const t = await swarmsApi.createTeam(def);
    await refresh();
    setTeamId(t.id);
    setPicking(false);
  };

  if (teams == null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const team = teams.find((t) => t.id === teamId) ?? null;

  return (
    <div className="relative flex h-full min-h-0">
      <main className="relative min-w-0 flex-1">
        {picking || !team ? (
          <Welcome
            firstTime={teams.length === 0}
            onPick={(t) => createFrom(t).catch((e) => toast.error(e.message))}
            onDescribe={(p) => createFromPrompt(p).catch((e) => toast.error(e.message))}
            onCancel={teams.length ? () => setPicking(false) : undefined}
          />
        ) : (
          <TeamWorkspace
            key={team.id}
            team={team}
            teams={teams}
            models={models}
            onSwitch={setTeamId}
            onNew={() => setPicking(true)}
            onManageSkills={(skill) => navigate({ to: "/skills", search: skill ? { skill } : {} })}
            initialBuilderPrompt={builderPrompt}
            onBuilderPromptUsed={() => setBuilderPrompt(null)}
            onChanged={refresh}
            onDeleted={async () => {
              const list = await refresh();
              setTeamId(list[0]?.id ?? null);
            }}
          />
        )}
      </main>
    </div>
  );
}

function Welcome({
  firstTime,
  onPick,
  onDescribe,
  onCancel,
}: {
  firstTime: boolean;
  onPick: (t: TeamTemplate) => void;
  onDescribe: (prompt: string) => void;
  onCancel?: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-6 overflow-y-auto p-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-ui-28 font-semibold tracking-[-0.02em]">
          {firstTime ? "Build your first swarm" : "New swarm"}
        </h1>
        <p className="text-ui-14 text-muted-foreground">
          A <b className="font-medium text-foreground">lead</b> agent takes your task, splits it up and hands parts to
          its <b className="font-medium text-foreground">subagents</b>, then combines their work. Everything runs on the
          model loaded in Studio, on this computer. Describe what you need and the Builder sets it up, or start
          from a template — you can change everything later.
        </p>
      </div>
      <div className="rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm focus-within:border-primary/50">
        <Textarea
          className="min-h-20 resize-none border-0 bg-transparent px-1.5 py-1 text-ui-14 shadow-none focus-visible:ring-0"
          placeholder="e.g. A swarm that triages bug reports: one agent reproduces the bug, one fixes it, one writes a test"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
              e.preventDefault();
              onDescribe(prompt.trim());
            }
          }}
        />
        <div className="flex items-center gap-2 px-1.5">
          <HugeiconsIcon icon={AiMagicIcon} className="size-4 text-primary" />
          <span className="text-ui-12 text-muted-foreground">The Builder creates the agents and skills for you.</span>
          <Button size="sm" className="ml-auto" disabled={!prompt.trim()} onClick={() => onDescribe(prompt.trim())}>
            Build it
          </Button>
        </div>
      </div>
      <div className="text-ui-12 font-medium uppercase tracking-wider text-muted-foreground">Or start from a template</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {TEAM_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <div className="flex items-center gap-1.5">
              {t.def.nodes.map((n) => (
                <AgentIcon key={n.id} icon={n.agent.icon} className={n.parent ? "size-7 rounded-lg" : "size-9"} />
              ))}
            </div>
            <div>
              <div className="text-ui-14 font-semibold">{t.def.name}</div>
              <div className="text-ui-12 text-muted-foreground">{t.def.description}</div>
            </div>
          </button>
        ))}
      </div>
      {onCancel && (
        <div>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// -- workspace ----------------------------------------------------------------------------------

function TeamWorkspace({
  team: initial,
  teams,
  models,
  onSwitch,
  onNew,
  onManageSkills,
  initialBuilderPrompt,
  onBuilderPromptUsed,
  onChanged,
  onDeleted,
}: {
  team: Team;
  teams: Team[];
  models: LocalModel[];
  onSwitch: (teamId: number) => void;
  onNew: () => void;
  onManageSkills: (skill?: string) => void;
  initialBuilderPrompt: string | null;
  onBuilderPromptUsed: () => void;
  onChanged: () => Promise<Team[]>;
  onDeleted: () => Promise<void>;
}) {
  const [team, setTeam] = useState<Team>(() => ({ ...initial, nodes: layoutTeam(initial.nodes) }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(initialBuilderPrompt != null);
  const teamRef = useRef(team);
  teamRef.current = team;
  const [rootRunId, setRootRunId] = useState<number | null>(null);
  const [tree, setTree] = useState<Run[]>([]);
  const [history, setHistory] = useState<Run[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);

  // Persist edits (debounced) so users never hunt for a save button on the canvas.
  const update = useCallback(
    (fn: (t: Team) => Team) => {
      setTeam((prev) => {
        const next = fn(prev);
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          const { id, ...def } = next;
          swarmsApi
            .saveTeam(id, def)
            .then(onChanged)
            .catch((e) => toast.error(`Couldn't save: ${e.message}`));
        }, 600);
        return next;
      });
    },
    [onChanged],
  );

  const loadHistory = useCallback(
    () => swarmsApi.runs(initial.id).then((rs) => {
      setHistory(rs);
      return rs;
    }),
    [initial.id],
  );

  // On open: attach to the latest run so a running team shows up live.
  useEffect(() => {
    loadHistory()
      .then((rs) => rs[0] && setRootRunId(rs[0].id))
      .catch(() => {});
  }, [loadHistory]);

  // Poll the run tree while anything in it is live.
  useEffect(() => {
    if (rootRunId == null) {
      setTree([]);
      return;
    }
    let stop = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const t = await swarmsApi.tree(rootRunId);
        if (stop) return;
        setTree((prev) => (JSON.stringify(prev) === JSON.stringify(t) ? prev : t));
        if (t.some((r) => isLive(r.status))) timer = window.setTimeout(tick, 1200);
        else loadHistory().catch(() => {});
      } catch {
        if (!stop) timer = window.setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [rootRunId, loadHistory]);

  const live = useMemo(() => {
    const out: Record<string, NodeLive> = {};
    for (const r of tree) {
      const prev = out[r.node_id];
      out[r.node_id] = {
        status: r.status,
        runs: (prev?.runs ?? 0) + 1,
        task: r.parent_run_id != null ? r.task : null,
      };
    }
    return out;
  }, [tree]);

  const root = tree.find((r) => r.parent_run_id == null) ?? null;
  const running = isLive(root?.status);
  const waiting = tree.find((r) => r.status === "waiting");
  const selected = team.nodes.find((n) => n.id === selectedId) ?? null;

  const addChild = useCallback(
    (parentId: string, skill: string | null) => {
      let createdId = "";
      const tpl = SKILL_TEMPLATES.find((t) => t.name === skill);
      const known = useSkillsStore.getState().skills?.find((s) => s.name === skill);
      if (tpl && !known) ensureTemplateSkills([tpl.name]).catch((e) => toast.error(e.message));
      const agentDef: AgentDef = skill
        ? agentForSkill(tpl ?? { name: skill, description: known?.description ?? "" })
        : blankAgent();
      update((t) => {
        const id = newNodeId(t.nodes);
        createdId = id;
        return { ...t, nodes: layoutTeam([...t.nodes, { id, parent: parentId, agent: agentDef, x: null, y: null }]) };
      });
      window.setTimeout(() => setSelectedId(createdId), 0);
    },
    [update],
  );

  const removeNode = (nodeId: string) => {
    const doomed = new Set([nodeId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const n of team.nodes) if (n.parent && doomed.has(n.parent) && !doomed.has(n.id)) doomed.add(n.id), (grew = true);
    }
    const extra = doomed.size > 1 ? ` and ${doomed.size - 1} agent(s) under it` : "";
    if (!window.confirm(`Remove this agent${extra}?`)) return;
    update((t) => ({ ...t, nodes: t.nodes.filter((n) => !doomed.has(n.id)) }));
    setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        {/* Header */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-1 px-4 py-3">
          <TeamSwitcher teams={teams} current={team} onSwitch={onSwitch} onNew={onNew} />
          <input
            className="min-w-0 max-w-sm rounded-lg bg-transparent px-2 py-1 font-heading text-ui-18 font-semibold outline-none hover:bg-muted/60 focus:bg-muted/60"
            value={team.name}
            aria-label="Swarm name"
            onChange={(e) => update((t) => ({ ...t, name: e.target.value || "Untitled swarm" }))}
          />
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant={builderOpen ? "secondary" : "ghost"}
              className="gap-1.5"
              onClick={() => setBuilderOpen((o) => !o)}
            >
              <HugeiconsIcon icon={AiMagicIcon} className="size-4 text-primary" /> Builder
            </Button>
            <HistoryMenu history={history} current={rootRunId} onPick={setRootRunId} />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete swarm"
              onClick={async () => {
                if (!window.confirm(`Delete the swarm "${team.name}"? Past runs stay in history.`)) return;
                await swarmsApi.deleteTeam(team.id);
                await onDeleted();
              }}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </Button>
          </div>
        </div>

        {/* Canvas */}
        <TeamGraph
          nodes={team.nodes}
          selectedId={selectedId}
          panelOpen={selected != null || builderOpen}
          live={live}
          editable={!running}
          onSelect={setSelectedId}
          onAddChild={addChild}
          onMove={(id, x, y) => update((t) => ({ ...t, nodes: t.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }))}
          onTidy={() => update((t) => ({ ...t, nodes: layoutTeam(t.nodes, true) }))}
        />

        {/* Needs-approval nudge */}
        {waiting && waiting.node_id !== selectedId && (
          <button
            type="button"
            onClick={() => setSelectedId(waiting.node_id)}
            className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/50 bg-background px-3.5 py-1.5 text-ui-13 shadow-md"
          >
            <span className="size-2 animate-pulse rounded-full bg-amber-500" />
            <b className="font-medium">{nodeName(team.nodes, waiting.node_id)}</b> needs your
            approval — review
          </button>
        )}

        {/* Composer */}
        <Composer
          team={team}
          models={models}
          root={root}
          onStarted={(id) => {
            setRootRunId(id);
            setSelectedId(team.nodes.find((n) => !n.parent)?.id ?? null);
          }}
        />
      </div>

      {builderOpen && (
        <BuilderPanel
          teamId={team.id}
          skill={null}
          initialPrompt={initialBuilderPrompt}
          onInitialPromptSent={onBuilderPromptUsed}
          prepareUndo={() => {
            const before = structuredClone(teamRef.current);
            return async (actions) => {
              const { id, ...def } = before;
              await swarmsApi.saveTeam(id, def);
              for (const a of actions) if (a.kind === "skill_created" && a.skill) await skillsApi.remove(a.skill);
            };
          }}
          suggestions={[
            "Add a tester that writes and runs pytest tests",
            "Create a skill for writing changelogs and give it to a new Writer agent",
            "Make every agent ask before acting",
          ]}
          onActions={async (actions) => {
            if (actions.some((a) => a.kind !== "team_updated")) await useSkillsStore.getState().refresh();
            if (actions.some((a) => a.kind === "team_updated")) {
              const fresh = (await onChanged()).find((t) => t.id === team.id);
              if (fresh) setTeam({ ...fresh, nodes: layoutTeam(fresh.nodes) });
            }
          }}
          onClose={() => setBuilderOpen(false)}
        />
      )}
      {selected && !builderOpen && (
        <Inspector
          key={selected.id}
          node={selected}
          isLead={!selected.parent}
          models={models}
          runs={tree.filter((r) => r.node_id === selected.id)}
          editable={!running}
          onClose={() => setSelectedId(null)}
          onSave={async (agent) => {
            update((t) => ({ ...t, nodes: t.nodes.map((n) => (n.id === selected.id ? { ...n, agent } : n)) }));
            toast.success("Saved");
          }}
          onRemove={selected.parent ? () => removeNode(selected.id) : undefined}
          onManageSkills={onManageSkills}
        />
      )}
    </div>
  );
}

function TeamSwitcher({
  teams,
  current,
  onSwitch,
  onNew,
}: {
  teams: Team[];
  current: Team;
  onSwitch: (id: number) => void;
  onNew: () => void;
}) {
  const lead = current.nodes.find((n) => !n.parent);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Switch swarm"
          className="flex items-center gap-1 rounded-lg p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <AgentIcon icon={lead?.agent.icon ?? "crown"} className="size-7 rounded-lg" />
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Swarms</DropdownMenuLabel>
        {teams.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => onSwitch(t.id)} className={cn("gap-2.5", t.id === current.id && "bg-muted")}>
            <AgentIcon icon={t.nodes.find((n) => !n.parent)?.agent.icon ?? "crown"} className="size-7 rounded-lg" />
            <span className="min-w-0">
              <span className="block truncate text-ui-13 font-medium">{t.name}</span>
              <span className="block text-ui-11 text-muted-foreground">
                {t.nodes.length === 1 ? "1 agent" : `${t.nodes.length} agents`}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNew} className="gap-2">
          <HugeiconsIcon icon={Add01Icon} className="size-4" /> New swarm
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HistoryMenu({ history, current, onPick }: { history: Run[]; current: number | null; onPick: (id: number) => void }) {
  if (!history.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
          <HugeiconsIcon icon={Clock01Icon} className="size-4" /> History
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Past tasks</DropdownMenuLabel>
        {history.map((r) => (
          <DropdownMenuItem key={r.id} onSelect={() => onPick(r.id)} className={cn("gap-2", r.id === current && "bg-muted")}>
            <StatusDot status={r.status} />
            <span className="min-w-0 flex-1 truncate">{r.task}</span>
            <span className="shrink-0 text-ui-11 text-muted-foreground">{shortTime(r.started_at)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Composer({
  team,
  models,
  root,
  onStarted,
}: {
  team: Team;
  models: LocalModel[];
  root: Run | null;
  onStarted: (rootRunId: number) => void;
}) {
  const navigate = useNavigate();
  const [task, setTask] = useState("");
  const [folder, setFolder] = useState("");
  const [showFolder, setShowFolder] = useState(false);
  const [starting, setStarting] = useState(false);
  const running = isLive(root?.status);
  const lead = team.nodes.find((n) => !n.parent);
  const example = TEAM_TEMPLATES.find((t) => t.def.name === team.name)?.example ?? "Describe what you want the swarm to do…";

  const start = async () => {
    if (!task.trim() || running) return;
    setStarting(true);
    try {
      const { run_id } = await swarmsApi.start(team.id, task.trim(), folder || null);
      setTask("");
      onStarted(run_id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-4">
      <div className="flex w-full max-w-2xl flex-col gap-2">
        {models.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-background/95 px-3.5 py-2 text-ui-13 shadow-sm backdrop-blur">
            <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0 text-amber-600" />
            <span className="flex-1">No model is loaded — agents need one to think.</span>
            <Button size="sm" variant="outline" onClick={() => navigate({ to: "/hub" })}>
              Open Model hub
            </Button>
          </div>
        )}
        <div className="rounded-2xl border border-border/70 bg-background/95 p-2.5 shadow-lg backdrop-blur">
          {running ? (
            <div className="flex items-center gap-3 px-1.5 py-1">
              <Spinner className="size-4 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="text-ui-13 font-medium">{lead?.agent.name ?? "The swarm"} is working on it</div>
                <div className="truncate text-ui-12 text-muted-foreground">{root?.task}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => root && swarmsApi.cancel(root.id).catch(() => {})}>
                <HugeiconsIcon icon={StopIcon} className="size-3.5" /> Stop
              </Button>
            </div>
          ) : (
            <>
              <Textarea
                className="max-h-48 min-h-14 resize-none border-0 bg-transparent px-1.5 py-1 text-ui-14 shadow-none focus-visible:ring-0"
                value={task}
                placeholder={example}
                onChange={(e) => setTask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    start();
                  }
                }}
              />
              {showFolder && (
                <Input
                  className="mt-1 h-8 font-mono text-ui-11"
                  value={folder}
                  placeholder={lead?.agent.folder ?? "C:\\path\\to\\project (empty = the swarm's scratch folder)"}
                  onChange={(e) => setFolder(e.target.value)}
                />
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn("gap-1.5 text-muted-foreground", (showFolder || folder) && "text-foreground")}
                  onClick={() => setShowFolder((s) => !s)}
                >
                  <HugeiconsIcon icon={FolderOpenIcon} className="size-4" />
                  {folder ? folder.split(/[\\/]/).filter(Boolean).at(-1) : lead?.agent.folder ? "Swarm folder" : "Folder"}
                </Button>
                {root && (
                  <span className="truncate text-ui-11 text-muted-foreground">
                    Last task: <StatusText status={root.status} />
                  </span>
                )}
                <Button
                  size="sm"
                  className="ml-auto"
                  disabled={!task.trim() || starting || models.length === 0}
                  onClick={start}
                >
                  <HugeiconsIcon icon={PlayIcon} className="size-3.5" /> Run
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Inspector({
  node,
  isLead,
  models,
  runs,
  editable,
  onClose,
  onSave,
  onRemove,
  onManageSkills,
}: {
  node: TeamNode;
  isLead: boolean;
  models: LocalModel[];
  runs: Run[];
  editable: boolean;
  onClose: () => void;
  onSave: (agent: AgentDef) => Promise<void>;
  onRemove?: () => void;
  onManageSkills: (skill?: string) => void;
}) {
  const [tab, setTab] = useState<"activity" | "settings">(runs.length ? "activity" : "settings");
  const [pick, setPick] = useState<number | null>(null);
  const runId = pick ?? runs.at(-1)?.id ?? null;
  const run = runs.find((r) => r.id === runId) ?? null;
  const transcript = useRunTranscript(runId);
  const look = agentLook(node.agent, isLead, useSkillsStore((s) => s.skills));

  // Jump to activity when this node starts working.
  const count = runs.length;
  useEffect(() => {
    if (count) setTab("activity");
  }, [count]);

  return (
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-border/60 bg-background">
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <AgentIcon icon={look.icon} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-ui-14 font-semibold">{look.name}</div>
          <div className="text-ui-11 text-muted-foreground">{isLead ? "Swarm lead" : "Subagent"}</div>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      </div>
      <div className="flex gap-1 border-b border-border/60 px-3 py-2">
        {(["activity", "settings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3 py-1 text-ui-13 capitalize text-muted-foreground hover:text-foreground",
              tab === t && "bg-muted font-medium text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "settings" ? (
          <>
            {!editable && (
              <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-ui-12 text-muted-foreground">
                Changes apply to the next task. The current one keeps its settings.
              </p>
            )}
            <AgentEditor value={node.agent} models={models} isNew={false} isLead={isLead} onSave={onSave} onDelete={onRemove} onManageSkills={onManageSkills} />
          </>
        ) : !run ? (
          <p className="text-ui-13 text-muted-foreground">
            {isLead
              ? "Run a task from the box below. The lead's thinking and actions show up here."
              : "This agent hasn't been given work in this task yet. The lead delegates to it when needed."}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {runs.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {runs.map((r, i) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setPick(r.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-ui-11",
                      r.id === runId ? "border-primary/60 bg-primary/5" : "border-border/60",
                    )}
                  >
                    <StatusDot status={r.status} /> Job {i + 1}
                  </button>
                ))}
              </div>
            )}
            <div className="rounded-xl bg-muted/50 px-3 py-2">
              <div className="text-ui-11 font-medium uppercase tracking-wider text-muted-foreground">
                {isLead ? "Your task" : "Task from the lead"}
              </div>
              <div className="whitespace-pre-wrap text-ui-13">{run.task}</div>
            </div>
            <RunTranscript
              transcript={transcript}
              onAnswer={(req, opt) => swarmsApi.answer(run.id, req, opt).catch((e) => toast.error(e.message))}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

const STATUS_TEXT: Record<string, string> = {
  starting: "starting",
  running: "working",
  waiting: "needs approval",
  succeeded: "done",
  failed: "failed",
  cancelled: "stopped",
};

function StatusText({ status }: { status: string }) {
  return (
    <span className={cn(status === "failed" && "text-destructive", status === "succeeded" && "text-emerald-600 dark:text-emerald-500")}>
      {STATUS_TEXT[status] ?? status}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full",
        status === "succeeded" && "bg-emerald-500",
        status === "failed" && "bg-destructive",
        status === "cancelled" && "bg-muted-foreground",
        status === "waiting" && "animate-pulse bg-amber-500",
        (status === "running" || status === "starting") && "animate-pulse bg-primary",
      )}
    />
  );
}

function shortTime(ts: string) {
  const d = new Date(`${ts}Z`);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString();
}

function nodeName(nodes: TeamNode[], id: string) {
  const n = nodes.find((x) => x.id === id);
  return n ? agentLook(n.agent, n.parent == null, useSkillsStore.getState().skills).name : "An agent";
}
