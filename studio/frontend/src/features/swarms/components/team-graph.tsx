// SPDX-License-Identifier: AGPL-3.0-only
// Team canvas: the lead on top, subagents below; live run status on nodes and edges.

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import dagre from "@dagrejs/dagre";
import { Add01Icon, CenterFocusIcon, LayoutTwoRowIcon, ZoomInAreaIcon, ZoomOutAreaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  Handle,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getSmoothStepPath,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useEffect, useMemo, useState } from "react";
import type { RunStatus, TeamNode } from "../api";
import { agentLook, skillIcon, skillTitle, usableSkills, useSkillsStore } from "../skills-store";
import { SKILL_TEMPLATES } from "../templates";
import { AgentIcon, SkillGlyph } from "./agent-icon";

// Keep the tree clear of the floating header (top) and task composer (bottom).
// minZoom keeps cards readable; bigger teams pan instead of shrinking to dots.
const FIT = { padding: { top: "84px", bottom: "190px", x: "48px" }, maxZoom: 1, minZoom: 0.7 } as const;

const NODE_W = 232;
const NODE_H = 112;

export interface NodeLive {
  status: RunStatus | null;
  runs: number;
  task: string | null; // latest delegated task (shown on the incoming edge)
}

type AgentNodeData = {
  node: TeamNode;
  isLead: boolean;
  selected: boolean;
  live: NodeLive;
  editable: boolean;
  onAddChild: (parentId: string, skill: string | null) => void;
};

const STATUS_LABEL: Record<string, string> = {
  starting: "Starting…",
  running: "Working…",
  waiting: "Needs your approval",
  succeeded: "Done",
  failed: "Failed",
  cancelled: "Stopped",
};

function statusTone(s: RunStatus | null) {
  if (s === "running" || s === "starting") return "bg-primary animate-pulse";
  if (s === "waiting") return "bg-amber-500 animate-pulse";
  if (s === "succeeded") return "bg-emerald-500";
  if (s === "failed") return "bg-destructive";
  if (s === "cancelled") return "bg-muted-foreground";
  return "bg-border";
}

const AgentNode = memo(function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { node, isLead, selected, live, editable, onAddChild } = data;
  const active = live.status === "running" || live.status === "starting";
  const allSkills = useSkillsStore((st) => st.skills);
  const skills = node.agent.skills ?? [];
  const look = agentLook(node.agent, isLead, allSkills);
  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-card px-3.5 py-3 shadow-sm transition-[box-shadow,border-color]",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border/70 hover:border-primary/40",
        active && "shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_18%,transparent)]",
        live.status === "waiting" && "border-amber-500/70",
      )}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !border-0 !bg-border" isConnectable={false} />
      <div className="flex items-center gap-2.5">
        <AgentIcon
          icon={look.icon}
          className={cn("size-9", !isLead && !skills.length && "border border-dashed border-primary/40 bg-transparent")}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-ui-14 font-semibold">{look.name}</span>
            {isLead && (
              <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-ui-10 font-semibold uppercase tracking-wide text-primary">
                Lead
              </span>
            )}
            {!isLead && node.agent.call === "always" && (
              <span
                className="shrink-0 rounded-full border border-primary/40 px-1.5 py-px text-ui-10 font-medium text-primary"
                title="Runs on every task"
              >
                Always
              </span>
            )}
          </div>
          <span className="block truncate text-ui-11 text-muted-foreground">
            {node.agent.permission === "ask" ? "Asks before acting" : node.agent.permission === "auto" ? "Auto" : "Full access"}
          </span>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-ui-12 leading-snug text-muted-foreground">
        {!isLead && !skills.length
          ? "No skill yet — give it one to define what it does."
          : node.agent.description || "No description — tell the lead when to use this agent."}
      </p>
      {(isLead ? skills.length > 0 : skills.length > 1) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {skills.slice(0, 3).map((s) => (
            <span key={s} className="flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-px text-ui-10 font-medium text-primary">
              <SkillGlyph icon={skillIcon(s, allSkills)} className="size-3" />
              {skillTitle(s)}
            </span>
          ))}
          {skills.length > 3 && (
            <span className="rounded-md bg-muted px-1.5 py-px text-ui-10 text-muted-foreground">+{skills.length - 3}</span>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5 text-ui-11 text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", statusTone(live.status))} />
        <span className={cn(live.status === "waiting" && "font-medium text-amber-600 dark:text-amber-500")}>
          {live.status ? STATUS_LABEL[live.status] : "Idle"}
        </span>
        {live.runs > 1 && <span className="ml-auto rounded bg-muted px-1 text-ui-10">×{live.runs}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-2 !border-0 !bg-border" isConnectable={false} />

      {editable && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Add subagent"
              onClick={(e) => e.stopPropagation()}
              className="nodrag absolute -bottom-3 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 shadow-sm transition-opacity hover:border-primary hover:text-primary group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <AddTeammateMenu onPick={(skill) => onAddChild(node.id, skill)} />
        </DropdownMenu>
      )}
    </div>
  );
});

/** `optional`: the parent calls this child only when it decides to (drawn dashed). */
type TaskEdgeData = { task: string | null; active: boolean; done: boolean; optional: boolean };

function TaskEdge(props: EdgeProps<Edge<TaskEdgeData>>) {
  const [path, labelX, labelY] = getSmoothStepPath({ ...props, borderRadius: 14 });
  const { task, active, done, optional } = props.data ?? { task: null, active: false, done: false, optional: true };
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke: active ? "var(--primary)" : done ? "color-mix(in oklab, var(--primary) 45%, var(--border))" : "var(--border)",
          strokeWidth: active ? 2 : 1.5,
          strokeDasharray: active ? "6 4" : optional && !done ? "3 5" : undefined,
          animation: active ? "swarm-dash 0.6s linear infinite" : undefined,
        }}
      />
      {task && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute max-w-48 truncate rounded-full border border-border/70 bg-background px-2 py-0.5 text-ui-10 text-muted-foreground shadow-xs"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title={task}
          >
            {task}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const NODE_TYPES = { agent: AgentNode };
const EDGE_TYPES = { task: TaskEdge };

/** Positions for nodes without one (or all, when `all`), top-down tree. */
export function layoutTeam(nodes: TeamNode[], all = false): TeamNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 48, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const n of nodes) if (n.parent) g.setEdge(n.parent, n.id);
  dagre.layout(g);
  return nodes.map((n) => {
    if (!all && n.x != null && n.y != null) return n;
    const p = g.node(n.id);
    return { ...n, x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
  });
}

export interface TeamGraphProps {
  nodes: TeamNode[];
  selectedId: string | null;
  /** Inspector open: the canvas narrows, so refit. */
  panelOpen: boolean;
  live: Record<string, NodeLive>;
  editable: boolean;
  onSelect: (nodeId: string | null) => void;
  onAddChild: (parentId: string, skill: string | null) => void;
  onMove: (nodeId: string, x: number, y: number) => void;
  onTidy: () => void;
}

export function TeamGraph(props: TeamGraphProps) {
  return (
    <ReactFlowProvider>
      <TeamGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function TeamGraphInner({ nodes, selectedId, panelOpen, live, editable, onSelect, onAddChild, onMove, onTidy }: TeamGraphProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const idle: NodeLive = { status: null, runs: 0, task: null };

  const rfNodes = useMemo<Node<AgentNodeData>[]>(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: "agent",
        position: { x: n.x ?? 0, y: n.y ?? 0 },
        data: {
          node: n,
          isLead: n.parent == null,
          selected: n.id === selectedId,
          live: live[n.id] ?? idle,
          editable,
          onAddChild,
        },
        draggable: true,
      })),
    // biome-ignore lint/correctness/useExhaustiveDependencies: idle is a constant shape
    [nodes, selectedId, live, editable, onAddChild],
  );

  const rfEdges = useMemo<Edge<TaskEdgeData>[]>(
    () =>
      nodes
        .filter((n) => n.parent)
        .map((n) => {
          const l = live[n.id] ?? idle;
          return {
            id: `${n.parent}->${n.id}`,
            source: n.parent as string,
            target: n.id,
            type: "task",
            data: {
              task: l.task,
              active: l.status === "running" || l.status === "starting" || l.status === "waiting",
              done: l.status === "succeeded",
              optional: n.agent.call !== "always",
            },
          };
        }),
    // biome-ignore lint/correctness/useExhaustiveDependencies: idle is a constant shape
    [nodes, live],
  );

  // Local copy so drags render smoothly; the parent owns positions and gets them on drag stop.
  const [shown, setShown] = useState(rfNodes);
  useEffect(() => setShown(rfNodes), [rfNodes]);

  const count = nodes.length;
  // Refit when the team's shape changes (switching teams, adding/removing nodes).
  // biome-ignore lint/correctness/useExhaustiveDependencies: fit on size change only
  useEffect(() => {
    const t = window.setTimeout(() => fitView({ ...FIT, duration: 250 }), 30);
    return () => window.clearTimeout(t);
  }, [count, panelOpen, fitView]);

  return (
    <ReactFlow
      nodes={shown}
      edges={rfEdges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      minZoom={0.3}
      maxZoom={1.5}
      onNodeClick={(_, n) => onSelect(n.id)}
      onPaneClick={() => onSelect(null)}
      onNodeDragStop={(_, n) => onMove(n.id, n.position.x, n.position.y)}
      onNodesChange={(changes) => setShown((ns) => applyNodeChanges(changes, ns))}
      className="h-full w-full"
    >
      <style>{"@keyframes swarm-dash { to { stroke-dashoffset: -10; } }"}</style>
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} className="!bg-transparent opacity-60" />
      <Panel position="top-right" className="!mt-16 !mr-4">
        <div className="flex flex-col overflow-hidden rounded-xl border border-border/70 bg-background/90 shadow-sm backdrop-blur">
          <CanvasButton label="Zoom in" icon={ZoomInAreaIcon} onClick={() => zoomIn({ duration: 150 })} />
          <CanvasButton label="Zoom out" icon={ZoomOutAreaIcon} onClick={() => zoomOut({ duration: 150 })} />
          <CanvasButton
            label="Fit to screen"
            icon={CenterFocusIcon}
            onClick={() => fitView({ ...FIT, duration: 250 })}
          />
          {editable && <CanvasButton label="Tidy up layout" icon={LayoutTwoRowIcon} onClick={onTidy} />}
        </div>
      </Panel>
    </ReactFlow>
  );
}

function CanvasButton({ label, icon, onClick }: { label: string; icon: typeof Add01Icon; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <HugeiconsIcon icon={icon} className="size-4" strokeWidth={1.75} />
    </button>
  );
}

/** Teammate = generic agent + one skill: your Studio skills first, then starter skills not created yet. */
function AddTeammateMenu({ onPick }: { onPick: (skill: string | null) => void }) {
  const all = useSkillsStore((s) => s.skills);
  const skills = usableSkills(all);
  const have = new Set(skills.map((s) => s.name));
  const starters = SKILL_TEMPLATES.filter((t) => !have.has(t.name));
  return (
    <DropdownMenuContent align="center" className="max-h-96 w-64 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
      <DropdownMenuLabel>Add a teammate — pick its skill</DropdownMenuLabel>
      {skills.map((s) => (
        <DropdownMenuItem key={s.name} onSelect={() => onPick(s.name)} className="items-start gap-2">
          <AgentIcon icon={skillIcon(s.name, all)} className="size-6 rounded-lg" />
          <span className="min-w-0">
            <span className="block text-ui-13 font-medium">{skillTitle(s.name)}</span>
            <span className="line-clamp-2 block text-ui-11 text-muted-foreground">{s.description}</span>
          </span>
        </DropdownMenuItem>
      ))}
      {starters.length > 0 && (
        <>
          {skills.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel className="text-ui-11 text-muted-foreground">Starter skills</DropdownMenuLabel>
          {starters.map((t) => (
            <DropdownMenuItem key={t.name} onSelect={() => onPick(t.name)} className="items-start gap-2">
              <AgentIcon icon={t.icon} className="size-6 rounded-lg" />
              <span className="min-w-0">
                <span className="block text-ui-13 font-medium">{skillTitle(t.name)}</span>
                <span className="line-clamp-2 block text-ui-11 text-muted-foreground">{t.description}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onPick(null)}>Agent without a skill (pick later)</DropdownMenuItem>
    </DropdownMenuContent>
  );
}
