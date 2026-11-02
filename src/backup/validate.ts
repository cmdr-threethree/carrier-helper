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

export const backupSchema = z.object({
  app: z.literal('carrier-helper'),
  schemaVersion: z.literal(1),
  exportedAt: z.number(),
  accounts: z.array(accountSchema),
  carriers: z.array(carrierSchema),
  snapshots: z.array(snapshotSchema),
  summaries: z.array(summarySchema),
});

export type BackupV1 = z.infer<typeof backupSchema>;
export type BackupAccount = z.infer<typeof accountSchema>;
export type BackupCarrier = z.infer<typeof carrierSchema>;
export type BackupSnapshot = z.infer<typeof snapshotSchema>;
export type BackupSummary = z.infer<typeof summarySchema>;

export function validateBackup(input: unknown): BackupV1 {
  return backupSchema.parse(input);
}

export function safeValidateBackup(
  input: unknown,
): { ok: true; data: BackupV1 } | { ok: false; error: string } {
  const result = backupSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || 'backup'}: ${issue.message}`)
      .join('; '),
  };
}
