// SPDX-License-Identifier: AGPL-3.0-only
// Skills: the building blocks of agents. Own page (sidebar row), with the Builder assistant.

import { toast } from "@/lib/toast";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type Team, swarmsApi, skillsApi } from "./api";
import { BuilderPanel } from "./components/builder-panel";
import { SkillsView } from "./components/skills-view";
import { agentLook, useSkillsStore } from "./skills-store";

export function SkillsPage() {
  const { skill } = useSearch({ from: "/skills" });
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[]>([]);
  const [version, setVersion] = useState(0);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderPrompt, setBuilderPrompt] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refreshSkills = useSkillsStore((s) => s.refresh);
  const skillsList = useSkillsStore((s) => s.skills);

  useEffect(() => {
    swarmsApi.teams().then(setTeams).catch((e) => toast.error(String(e.message ?? e)));
  }, []);

  const select = (name: string | null) =>
    navigate({ to: "/skills", search: name ? { skill: name } : {}, replace: true });

  // skill name -> "Agent (Team)" for every agent that has it.
  const usage: Record<string, string[]> = {};
  for (const t of teams)
    for (const n of t.nodes)
      for (const s of n.agent.skills ?? [])
        (usage[s] ??= []).push(`${agentLook(n.agent, n.parent == null, skillsList).name} (${t.name})`);

  return (
    <div className="relative flex h-full min-h-0">
      <main className="relative min-w-0 flex-1">
        <SkillsView
          usage={usage}
          selected={skill ?? null}
          onSelect={select}
          version={version}
          side={
            builderOpen ? (
              <BuilderPanel
                key={nonce}
                teamId={null}
                skill={skill ?? null}
                initialPrompt={builderPrompt}
                onInitialPromptSent={() => setBuilderPrompt(null)}
                prepareUndo={async () => {
                  // Snapshot the open skill so edits to it can be reverted; created skills get deleted.
                  const before = skill ? await skillsApi.get(skill).catch(() => null) : null;
                  return async (actions) => {
                    for (const a of actions) {
                      if (a.kind === "skill_created" && a.skill) await skillsApi.remove(a.skill);
                      if (a.kind === "skill_updated" && before && a.skill === before.name) {
                        await skillsApi.update(before.name, before.description, before.instructions);
                        const icon = before.metadata?.icon;
                        if (icon) await skillsApi.setIcon(before.name, icon).catch(() => {});
                      }
                    }
                  };
                }}
                suggestions={[
                  "Create a skill for reviewing pull requests for security issues",
                  "Make the open skill's steps more concrete, with an example",
                  "Create a skill that writes clear commit messages",
                ]}
                onActions={async (actions) => {
                  await refreshSkills();
                  const created = actions.find((a) => a.kind === "skill_created");
                  if (created?.skill) select(created.skill);
                  setVersion((v) => v + 1);
                }}
                onClose={() => setBuilderOpen(false)}
              />
            ) : null
          }
          onOpenBuilder={() => setBuilderOpen(true)}
          onDescribe={(p) => {
            setBuilderPrompt(`Create a skill: ${p}`);
            setNonce((n) => n + 1);
            setBuilderOpen(true);
          }}
        />
      </main>
    </div>
  );
}
