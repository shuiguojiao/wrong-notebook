export interface SurfaceLedger { day: string; count: number }
export function parseSurfaceLedger(raw: string | null | undefined): SurfaceLedger | null {
    try {
        const value: unknown = JSON.parse(raw ?? "null");
        if (!value || typeof value !== "object") return null;
        const row = value as Record<string, unknown>;
        return typeof row.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.day)
            && typeof row.count === "number" && Number.isInteger(row.count) && row.count >= 0 && row.count <= 3
            ? { day: row.day, count: row.count } : null;
    } catch { return null; }
}

