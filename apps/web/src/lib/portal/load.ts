import { cache } from 'react';
import { getPortalServices } from './index';
import type { SimulatedState } from './services';

/**
 * Per-request memoised loaders.
 *
 * Several panels on one screen read the same snapshot; `cache` means they share
 * a single call while each keeps its own Suspense boundary and fallback.
 */
export const loadDashboard = cache(async (simulate: SimulatedState) =>
  getPortalServices().dashboard.getSnapshot({ simulate }),
);

export const loadWorkQueue = cache(async (simulate: SimulatedState) =>
  getPortalServices().work.getQueue({ simulate }),
);

export const loadKnowledge = cache(async (simulate: SimulatedState) =>
  getPortalServices().knowledge.getOverview({ simulate }),
);

export const loadAgents = cache(async (simulate: SimulatedState) =>
  getPortalServices().agents.listAgents({ simulate }),
);

export const loadSettings = cache(async (simulate: SimulatedState) =>
  getPortalServices().settings.getSnapshot({ simulate }),
);
