/**
 * scripts/prune-standalone.mjs 的单元测试：构建后只保留运行时必需的顶层项，
 * 防止本机配置、数据库与部署备份被追踪进 standalone。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = join(resolve(__dirname, "../../.."), "scripts", "prune-standalone.mjs");

function touch(file: string) {
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, "x");
}

describe("prune-standalone.mjs", () => {
    let dir: string;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), "prune-standalone-"));
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("移除配置、数据、源码等非运行时目录，保留服务入口与依赖", () => {
        for (const file of ["server.js", "package.json", ".next/BUILD_ID", "node_modules/a/index.js", ".env.local", "public/sw.js"]) touch(join(dir, file));
        for (const file of ["config/app-config.json", "data/deployments/x/previous-next/a", "prisma/dev.db", "doc/a.md", "src/a.ts", "tsconfig.json"]) touch(join(dir, file));

        const output = execFileSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });

        expect(readdirSync(dir).sort()).toEqual([".env.local", ".next", "node_modules", "package.json", "public", "server.js"]);
        expect(existsSync(join(dir, ".next", "BUILD_ID"))).toBe(true);
        expect(output).toContain("config");
        expect(output).toContain("data");
    });

    it("目录不是 standalone 产物时不做任何删除", () => {
        touch(join(dir, "config", "app-config.json"));

        execFileSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });

        expect(existsSync(join(dir, "config", "app-config.json"))).toBe(true);
    });
});
