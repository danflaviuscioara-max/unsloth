// SPDX-License-Identifier: AGPL-3.0-only
// Swarms extension (unslotth-agent).

import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { requireAuth } from "../auth-guards";
import { Route as rootRoute } from "./__root";

const SwarmsPage = lazyRouteComponent(() => import("@/features/swarms/swarms-page"), "SwarmsPage");

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/swarms",
  staticData: { title: "Swarms" },
  beforeLoad: () => requireAuth(),
  component: SwarmsPage,
});
