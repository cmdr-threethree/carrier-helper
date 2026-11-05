import { z } from 'zod';

const accountSchema = z.object({
  id: z.string().min(1),
  platform: z.string().min(1).default('frontier'),
  displayName: z.string().default(''),
  needsReauth: z.boolean().optional(),
  lastSuccessAt: z.number().optional(),
});

const carrierSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  callsign: z.string().min(1),
  vanityName: z.string().default(''),
  currentSystem: z.string().default('Unknown'),
  lastSeenAt: z.number(),
  createdAt: z.number().optional(),
});

const snapshotSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  carrierId: z.string().min(1),
  fetchedAt: z.number(),
  endpoint: z.literal('/fleetcarrier').default('/fleetcarrier'),
  httpStatus: z.number().int(),
  size: z.number().optional(),
  raw: z.unknown(),
});

const summarySchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  carrierId: z.string().min(1),
  fetchedAt: z.number(),
  metrics: z.record(z.string(), z.unknown()),
});

const marketPointSchema = z.object({
  id: z.string().min(1),
  carrierId: z.string().min(1),
  accountId: z.string().min(1),
  fetchedAt: z.number(),
  commodityKey: z.string().min(1),
  commodityId: z.number().optional(),
  name: z.string(),
  locName: z.string().optional(),
  category: z.string().optional(),
  stock: z.number(),
  buyPrice: z.number(),
  sellPrice: z.number(),
  meanPrice: z.number(),
  demand: z.number(),
  stockBracket: z.number(),
  demandBracket: z.number(),
  hasSaleOrder: z.boolean(),
  saleStock: z.number(),
  salePrice: z.number(),
  saleOrderValue: z.number(),
  hasPurchaseOrder: z.boolean(),
  purchaseOutstanding: z.number(),
  purchasePrice: z.number(),
  purchaseOrderValue: z.number(),
  size: z.number().optional(),
});

const cargoPointSchema = z.object({
  id: z.string().min(1),
  carrierId: z.string().min(1),
  accountId: z.string().min(1),
  fetchedAt: z.number(),
  commodityKey: z.string().min(1),
  name: z.string(),
  locName: z.string().optional(),
  qty: z.number(),
  value: z.number(),
  unitValue: z.number(),
  hasStolen: z.boolean(),
  hasMission: z.boolean(),
  size: z.number().optional(),
});

const seriesStatsSchema = z.object({
  first: z.number(),
  last: z.number(),
  min: z.number(),
  max: z.number(),
  avg: z.number(),
  sum: z.number(),
});

const marketDaySchema = z.object({
  id: z.string().min(1),
  carrierId: z.string().min(1),
  accountId: z.string().min(1),
  commodityKey: z.string().min(1),
  commodityId: z.number().optional(),
  name: z.string(),
  locName: z.string().optional(),
  category: z.string().optional(),
  dayStart: z.number(),
  samples: z.number().int(),
  firstFetchedAt: z.number(),
  lastFetchedAt: z.number(),
  stock: seriesStatsSchema,
  demand: seriesStatsSchema,
  buyPrice: seriesStatsSchema,
  sellPrice: seriesStatsSchema,
  meanPrice: seriesStatsSchema,
  saleSamples: z.number().int(),
  saleStock: seriesStatsSchema,
  salePrice: seriesStatsSchema,
  saleOrderValue: seriesStatsSchema,
  purchaseSamples: z.number().int(),
  purchaseOutstanding: seriesStatsSchema,
  purchasePrice: seriesStatsSchema,
  purchaseOrderValue: seriesStatsSchema,
  size: z.number().optional(),
});

const cargoDaySchema = z.object({
  id: z.string().min(1),
  carrierId: z.string().min(1),
  accountId: z.string().min(1),
  commodityKey: z.string().min(1),
  name: z.string(),
  locName: z.string().optional(),
  dayStart: z.number(),
  samples: z.number().int(),
  firstFetchedAt: z.number(),
  lastFetchedAt: z.number(),
  qty: seriesStatsSchema,
  value: seriesStatsSchema,
  unitValue: seriesStatsSchema,
  size: z.number().optional(),
});

export const backupV1Schema = z.object({
  app: z.literal('carrier-helper'),
  schemaVersion: z.literal(1),
  exportedAt: z.number(),
  accounts: z.array(accountSchema),
  carriers: z.array(carrierSchema),
  snapshots: z.array(snapshotSchema),
  summaries: z.array(summarySchema),
});

export const backupV2Schema = backupV1Schema.extend({
  schemaVersion: z.literal(2),
  marketPoints: z.array(marketPointSchema).default([]),
  cargoPoints: z.array(cargoPointSchema).default([]),
  marketDays: z.array(marketDaySchema).default([]),
  cargoDays: z.array(cargoDaySchema).default([]),
});

export type BackupV1 = z.infer<typeof backupV1Schema>;
export type BackupV2 = z.infer<typeof backupV2Schema>;
export type Backup = BackupV2;
export type BackupInput = BackupV1 | BackupV2;
export type BackupAccount = z.infer<typeof accountSchema>;
export type BackupCarrier = z.infer<typeof carrierSchema>;
export type BackupSnapshot = z.infer<typeof snapshotSchema>;
export type BackupSummary = z.infer<typeof summarySchema>;
export type BackupMarketPoint = z.infer<typeof marketPointSchema>;
export type BackupCargoPoint = z.infer<typeof cargoPointSchema>;
export type BackupMarketDay = z.infer<typeof marketDaySchema>;
export type BackupCargoDay = z.infer<typeof cargoDaySchema>;

export function normalizeBackup(input: BackupInput): BackupV2 {
  if (input.schemaVersion === 2) return input;
  return {
    ...input,
    schemaVersion: 2,
    marketPoints: [],
    cargoPoints: [],
    marketDays: [],
    cargoDays: [],
  };
}

export function validateBackup(input: unknown): BackupV2 {
  return backupV2Schema.parse(input);
}

export function safeValidateBackup(
  input: unknown,
): { ok: true; data: BackupV2 } | { ok: false; error: string } {
  const v2 = backupV2Schema.safeParse(input);
  if (v2.success) return { ok: true, data: v2.data };

  const v1 = backupV1Schema.safeParse(input);
  if (v1.success) {
    return { ok: true, data: normalizeBackup(v1.data) };
  }

  const issues = [...v2.error.issues, ...v1.error.issues]
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || 'backup'}: ${issue.message}`)
    .join('; ');
  return { ok: false, error: issues };
}
