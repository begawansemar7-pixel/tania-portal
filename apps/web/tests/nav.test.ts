import { describe, expect, it } from 'vitest';
import { ALL_NAV_ITEMS, NAV_PRIMARY, currentNavItem, isActivePath } from '@/lib/nav';

describe('navigation model', () => {
  it('exposes the primary destinations plus home and settings', () => {
    expect(NAV_PRIMARY.map((item) => item.label)).toEqual([
      'Dashboard',
      'My Work',
      'TANIA',
      'Knowledge',
      'Agents',
      'Documents',
      'Analytics',
      'Command Center',
    ]);
    expect(ALL_NAV_ITEMS).toHaveLength(10);
    expect(ALL_NAV_ITEMS.at(-1)?.label).toBe('Settings');
  });

  it('marks home active only on the exact root path', () => {
    expect(isActivePath('/', '/')).toBe(true);
    expect(isActivePath('/dashboard', '/')).toBe(false);
  });

  it('marks a section active for its nested routes', () => {
    expect(isActivePath('/knowledge', '/knowledge')).toBe(true);
    expect(isActivePath('/knowledge/policies', '/knowledge')).toBe(true);
    expect(isActivePath('/knowledgebase', '/knowledge')).toBe(false);
  });

  it('resolves the current item for the top bar', () => {
    expect(currentNavItem('/my-work')?.label).toBe('My Work');
    // `usePathname()` never carries a query string, so lookups use the path only.
    expect(currentNavItem('/tania')?.label).toBe('TANIA');
    expect(currentNavItem('/knowledge/policies')?.label).toBe('Knowledge');
    expect(currentNavItem('/')?.label).toBe('Home');
    expect(currentNavItem('/unknown')).toBeUndefined();
  });

  it('gives every destination a description for the sidebar tooltip and top bar', () => {
    for (const item of ALL_NAV_ITEMS) {
      expect(item.description.length).toBeGreaterThan(0);
    }
  });
});
