import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

/** 真实 SQLite 集成测试始终使用临时数据库与正式迁移，绝不访问开发数据库。 */
export function createAgentTestDatabase() {
    const directory = mkdtempSync(join(tmpdir(), "wnb-agent-db-"));
    const url = `file:${join(directory, "test.db")}`;
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
        env: { ...process.env, DATABASE_URL: url }, stdio: "pipe",
    });
    const client = new PrismaClient({ datasources: { db: { url } } });
    return { client, async dispose() { await client.$disconnect(); rmSync(directory, { recursive: true, force: true }); } };
}
