// SPDX-License-Identifier: AGPL-3.0-only

import { cn } from "@/lib/utils";
import {
  Book02Icon,
  Brain01Icon,
  Bug01Icon,
  Calculator01Icon,
  Calendar03Icon,
  ChartLineData01Icon,
  CodeIcon,
  ComputerTerminal01Icon,
  CrownIcon,
  DatabaseIcon,
  File01Icon,
  GitBranchIcon,
  Globe02Icon,
  Idea01Icon,
  Image01Icon,
  Layers01Icon,
  Mail01Icon,
  Message01Icon,
  PaintBoardIcon,
  PuzzleIcon,
  QuillWrite01Icon,
  RoboticIcon,
  Rocket01Icon,
  Search01Icon,
  Shield01Icon,
  SparklesIcon,
  TestTube01Icon,
  ViewIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/** Pictures for skills (SKILL.md metadata.icon) and agents. Keep in sync with backend skills.ICONS. */
export const AGENT_ICONS = {
  spark: SparklesIcon,
  code: CodeIcon,
  search: Search01Icon,
  test: TestTube01Icon,
  eye: ViewIcon,
  bug: Bug01Icon,
  book: Book02Icon,
  pen: QuillWrite01Icon,
  terminal: ComputerTerminal01Icon,
  database: DatabaseIcon,
  globe: Globe02Icon,
  chart: ChartLineData01Icon,
  shield: Shield01Icon,
  paint: PaintBoardIcon,
  rocket: Rocket01Icon,
  chat: Message01Icon,
  file: File01Icon,
  idea: Idea01Icon,
  wrench: Wrench01Icon,
  git: GitBranchIcon,
  calculator: Calculator01Icon,
  mail: Mail01Icon,
  calendar: Calendar03Icon,
  image: Image01Icon,
  layers: Layers01Icon,
  brain: Brain01Icon,
  puzzle: PuzzleIcon,
  robot: RoboticIcon,
  crown: CrownIcon,
};

export type IconName = keyof typeof AGENT_ICONS;

export function AgentIcon({ icon, className }: { icon: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary",
        className,
      )}
    >
      <HugeiconsIcon
        icon={AGENT_ICONS[icon as IconName] ?? SparklesIcon}
        className="size-[55%]"
        strokeWidth={1.75}
      />
    </span>
  );
}

/** Small inline glyph (chips, menus). */
export function SkillGlyph({ icon, className }: { icon: string; className?: string }) {
  return (
    <HugeiconsIcon
      icon={AGENT_ICONS[icon as IconName] ?? SparklesIcon}
      className={cn("size-3.5 shrink-0", className)}
      strokeWidth={1.75}
    />
  );
}

/** Icon grid picker. */
export function IconPicker({
  value,
  onChange,
  exclude = [],
  disabled,
}: { value: string; onChange: (icon: string) => void; exclude?: string[]; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.keys(AGENT_ICONS)
        .filter((i) => !exclude.includes(i))
        .map((icon) => (
          <button
            key={icon}
            type="button"
            disabled={disabled}
            aria-label={`Icon: ${icon}`}
            aria-pressed={value === icon}
            title={icon}
            onClick={() => onChange(icon)}
            className={cn(
              "rounded-xl ring-offset-2 ring-offset-background transition-opacity disabled:pointer-events-none",
              value === icon ? "ring-2 ring-primary" : "opacity-55 hover:opacity-100",
            )}
          >
            <AgentIcon icon={icon} className="size-7 rounded-lg" />
          </button>
        ))}
    </div>
  );
}
