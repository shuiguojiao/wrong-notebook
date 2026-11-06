import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { strFromU8, strToU8, zipSync } from "fflate";
import { agentSkillRoot, parseAgentSkillVersion } from "@/lib/agent/skill-version";

/** 与 standalone 根目录下被显式追踪的 Skill 源目录保持一致。 */
export async function createAgentSkillZip(origin: string): Promise<Uint8Array> {
    const folder = "wrong-notebook-import";
    const root = agentSkillRoot();
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
    const version = parseAgentSkillVersion(strFromU8(files[`${folder}/SKILL.md`]));
    files[`${folder}/README.txt`] = strToU8(
        `Skill-Version: ${version}\nMCP: ${origin}/api/mcp\n更新下载: ${origin}/api/agent/skill\n\nCodex: 解压到 ~/.agents/skills/；更新步骤见 SKILL.md，完成后新建对话。\nWorkBuddy: 技能 → 上传技能，覆盖已有版本。\n\n此压缩包不包含令牌，请在 AI Agent 接入设置中单独配置。\n`,
    );
    return zipSync(files);
}
