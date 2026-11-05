import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { strToU8, zipSync } from "fflate";

/** 与 standalone 根目录下被显式追踪的 Skill 源目录保持一致。 */
export async function createAgentSkillZip(origin: string): Promise<Uint8Array> {
    const folder = "wrong-notebook-import";
    const root = path.join(process.cwd(), "packaging", "agent-skill", folder);
    const files: Record<string, Uint8Array> = {};

    async function collect(directory: string, prefix: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const filePath = path.join(directory, entry.name);
            const zipPath = `${prefix}/${entry.name}`;
            if (entry.isDirectory()) await collect(filePath, zipPath);
            else if (entry.isFile()) files[zipPath] = await readFile(filePath);
        }
    }

    await collect(root, folder);
    files[`${folder}/README.txt`] = strToU8(
        `MCP: ${origin}/api/mcp\n\nCodex: 解压到 ~/.agents/skills/\nWorkBuddy: 技能 → 上传技能\n\n此压缩包不包含令牌，请在 AI Agent 接入设置中单独配置。\n`,
    );
    return zipSync(files);
}
