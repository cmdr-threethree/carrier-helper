export const CARRIER_TABS = [
  'overview',
  'market',
  'finances',
  'cargo',
  'itinerary',
  'services',
  'raw',
] as const;

export type CarrierTab = (typeof CARRIER_TABS)[number];

export type Route =
  | { name: 'dashboard' }
  | { name: 'carrier'; carrierId: string; tab: CarrierTab }
  | { name: 'history' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#/, '').replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] === 'carrier' && parts[1]) {
    const tab = CARRIER_TABS.includes(parts[2] as CarrierTab)
      ? (parts[2] as CarrierTab)
      : 'overview';
    return { name: 'carrier', carrierId: parts[1], tab };
  }
  if (parts[0] === 'history') return { name: 'history' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'dashboard' };
}

export function carrierHref(carrierId: string, tab: CarrierTab = 'overview'): string {
  return `#/carrier/${encodeURIComponent(carrierId)}/${tab}`;
}

export function routeSection(route: Route): 'dashboard' | 'history' | 'settings' | 'carrier' {
  return route.name === 'carrier' ? 'carrier' : route.name;
}
