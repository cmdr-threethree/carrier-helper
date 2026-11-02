/**
 * CAPI is inconsistent: most numbers are JSON numbers, but some fields
 * (notably balance, fuel, order stock, and order price) arrive as strings.
 */
export type CapiNumber = number | string;

export interface CarrierName {
  callsign?: string;
  vanityName?: string;
  filteredVanityName?: string;
}

export interface ItineraryEntry {
  departureTime?: string | number | null;
  arrivalTime?: string | number | null;
  state?: string;
  visitDurationSeconds?: CapiNumber;
  starsystem?: string;
}

export interface CarrierItinerary {
  completed?: ItineraryEntry[];
  totalDistanceJumpedLY?: CapiNumber;
  currentJump?: string | null;
}

export interface CarrierCapacity {
  shipPacks?: CapiNumber;
  modulePacks?: CapiNumber;
  cargoForSale?: CapiNumber;
  cargoNotForSale?: CapiNumber;
  cargoSpaceReserved?: CapiNumber;
  crew?: CapiNumber;
  freeSpace?: CapiNumber;
  microresourceCapacityTotal?: CapiNumber;
  microresourceCapacityFree?: CapiNumber;
  microresourceCapacityUsed?: CapiNumber;
  microresourceCapacityReserved?: CapiNumber;
}

export interface MarketFinances {
  cargoTotalValue?: CapiNumber;
  allTimeProfit?: CapiNumber;
  numCommodsForSale?: CapiNumber;
  numCommodsPurchaseOrders?: CapiNumber;
  balanceAllocForPurchaseOrders?: CapiNumber;
}

export interface BartenderFinances {
  microresourcesTotalValue?: CapiNumber;
  allTimeProfit?: CapiNumber;
  microresourcesForSale?: CapiNumber;
  microresourcesPurchaseOrders?: CapiNumber;
  profitHistory?: CapiNumber[];
}

export interface CarrierFinance {
  bankBalance?: CapiNumber;
  bankReservedBalance?: CapiNumber;
  taxation?: CapiNumber;
  service_taxation?: Record<string, CapiNumber>;
  numServices?: CapiNumber;
  numOptionalServices?: CapiNumber;
  debtThreshold?: CapiNumber;
  maintenance?: CapiNumber;
  maintenanceToDate?: CapiNumber;
  coreCost?: CapiNumber;
  servicesCost?: CapiNumber;
  servicesCostToDate?: CapiNumber;
  jumpsCost?: CapiNumber;
  numJumps?: CapiNumber;
  bartender?: BartenderFinances;
}

export interface CrewMember {
  name?: string;
  gender?: string;
  enabled?: string | boolean;
  faction?: string;
  salary?: CapiNumber;
  hiringPrice?: CapiNumber;
  lastEdit?: string | number;
  avatarStr?: string;
}

export interface ServiceCrew {
  crewMember?: CrewMember;
  invoicesWeekToDate?: Array<{
    wages?: CapiNumber;
    from?: string | number;
    until?: string | number;
    type?: string;
  }>;
  status?: string;
}

export interface CommoditySale {
  name?: string;
  stock?: CapiNumber;
  price?: CapiNumber;
  blackmarket?: boolean;
}

export interface CommodityPurchase {
  name?: string;
  total?: CapiNumber;
  outstanding?: CapiNumber;
  price?: CapiNumber;
}

export interface CommodityOrders {
  sales?: CommoditySale[];
  purchases?: CommodityPurchase[];
}

export interface MicroResourceOrder {
  id?: CapiNumber;
  name?: string;
  locName?: string;
  stock?: CapiNumber;
  price?: CapiNumber;
  total?: CapiNumber;
  outstanding?: CapiNumber;
}

export interface MicroResourceOrders {
  sales?: Record<string, MicroResourceOrder> | MicroResourceOrder[];
  purchases?: MicroResourceOrder[];
}

export interface CargoLine {
  commodity?: string;
  mission?: boolean;
  qty?: CapiNumber;
  value?: CapiNumber;
  stolen?: boolean;
  locName?: string;
}

export interface MicroResource {
  id?: CapiNumber;
  quantity?: CapiNumber;
  name?: string;
  locName?: string;
}

export interface CarrierLocker {
  assets?: MicroResource[];
  goods?: MicroResource[];
  data?: MicroResource[];
}

export interface MarketCommodity {
  id?: CapiNumber;
  categoryname?: string;
  name?: string;
  stock?: CapiNumber;
  buyPrice?: CapiNumber;
  sellPrice?: CapiNumber;
  demand?: CapiNumber;
  legality?: string;
  meanPrice?: CapiNumber;
  demandBracket?: CapiNumber;
  stockBracket?: CapiNumber;
  locName?: string;
}

export interface CarrierMarket {
  id?: CapiNumber;
  name?: string;
  outpostType?: string;
  imported?: Record<string, string> | string[];
  exported?: Record<string, string> | string[];
  services?: Record<string, string>;
  commodities?: MarketCommodity[];
  prohibited?: Record<string, string>;
  economies?: Record<string, { name?: string; proportion?: CapiNumber }>;
}

export interface ReputationEntry {
  majorFaction?: string;
  score?: CapiNumber;
}

/**
 * The CAPI changes over time. Every field is optional and unknown
 * top-level fields are deliberately preserved in the raw snapshot.
 */
export interface FleetCarrierResponse {
  name?: CarrierName;
  currentStarSystem?: string;
  balance?: CapiNumber;
  fuel?: CapiNumber;
  state?: string;
  theme?: string;
  dockingAccess?: string;
  notoriousAccess?: boolean;
  capacity?: CarrierCapacity;
  itinerary?: CarrierItinerary;
  marketFinances?: MarketFinances;
  blackmarketFinances?: MarketFinances;
  finance?: CarrierFinance;
  servicesCrew?: Record<string, ServiceCrew | undefined>;
  cargo?: CargoLine[];
  orders?: {
    commodities?: CommodityOrders;
    onfootmicroresources?: MicroResourceOrders;
  };
  carrierLocker?: CarrierLocker;
  reputation?: ReputationEntry[];
  market?: CarrierMarket;
  ships?: unknown;
  modules?: unknown;
  [key: string]: unknown;
}

export interface SummaryItineraryEntry {
  system: string;
  arrivalTime: number | null;
  departureTime: number | null;
  visitDurationSeconds: number;
}

export interface SummaryMetrics {
  balance: number;
  fuel: number;
  state: string;
  theme: string;
  currentSystem: string;
  currentJump: string | null;
  totalDistanceLY: number;
  capacity: {
    total: number;
    used: number;
    free: number;
    cargoForSale: number;
    cargoNotForSale: number;
    reserved: number;
  };
  finance: {
    bankBalance: number;
    reserved: number;
    maintenance: number;
    coreCost: number;
    servicesCost: number;
    jumpsCost: number;
    debtThreshold: number;
    taxation: number;
  };
  market: {
    cargoTotalValue: number;
    allTimeProfit: number;
    numCommodsForSale: number;
    numCommodsPurchaseOrders: number;
  };
  cargo: {
    lines: number;
    totalQty: number;
    totalValue: number;
  };
  orders: {
    sales: number;
    purchases: number;
    microSales: number;
    microPurchases: number;
  };
  services: {
    installed: number;
    active: number;
    optional: number;
  };
  reputation: Array<{ majorFaction: string; score: number }>;
  itinerary: SummaryItineraryEntry[];
}
