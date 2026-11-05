import { z } from "zod";

export const imageReferenceSchema = z.string().regex(/^local-image:[a-f0-9]{64}\.(jpg|png|webp|gif)$/);
export const manifestSchema = z.object({
    version: z.literal(1),
    createdAt: z.iso.datetime(),
    appVersion: z.string(),
    backupVersion: z.number().int(),
    database: z.object({ file: z.literal("database.sqlite"), size: z.number().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    images: z.array(imageReferenceSchema),
    referencedImages: z.number().int().nonnegative(),
    missingImages: z.number().int().nonnegative(),
    corruptImages: z.number().int().nonnegative(),
    copiedImages: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
});
export type BackupManifest = z.infer<typeof manifestSchema>;

export const statusSchema = z.object({
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    lastSuccessAt: z.iso.datetime().nullable(),
    result: z.enum(["never", "running", "success", "failed"]),
    errorCode: z.string().nullable(),
    manifest: manifestSchema.nullable(),
});
export type BackupStatus = z.infer<typeof statusSchema>;
export interface BackupSnapshot { name: string; createdAt: string; size: number }
export interface BackupOverview {
    directory: string;
    keep: number;
    enabled: boolean;
    running: boolean;
    stale: boolean;
    status: BackupStatus;
    snapshots: BackupSnapshot[];
}
export function emptyStatus(): BackupStatus {
    return { startedAt: null, finishedAt: null, lastSuccessAt: null, result: "never", errorCode: null, manifest: null };
}
