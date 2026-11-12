#!/usr/bin/env node
/**
 * 构建后裁剪 .next/standalone，只保留运行时必需的顶层项。
 *
 * 服务端用 process.cwd() 拼接配置目录、数据库等路径，Next.js 的文件追踪会据此把项目里的
 * config/（含密钥的 app-config.json）、doc/、src/ 等复制进 standalone；在项目根目录构建时
 * 甚至可能带入 data/ 下的部署备份，造成归档递归膨胀。运行时这些路径由工作目录或环境变量提供，
 * 不需要随产物携带。Dockerfile 与安装包构建（scripts/package/build.mjs）使用同样的白名单。
 *
 * 由 npm 的 postbuild 自动执行；也可手动运行：node scripts/prune-standalone.mjs [standalone 目录]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** standalone 顶层允许保留的项；public、.env 由部署流程另行放入，已存在时保留 */
export const ALLOWED_TOP_LEVEL = new Set(["server.js", "package.json", ".next", "node_modules", "public", ".env", ".env.local", ".env.production"]);

/** 删除 standalone 顶层的非白名单项，返回被删除的名称（按字母序） */
export function pruneStandalone(standaloneDir) {
    if (!fs.existsSync(path.join(standaloneDir, "server.js"))) return [];
    const removed = [];
    for (const entry of fs.readdirSync(standaloneDir)) {
        if (ALLOWED_TOP_LEVEL.has(entry)) continue;
        fs.rmSync(path.join(standaloneDir, entry), { recursive: true, force: true });
        removed.push(entry);
    }
    return removed.sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const target = path.resolve(process.argv[2] ?? path.join(ROOT, ".next", "standalone"));
    const removed = pruneStandalone(target);
    process.stdout.write(removed.length ? `standalone 已移除：${removed.join(", ")}\n` : "standalone 无需裁剪\n");
}
