// SPDX-License-Identifier: AGPL-3.0-only
// Starter skills, agents and teams. Agents are generic; what they're good at comes from skills.

import type { AgentDef, TeamDef, TeamNode } from "./api";

/** A Studio Agent Skill to create on demand (lowercase-hyphen name, like SKILL.md `name`). */
export interface SkillTemplate {
  name: string;
  /** When to use it — the agent (and the lead) read this. */
  description: string;
  instructions: string;
  /** Suggested agent look when an agent is created around this skill. */
  icon: string;
  agentName: string;
  permission: AgentDef["permission"];
}

export const SKILL_TEMPLATES: SkillTemplate[] = [
  {
    name: "code-explorer",
    agentName: "Explorer",
    icon: "search",
    permission: "auto",
    description: "Map unfamiliar code and answer questions about it without changing anything.",
    instructions: `# Code explorer

1. Start from entry points (README, main files, package manifests) and follow imports.
2. Only read files and run read-only commands (git log/grep/ls). Never modify files.
3. Answer with concrete evidence: file paths, line numbers, short quotes.
4. End with a short map: key modules, how they connect, where to change things.`,
  },
  {
    name: "coder",
    agentName: "Coder",
    icon: "code",
    permission: "ask",
    description: "Implement a clearly scoped code change with minimal, idiomatic edits.",
    instructions: `# Coder

1. Read the code you will touch and its callers before editing.
2. Make the smallest change that fully solves the task; follow the existing style.
3. Run the project's build or tests if available.
4. Report exactly which files changed and why.`,
  },
  {
    name: "tester",
    agentName: "Tester",
    icon: "test",
    permission: "ask",
    description: "Write and run tests, then report what passes and fails.",
    instructions: `# Tester

1. Find the project's test framework and conventions; follow them.
2. Cover normal cases, edge cases and errors with focused tests.
3. Run the tests and report pass/fail with the relevant output.
4. Fix failing tests only when the test is wrong; report code bugs instead.`,
  },
  {
    name: "code-reviewer",
    agentName: "Reviewer",
    icon: "eye",
    permission: "auto",
    description: "Review a change for bugs, risks and readability without editing files.",
    instructions: `# Code reviewer

1. Read the diff or files in scope, plus enough surrounding code to judge them.
2. Look for correctness bugs, edge cases, security issues, and unclear code.
3. List concrete findings by severity with file:line and a suggested fix.
4. Never modify files.`,
  },
  {
    name: "researcher",
    agentName: "Researcher",
    icon: "book",
    permission: "auto",
    description: "Gather facts from files and docs and summarize them with sources.",
    instructions: `# Researcher

1. Clarify the question; list what you need to find out.
2. Collect facts from the files/docs available; note where each came from.
3. Separate facts from assumptions.
4. Summarize concisely, with sources.`,
  },
  {
    name: "writer",
    agentName: "Writer",
    icon: "pen",
    permission: "ask",
    description: "Write clear docs, READMEs, reports and other text for a given audience.",
    instructions: `# Writer

1. Identify the audience and purpose; choose structure accordingly.
2. Prefer short sections, lists and examples over long paragraphs.
3. Save the text where the task says (or report it inline).`,
  },
];

const base: Omit<AgentDef, "name" | "description" | "icon" | "instructions" | "skills"> = {
  model: null,
  folder: null,
  permission: "ask",
  max_minutes: 30,
  env: {},
  call: "auto",
};

export function blankAgent(): AgentDef {
  return { ...base, name: "New agent", description: "", icon: "robot", instructions: "", skills: [] };
}

/** A generic agent built around one skill. */
export function agentForSkill(skill: Pick<SkillTemplate, "name" | "description"> & Partial<SkillTemplate>): AgentDef {
  return {
    ...base,
    name: skill.agentName ?? titleCase(skill.name),
    description: skill.description,
    icon: skill.icon ?? "robot",
    permission: skill.permission ?? "ask",
    instructions: "",
    skills: [skill.name],
  };
}

const skillTpl = (name: string) => SKILL_TEMPLATES.find((s) => s.name === name) as SkillTemplate;

const LEAD_INSTRUCTIONS =
  "Plan the work, delegate focused subtasks to the right teammates, check their results, and deliver a final answer that summarizes what was done.";

function lead(name: string, description: string): AgentDef {
  return { ...base, name, description, icon: "crown", instructions: LEAD_INSTRUCTIONS, skills: [] };
}

function team(name: string, description: string, leadDef: AgentDef, members: AgentDef[]): TeamDef {
  const nodes: TeamNode[] = [{ id: "lead", parent: null, agent: leadDef, x: null, y: null }];
  members.forEach((m, i) => nodes.push({ id: `n${i + 1}`, parent: "lead", agent: m, x: null, y: null }));
  return { name, description, nodes };
}

export interface TeamTemplate {
  id: string;
  def: TeamDef;
  example: string;
}

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: "squad",
    example: "Add a dark mode toggle to the settings page, with tests.",
    def: team(
      "Feature squad",
      "Lead plans; agents with explore, code and test skills do the work.",
      lead("Lead", "Plans and coordinates the swarm."),
      ["code-explorer", "coder", "tester"].map((s) => agentForSkill(skillTpl(s))),
    ),
  },
  {
    id: "bugs",
    example: "Users report the export button does nothing. Find and fix it.",
    def: team(
      "Bug hunt",
      "Find the cause, fix it, and get the fix reviewed.",
      lead("Lead", "Coordinates the investigation and fix."),
      ["code-explorer", "coder", "code-reviewer"].map((s) => agentForSkill(skillTpl(s))),
    ),
  },
  {
    id: "research",
    example: "Summarize how authentication works in this repo for a new teammate.",
    def: team(
      "Research & write",
      "Gather facts, then turn them into a document.",
      lead("Editor", "Scopes the question and edits the final text."),
      ["researcher", "writer"].map((s) => agentForSkill(skillTpl(s))),
    ),
  },
  {
    id: "solo",
    example: "Rename the `utils` folder to `lib` and fix all imports.",
    def: team(
      "Solo coder",
      "A single agent that does everything itself. Add teammates any time.",
      { ...agentForSkill(skillTpl("coder")), description: "Reads code, makes changes, runs tests." },
      [],
    ),
  },
];

/** Skill names a team needs that may not exist yet in Studio. */
export function skillsUsed(def: TeamDef): string[] {
  return [...new Set(def.nodes.flatMap((n) => n.agent.skills ?? []))];
}

export function newNodeId(nodes: TeamNode[]): string {
  let i = nodes.length;
  while (nodes.some((n) => n.id === `n${i}`)) i++;
  return `n${i}`;
}

export function titleCase(slug: string) {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
