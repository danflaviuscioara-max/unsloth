// SPDX-License-Identifier: AGPL-3.0-only
// Skills builder: Studio Agent Skills (SKILL.md), shared with Studio chat, attached to agents.

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Add01Icon, AiMagicIcon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { type SkillManifest, skillsApi } from "../api";
import { skillIcon, skillTitle, useSkillsStore } from "../skills-store";
import { SKILL_TEMPLATES, type SkillTemplate } from "../templates";
import { AgentIcon, IconPicker } from "./agent-icon";

type Draft = { name: string; description: string; instructions: string; icon: string; isNew: boolean; rev: number };

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function SkillsView({
  selected,
  onSelect,
  side,
  version = 0,
  onOpenBuilder,
  onDescribe,
  usage = {},
}: {
  selected: string | null;
  onSelect: (name: string | null) => void;
  /** Bump to reload the open skill (e.g. after the builder edited it). */
  version?: number;
  onOpenBuilder?: () => void;
  /** Hand a plain-language skill description to the builder. */
  onDescribe?: (prompt: string) => void;
  /** skill name -> "Agent (Team)" labels of agents that have it. */
  usage?: Record<string, string[]>;
  /** Optional right-hand panel (the builder assistant). */
  side?: ReactNode;
}) {
  const skills = useSkillsStore((s) => s.skills);
  const refresh = useSkillsStore((s) => s.refresh);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Open the selected skill (or keep a new draft).
  useEffect(() => {
    if (!selected) return;
    let stale = false;
    skillsApi
      .get(selected)
      .then((m: SkillManifest) => {
        if (!stale)
          setDraft({
            name: m.name,
            description: m.description,
            instructions: m.instructions,
            icon: skillIcon(m.name, [m]),
            isNew: false,
            rev: Date.now(),
          });
      })
      .catch((e) => toast.error(e.message));
    return () => {
      stale = true;
    };
  }, [selected, version]);

  const startNew = (tpl?: SkillTemplate) => {
    onSelect(null);
    setDraft(
      tpl
        ? { name: tpl.name, description: tpl.description, instructions: tpl.instructions, icon: tpl.icon, isNew: true, rev: Date.now() }
        : { name: "", description: "", instructions: "# My skill\n\n1. …", icon: "spark", isNew: true, rev: Date.now() },
    );
  };

  const list = (skills ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const existing = new Set(list.map((s) => s.name));

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border/60">
        <div className="flex items-center gap-1 px-4 pb-2 pt-4">
          <span className="mr-auto text-ui-12 font-medium uppercase tracking-wider text-muted-foreground">Skills</span>
          {onOpenBuilder && !side && (
            <Button size="xs" variant="ghost" className="gap-1" onClick={onOpenBuilder}>
              <HugeiconsIcon icon={AiMagicIcon} className="size-3 text-primary" /> Builder
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="xs" variant="outline" className="gap-1">
                <HugeiconsIcon icon={Add01Icon} className="size-3" /> New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onSelect={() => startNew()}>Blank skill</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-ui-11 text-muted-foreground">Start from</DropdownMenuLabel>
              {SKILL_TEMPLATES.filter((t) => !existing.has(t.name)).map((t) => (
                <DropdownMenuItem key={t.name} onSelect={() => startNew(t)} className="items-start gap-2">
                  <AgentIcon icon={t.icon} className="size-6 rounded-lg" />
                  <span className="min-w-0">
                    <span className="block text-ui-13 font-medium">{skillTitle(t.name)}</span>
                    <span className="line-clamp-2 block text-ui-11 text-muted-foreground">{t.description}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {skills == null ? (
            <div className="p-4">
              <Spinner />
            </div>
          ) : list.length === 0 ? (
            <p className="px-3 py-2 text-ui-12 text-muted-foreground">No skills yet. Create one or start from a template.</p>
          ) : (
            list.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => onSelect(s.name)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-muted",
                  (draft && !draft.isNew && draft.name === s.name) && "bg-muted",
                )}
              >
                <AgentIcon icon={skillIcon(s.name, skills)} className="mt-0.5 size-8 rounded-lg" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex w-full items-center gap-1.5">
                  <span className="truncate text-ui-13 font-medium">{skillTitle(s.name)}</span>
                  {!s.enabled && <span className="rounded bg-muted px-1 text-ui-10 text-muted-foreground">off</span>}
                  {!s.valid && <span className="rounded bg-destructive/10 px-1 text-ui-10 text-destructive">invalid</span>}
                  <span className="ml-auto shrink-0 text-ui-10 text-muted-foreground">{s.source}</span>
                </span>
                <span className="line-clamp-2 text-ui-11 text-muted-foreground">{s.description}</span>
                {usage[s.name]?.length ? (
                  <span className="text-ui-10 text-primary">
                    Used by {usage[s.name].length} agent{usage[s.name].length === 1 ? "" : "s"}
                  </span>
                ) : null}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        {draft ? (
          <SkillEditor
            key={draft.rev}
            draft={draft}
            enabled={list.find((s) => s.name === draft.name)?.enabled ?? true}
            source={list.find((s) => s.name === draft.name)?.source}
            usedBy={draft.isNew ? [] : (usage[draft.name] ?? [])}
            onSaved={async (name) => {
              await refresh();
              onSelect(name);
            }}
            onDeleted={async () => {
              await refresh();
              setDraft(null);
              onSelect(null);
            }}
          />
        ) : (
          <div className="mx-auto flex max-w-xl flex-col gap-3 px-8 pt-24">
            <h2 className="font-heading text-ui-22 font-semibold">Skills</h2>
            <p className="text-ui-14 text-muted-foreground">
              A skill is a reusable set of instructions for one kind of work — exploring code, writing tests, research.
              Give skills to agents to make them good at that work. Skills are shared with Studio chat (mention them
              with <code>@name</code>).
            </p>
            {onDescribe && <DescribeBox onSubmit={onDescribe} />}
            <div>
              <Button variant="outline" onClick={() => startNew()}>
                Write one myself
              </Button>
            </div>
          </div>
        )}
      </div>
      {side}
    </div>
  );
}

function SkillEditor({
  draft: initial,
  enabled,
  source,
  usedBy,
  onSaved,
  onDeleted,
}: {
  draft: Draft;
  enabled: boolean;
  source?: string;
  usedBy: string[];
  onSaved: (name: string) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [d, setD] = useState(initial);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const readOnly = source === "bundled";
  const nameOk = NAME_RE.test(d.name) && d.name.length <= 64;
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  const save = async () => {
    setSaving(true);
    try {
      if (d.isNew) await skillsApi.create(d.name, d.description, d.instructions);
      else await skillsApi.update(d.name, d.description, d.instructions);
      if (d.isNew || d.icon !== initial.icon) await skillsApi.setIcon(d.name, d.icon);
      toast.success(d.isNew ? "Skill created" : "Skill saved");
      await onSaved(d.name);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-8 pb-10 pt-10">
      <div className="flex items-center gap-3">
        <AgentIcon icon={d.icon} className="size-12 rounded-2xl" />
        {d.isNew ? (
          <div className="flex-1">
            <Input
              autoFocus
              value={d.name}
              placeholder="skill-name"
              className="font-mono"
              onChange={(e) => setD({ ...d, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
            />
            {!nameOk && d.name ? (
              <p className="mt-1 text-ui-11 text-destructive">Use lowercase letters, numbers and single hyphens.</p>
            ) : (
              d.name && <p className="mt-1 text-ui-11 text-muted-foreground">Shows as “{skillTitle(d.name)}”.</p>
            )}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-heading text-ui-22 font-semibold">{skillTitle(d.name)}</h2>
            <div className="font-mono text-ui-12 text-muted-foreground">{d.name}</div>
          </div>
        )}
        {!d.isNew && (
          <label className="flex items-center gap-2 text-ui-12 text-muted-foreground">
            In Studio chat
            <Switch
              checked={enabled}
              onCheckedChange={(v) =>
                skillsApi
                  .setEnabled(d.name, v)
                  .then(() => useSkillsStore.getState().refresh())
                  .catch((e) => toast.error(e.message))
              }
            />
          </label>
        )}
      </div>

      <div className="-mt-2 flex flex-wrap items-center gap-1.5 text-ui-12 text-muted-foreground">
        {usedBy.length ? (
          <>
            Used by
            {usedBy.map((u) => (
              <span key={u} className="rounded-md bg-primary/10 px-1.5 py-px font-medium text-primary">
                {u}
              </span>
            ))}
          </>
        ) : (
          !d.isNew && "Not used by any agent yet — add it from an agent's settings."
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-ui-13 font-medium">Icon</span>
        <IconPicker value={d.icon} onChange={(icon) => setD({ ...d, icon })} exclude={["crown"]} disabled={readOnly} />
        <span className="text-ui-12 text-muted-foreground">Teammates with this skill show this picture.</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-ui-13 font-medium">When to use it</span>
        <Input
          value={d.description}
          disabled={readOnly}
          placeholder="e.g. Write and run unit tests for a change, then report results."
          onChange={(e) => setD({ ...d, description: e.target.value })}
        />
        <span className="text-ui-12 text-muted-foreground">
          Agents (and team leads) read this to decide when the skill applies. Be specific.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center">
          <span className="text-ui-13 font-medium">Instructions</span>
          <div className="ml-auto flex gap-1 rounded-lg bg-muted p-0.5">
            {(["Edit", "Preview"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPreview(m === "Preview")}
                className={cn(
                  "rounded-md px-2.5 py-0.5 text-ui-12 text-muted-foreground",
                  preview === (m === "Preview") && "bg-background text-foreground shadow-xs",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {preview ? (
          <div className="min-h-[50vh] rounded-xl border border-border/60 px-4 py-3 text-ui-14">
            <Streamdown mode="static" controls={false}>
              {d.instructions}
            </Streamdown>
          </div>
        ) : (
          <Textarea
            className="min-h-[50vh] font-mono text-ui-13 leading-relaxed"
            value={d.instructions}
            disabled={readOnly}
            onChange={(e) => setD({ ...d, instructions: e.target.value })}
          />
        )}
        <span className="text-ui-12 text-muted-foreground">Markdown. Steps, rules and examples work best.</span>
      </div>

      <div className="flex items-center gap-2">
        <Button disabled={readOnly || saving || !nameOk || !d.description.trim() || (!dirty && !d.isNew)} onClick={save}>
          {d.isNew ? "Create skill" : "Save"}
        </Button>
        {readOnly && <span className="text-ui-12 text-muted-foreground">Bundled skills are read-only.</span>}
        {!d.isNew && !readOnly && (
          <Button
            variant="destructive"
            className="ml-auto gap-1.5"
            onClick={async () => {
              if (!window.confirm(`Delete the skill "${d.name}"? Agents using it will lose it.`)) return;
              try {
                await skillsApi.remove(d.name);
                await onDeleted();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function DescribeBox({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  const [v, setV] = useState("");
  const go = () => v.trim() && onSubmit(v.trim());
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-2.5 shadow-sm focus-within:border-primary/50">
      <Textarea
        className="min-h-16 resize-none border-0 bg-transparent px-1.5 py-1 text-ui-14 shadow-none focus-visible:ring-0"
        placeholder="Describe a skill, e.g. Write release notes from a list of merged PRs, grouped by type"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            go();
          }
        }}
      />
      <div className="flex items-center gap-2 px-1.5">
        <HugeiconsIcon icon={AiMagicIcon} className="size-4 text-primary" />
        <span className="text-ui-12 text-muted-foreground">The Builder writes it for you.</span>
        <Button size="sm" className="ml-auto" disabled={!v.trim()} onClick={go}>
          Create skill
        </Button>
      </div>
    </div>
  );
}
