import { describe, expect, it } from 'vitest';
import { carrierHref, parseRoute, routeSection } from '../src/ui/route';

describe('routes', () => {
  it('parses the carrier history tab', () => {
    const route = parseRoute('#/carrier/abc-123/history');
    expect(route).toEqual({ name: 'carrier', carrierId: 'abc-123', tab: 'history' });
    expect(carrierHref('abc-123', 'history')).toBe('#/carrier/abc-123/history');
    expect(routeSection(route)).toBe('carrier');
  });

  it('falls back to the dashboard for the retired global history route', () => {
    expect(parseRoute('#/history')).toEqual({ name: 'dashboard' });
  });

  it('keeps settings navigation separate', () => {
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(routeSection({ name: 'settings' })).toBe('settings');
  });
});
