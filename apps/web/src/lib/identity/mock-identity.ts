import type { Actor, IdentityProvider } from './types';

/**
 * Development identity provider.
 *
 * Replace with an OIDC/Entra ID adapter by implementing `IdentityProvider`
 * and registering it in `src/lib/tania/container.ts`. No real credentials,
 * tenants, or endpoints are assumed here.
 */
export const DEMO_ACTOR: Actor = {
  id: 'usr_henri',
  subject: 'usr_henri',
  issuer: 'urn:tania:mock',
  name: 'Henri',
  email: 'henri@dps.telkom.example',
  unit: 'DPS Team',
  role: 'Chapter Lead — Digital Product & Solution',
  clearance: 'CONFIDENTIAL',
  scopes: [
    'knowledge:read',
    'analytics:read',
    'document:create',
    'workflow:run',
    'workflow:approve',
  ],
};

export class MockIdentityProvider implements IdentityProvider {
  readonly id = 'mock';

  constructor(private readonly actor: Actor = DEMO_ACTOR) {}

  async getActor(): Promise<Actor | null> {
    return this.actor;
  }
}
