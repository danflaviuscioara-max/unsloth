// SPDX-License-Identifier: AGPL-3.0-only
// Swarms extension (unslotth-agent): skill builder.

import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { requireAuth } from "../auth-guards";
import { Route as rootRoute } from "./__root";

const SkillsPage = lazyRouteComponent(() => import("@/features/swarms/skills-page"), "SkillsPage");

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/skills",
  staticData: { title: "Skills" },
  validateSearch: (search: Record<string, unknown>): { skill?: string } =>
    typeof search.skill === "string" && search.skill ? { skill: search.skill } : {},
  beforeLoad: () => requireAuth(),
  component: SkillsPage,
});
