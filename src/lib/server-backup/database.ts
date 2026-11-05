import "server-only";

import { DatabaseSync } from "node:sqlite";

/** 只读扫描快照中的全部文本列，包含 JSON 草稿，也兼容以后增加的图片字段。 */
export function inspectDatabase(filename: string) {
    const db = new DatabaseSync(filename, { readOnly: true });
    try {
        const integrity = db.prepare("PRAGMA integrity_check").all().map((row) => String(row.integrity_check));
        if (integrity.length !== 1 || integrity[0] !== "ok") throw new Error("DATABASE_INTEGRITY_FAILED");
        const images = new Set<string>();
        const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
        for (const table of tables) {
            // 表名仅来自快照数据库，双引号转义后作为标识符使用。
            const name = String(table.name).replace(/"/g, '""');
            for (const row of db.prepare(`SELECT * FROM "${name}"`).iterate()) {
                for (const value of Object.values(row)) {
                    if (typeof value !== "string" || !value.includes("local-image:")) continue;
                    for (const match of value.matchAll(/local-image:[a-f0-9]{64}\.(?:jpg|png|webp|gif)/g)) images.add(match[0]);
                }
            }
        }
        const count = (table: string) => Number(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()?.count || 0);
        return { integrity: "ok", users: count("User"), errorItems: count("ErrorItem"), images: [...images].sort() };
    } finally {
        db.close();
    }
}
