import { getApprovalStore, getIdentityProvider, getPersistenceStatus } from '@/lib/tania/container';
import {
  MockAgentService,
  MockDashboardService,
  MockKnowledgeService,
  MockSettingsService,
  MockWorkService,
} from './mock/services';
import type { PortalServices } from './services';

/**
 * Composition root for the screens.
 *
 * Today every screen is served by a mock; approvals and identity already come
 * from the real governance layer. Swapping in a live adapter is a change here,
 * not in the components.
 */
const services: PortalServices = {
  dashboard: new MockDashboardService(),
  work: new MockWorkService({
    loadApprovals: async () => {
      const actor = await getIdentityProvider().getActor();
      return actor ? getApprovalStore().list(actor) : [];
    },
    approvalsDurable: getPersistenceStatus().approvalsDurable,
  }),
  knowledge: new MockKnowledgeService({
    loadActor: () => getIdentityProvider().getActor(),
  }),
  agents: new MockAgentService(),
  settings: new MockSettingsService({
    loadActor: () => getIdentityProvider().getActor(),
    persistence: getPersistenceStatus(),
  }),
};

export function getPortalServices(): PortalServices {
  return services;
}

export * from './services';
export * from './types';
