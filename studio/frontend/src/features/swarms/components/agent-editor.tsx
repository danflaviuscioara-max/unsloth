// SPDX-License-Identifier: AGPL-3.0-only

import { SegmentedControl } from "@/components/segmented-control";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type ReactNode, useEffect, useState } from "react";
import type { AgentDef, CallMode, LocalModel, Permission } from "../api";
import { skillIcon, skillTitle, usableSkills, useSkillsStore } from "../skills-store";
import { AgentIcon, IconPicker, SkillGlyph } from "./agent-icon";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const CALL_HELP: Record<CallMode, string> = {
  auto: "The lead calls this teammate only when its skills fit the task.",
  always: "Mandatory: it gets work on every task. If the lead skips it, Studio reminds the lead, then runs it anyway.",
};

const PERMISSION_HELP: Record<Permission, string> = {
  ask: "Asks you before running commands or touching files outside the folder. Safest.",
  auto: "Runs routine actions on its own and asks only for risky ones.",
  full: "Never asks. Only use in a folder you don't mind it changing.",
};

export function AgentEditor({
  value,
  models,
  isNew,
  isLead = true,
  onSave,
  onDelete,
  onCancel,
  onManageSkills,
}: {
  value: AgentDef;
  models: LocalModel[];
  isNew: boolean;
  isLead?: boolean;
  onSave: (def: AgentDef) => Promise<void>;
  onDelete?: () => void;
  onCancel?: () => void;
  onManageSkills?: (skill?: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const set = <K extends keyof AgentDef>(k: K, v: AgentDef[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);

  return (
    <form
      className="flex max-w-2xl flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          await onSave(draft);
        } finally {
          setSaving(false);
        }
      }}
    >
      {isLead ? (
        <Field label="Name">
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} required maxLength={120} />
          <div className="pt-1">
            <IconPicker value={draft.icon} onChange={(v) => set("icon", v)} />
          </div>
        </Field>
      ) : (
        <Field
          label="Skills"
          hint="Skills define this teammate: its name, picture and know-how. It loads a skill when the work needs it."
        >
          <SkillPicker value={draft.skills ?? []} onChange={(v) => set("skills", v)} onManage={onManageSkills} />
        </Field>
      )}

      <Field
        label={isLead ? "Role" : "When should the lead use this agent?"}
        hint={isLead ? undefined : "The lead reads this to decide what to delegate here."}
      >
        <Input
          value={draft.description}
          placeholder={isLead ? "e.g. Plans the work and coordinates the swarm" : "e.g. Writes and runs tests for a change"}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      {!isLead && (
        <Field label="When it runs" hint={CALL_HELP[draft.call ?? "auto"]}>
          <SegmentedControl
            ariaLabel="When it runs"
            value={draft.call ?? "auto"}
            onValueChange={(v) => set("call", v)}
            options={[
              { value: "auto", label: "When the lead decides" },
              { value: "always", label: "On every task" },
            ]}
          />
        </Field>
      )}

      <Field label="Instructions" hint="How the agent should work. Added in front of every task.">
        <Textarea
          className="min-h-32"
          value={draft.instructions}
          placeholder="e.g. Always run the tests after changing code. Prefer small, focused changes."
          onChange={(e) => set("instructions", e.target.value)}
        />
      </Field>

      {isLead && (
        <Field label="Skills" hint="Optional. The lead mostly coordinates; give skills to teammates instead.">
          <SkillPicker value={draft.skills ?? []} onChange={(v) => set("skills", v)} onManage={onManageSkills} />
        </Field>
      )}

      <Field label="Model" hint={models.length ? undefined : "No model is loaded right now. Load one in the Model hub."}>
        <select
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-ui-13"
          value={draft.model ?? ""}
          onChange={(e) => set("model", e.target.value || null)}
        >
          <option value="">Whichever model is loaded</option>
          {draft.model && !models.some((m) => m.id === draft.model) && (
            <option value={draft.model}>{draft.model} (not loaded)</option>
          )}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Project folder"
        hint={
          isLead
            ? "Where the swarm works. Leave empty for a private scratch folder (you can also pick one per task)."
            : "Leave empty to work in the same folder as the lead."
        }
      >
        <Input
          className="font-mono text-ui-12"
          value={draft.folder ?? ""}
          placeholder={"C:\\path\\to\\project"}
          onChange={(e) => set("folder", e.target.value || null)}
        />
      </Field>

      <Field label="Permissions" hint={PERMISSION_HELP[draft.permission]}>
        <SegmentedControl
          ariaLabel="Permissions"
          value={draft.permission}
          onValueChange={(v) => set("permission", v)}
          options={[
            { value: "ask", label: "Ask me" },
            { value: "auto", label: "Auto" },
            { value: "full", label: "Full access" },
          ]}
        />
      </Field>

      <Field label="Time limit" hint="The run stops after this many minutes.">
        <Input
          type="number"
          className="w-28"
          min={1}
          max={1440}
          value={draft.max_minutes}
          onChange={(e) => set("max_minutes", Math.max(1, Number(e.target.value) || 1))}
        />
      </Field>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" disabled={saving || (!dirty && !isNew) || (isLead && !draft.name.trim())}>
          {isNew ? "Create agent" : "Save changes"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {onDelete && (
          <Button type="button" variant="destructive" className="ml-auto" onClick={onDelete}>
            {isLead ? "Delete swarm" : "Remove agent"}
          </Button>
        )}
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-ui-13 font-medium">{label}</span>
      {children}
      {hint && <span className="text-ui-12 text-muted-foreground">{hint}</span>}
    </div>
  );
}

function SkillPicker({
  value,
  onChange,
  onManage,
}: { value: string[]; onChange: (v: string[]) => void; onManage?: (skill?: string) => void }) {
  const raw = useSkillsStore((s) => s.skills);
  const all = usableSkills(raw);
  const known = new Set(all.map((s) => s.name));
  const free = all.filter((s) => !value.includes(s.name));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value.map((name) => (
        <span
          key={name}
          className={cn(
            "flex items-center gap-1 rounded-lg py-0.5 pl-2 pr-1 text-ui-12 font-medium",
            known.has(name) ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
          )}
          title={known.has(name) ? undefined : "This skill no longer exists"}
        >
          {onManage && known.has(name) ? (
            <button type="button" className="flex items-center gap-1 hover:underline" title="Open in Skills" onClick={() => onManage(name)}>
              <SkillGlyph icon={skillIcon(name, raw)} />
              {skillTitle(name)}
            </button>
          ) : (
            <>
              <SkillGlyph icon={skillIcon(name, raw)} />
              {skillTitle(name)}
            </>
          )}
          <button type="button" aria-label={`Remove ${name}`} onClick={() => onChange(value.filter((v) => v !== name))} className="rounded p-0.5 hover:bg-background/60">
            <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
          </button>
        </span>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="xs" variant="outline" className="gap-1">
            <HugeiconsIcon icon={Add01Icon} className="size-3" /> Add skill
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
          <DropdownMenuLabel>Your skills</DropdownMenuLabel>
          {free.length === 0 && <div className="px-3 py-1.5 text-ui-12 text-muted-foreground">No more skills to add.</div>}
          {free.map((s) => (
            <DropdownMenuItem key={s.name} onSelect={() => onChange([...value, s.name])} className="items-start gap-2">
              <AgentIcon icon={skillIcon(s.name, raw)} className="size-6 rounded-lg" />
              <span className="min-w-0">
                <span className="block text-ui-13 font-medium">{skillTitle(s.name)}</span>
                <span className="line-clamp-2 block text-ui-11 text-muted-foreground">{s.description}</span>
              </span>
            </DropdownMenuItem>
          ))}
          {onManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onManage()}>Create or edit skills…</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
