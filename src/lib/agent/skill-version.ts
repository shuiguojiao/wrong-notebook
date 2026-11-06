import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export function agentSkillRoot(): string {
    return path.join(process.cwd(), "packaging", "agent-skill", "wrong-notebook-import");
}

/** 仅接受正文中唯一的固定格式版本行，避免静默发布缺失或歧义版本。 */
export function parseAgentSkillVersion(source: string): number {
    const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
    const lines = body.split(/\r?\n/).filter((line) => line.startsWith("Skill-Version:"));
    const value = lines.length === 1 && /^Skill-Version: ([1-9]\d*)$/.exec(lines[0]);
    const version = value ? Number(value[1]) : NaN;
    if (!Number.isSafeInteger(version)) throw new Error("AGENT_SKILL_VERSION_INVALID");
    return version;
}

export async function getAgentSkillInfo(origin: string) {
    const source = await readFile(path.join(agentSkillRoot(), "SKILL.md"), "utf8");
    return { version: parseAgentSkillVersion(source), downloadUrl: `${origin}/api/agent/skill` };
}
