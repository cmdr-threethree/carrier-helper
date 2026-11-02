export interface CarrierName {
  callsign?: string;
  vanityName?: string;
  filteredVanityName?: string;
}

export interface ItineraryEntry {
  departureTime?: string | number | null;
  arrivalTime?: string | number | null;
  state?: string;
  visitDurationSeconds?: number;
  starsystem?: string;
}

export interface CarrierItinerary {
  completed?: ItineraryEntry[];
  totalDistanceJumpedLY?: number;
  currentJump?: string | null;
}

export interface CarrierCapacity {
  shipPacks?: number;
  modulePacks?: number;
  cargoForSale?: number;
  cargoNotForSale?: number;
  cargoSpaceReserved?: number;
  crew?: number;
  freeSpace?: number;
  microresourceCapacityTotal?: number;
  microresourceCapacityFree?: number;
  microresourceCapacityUsed?: number;
  microresourceCapacityReserved?: number;
}

export interface MarketFinances {
  cargoTotalValue?: number;
  allTimeProfit?: number;
  numCommodsForSale?: number;
  numCommodsPurchaseOrders?: number;
  balanceAllocForPurchaseOrders?: number;
}

export interface BartenderFinances {
  microresourcesTotalValue?: number;
  allTimeProfit?: number;
  microresourcesForSale?: number;
  microresourcesPurchaseOrders?: number;
  profitHistory?: number[];
}

export interface CarrierFinance {
  bankBalance?: number;
  bankReservedBalance?: number;
  taxation?: number;
  service_taxation?: Record<string, number>;
  numServices?: number;
  numOptionalServices?: number;
  debtThreshold?: number;
  maintenance?: number;
  maintenanceToDate?: number;
  coreCost?: number;
  servicesCost?: number;
  servicesCostToDate?: number;
  jumpsCost?: number;
  numJumps?: number;
  bartender?: BartenderFinances;
}

export interface CrewMember {
  name?: string;
  gender?: string;
  enabled?: string | boolean;
  faction?: string;
  salary?: number;
  hiringPrice?: number;
  lastEdit?: string | number;
  avatarStr?: string;
}

export interface ServiceCrew {
  crewMember?: CrewMember;
  invoicesWeekToDate?: Array<{
    wages?: number;
    from?: string | number;
    until?: string | number;
    type?: string;
  }>;
  status?: string;
}

export interface CommoditySale {
  name?: string;
  stock?: number;
  price?: number;
  blackmarket?: boolean;
}

export interface CommodityPurchase {
  name?: string;
  total?: number;
  outstanding?: number;
  price?: number;
}

export interface CommodityOrders {
  sales?: CommoditySale[];
  purchases?: CommodityPurchase[];
}

export interface MicroResourceOrder {
  id?: number;
  name?: string;
  locName?: string;
  stock?: number;
  price?: number;
  total?: number;
  outstanding?: number;
}

export interface MicroResourceOrders {
  sales?: Record<string, MicroResourceOrder> | MicroResourceOrder[];
  purchases?: MicroResourceOrder[];
}

export interface CargoLine {
  commodity?: string;
  mission?: boolean;
  qty?: number;
  value?: number;
  stolen?: boolean;
  locName?: string;
}

export interface MicroResource {
  id?: number;
  quantity?: number;
  name?: string;
  locName?: string;
}

export interface CarrierLocker {
  assets?: MicroResource[];
  goods?: MicroResource[];
  data?: MicroResource[];
}

export interface MarketCommodity {
  id?: number;
  categoryname?: string;
  name?: string;
  stock?: number;
  buyPrice?: number;
  sellPrice?: number;
  demand?: number;
  legality?: string;
  meanPrice?: number;
  demandBracket?: number;
  stockBracket?: number;
  locName?: string;
}

export interface CarrierMarket {
  id?: number;
  name?: string;
  outpostType?: string;
  imported?: Record<string, string> | string[];
  exported?: Record<string, string> | string[];
  services?: Record<string, string>;
  commodities?: MarketCommodity[];
  prohibited?: Record<string, string>;
  economies?: Record<string, { name?: string; proportion?: number }>;
}

export interface ReputationEntry {
  majorFaction?: string;
  score?: number;
}

/**
 * The CAPI changes over time. Every field is optional and unknown
 * top-level fields are deliberately preserved in the raw snapshot.
 */
export interface FleetCarrierResponse {
  name?: CarrierName;
  currentStarSystem?: string;
  balance?: number;
  fuel?: number;
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
