// SPDX-License-Identifier: AGPL-3.0-only
// Studio Agent Skills, shared by the skills editor, agent inspector and add-agent menus.

import { create } from "zustand";
import { type Skill, skillsApi } from "./api";
import type { AgentDef } from "./api";
import { SKILL_TEMPLATES, titleCase } from "./templates";

interface SkillsState {
  skills: Skill[] | null;
  error: string | null;
  refresh: () => Promise<Skill[]>;
}

export const useSkillsStore = create<SkillsState>((set) => ({
  skills: null,
  error: null,
  refresh: async () => {
    try {
      const skills = await skillsApi.list();
      set({ skills, error: null });
      return skills;
    } catch (e) {
      set({ error: (e as Error).message });
      return [];
    }
  },
}));

/** Usable skills (valid, not shadowed), sorted by name. */
export function usableSkills(skills: Skill[] | null): Skill[] {
  return (skills ?? []).filter((s) => s.valid && !s.shadowed).sort((a, b) => a.name.localeCompare(b.name));
}

/** Create any template skills in `names` that Studio doesn't have yet (e.g. when creating a team from a template). */
export async function ensureTemplateSkills(names: string[]): Promise<void> {
  const existing = new Set((await skillsApi.list()).map((s) => s.name));
  for (const name of names) {
    if (existing.has(name)) continue;
    const tpl = SKILL_TEMPLATES.find((t) => t.name === name);
    if (!tpl) continue;
    try {
      await skillsApi.create(tpl.name, tpl.description, tpl.instructions);
      await skillsApi.setIcon(tpl.name, tpl.icon).catch(() => {});
    } catch (e) {
      if (!/already exists|409/i.test((e as Error).message)) throw e;
    }
  }
  await useSkillsStore.getState().refresh();
}

// -- look -------------------------------------------------------------------------------------
// A skill is what a subagent *is*: its picture and name come from its skills (backend team.sync_identity
// stores the same on save; the UI derives it live so it never lags behind).

/** Picture for a skill: SKILL.md metadata.icon, else the starter template's, else a sparkle. */
export function skillIcon(name: string, skills: Skill[] | null): string {
  const meta = skills?.find((s) => s.name === name)?.metadata?.icon;
  return meta || SKILL_TEMPLATES.find((t) => t.name === name)?.icon || "spark";
}

export const skillTitle = titleCase;

/** How an agent shows up: the lead (or a skill-less agent) as configured, a subagent as its skills. */
export function agentLook(agent: AgentDef, isLead: boolean, skills: Skill[] | null): { name: string; icon: string } {
  const sk = agent.skills ?? [];
  if (isLead || sk.length === 0) return { name: agent.name, icon: agent.icon };
  const first = skillTitle(sk[0]);
  const name = sk.length === 1 ? first : sk.length === 2 ? `${first} & ${skillTitle(sk[1])}` : `${first} +${sk.length - 1}`;
  // Keep a dedupe suffix the backend added ("Coder 2").
  const suffix = agent.name.startsWith(name) ? agent.name.slice(name.length).match(/^ \d+$/)?.[0] ?? "" : "";
  return { name: name + suffix, icon: skillIcon(sk[0], skills) };
}
