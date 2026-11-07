// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getAgentSkillInfo, parseAgentSkillVersion } from "@/lib/agent/skill-version";

describe("Skill 单一来源版本", () => {
    it("解析正文整数版本，支持 CRLF 并忽略 frontmatter", () => {
        expect(parseAgentSkillVersion("---\nSkill-Version: 99\n---\n# Skill\nSkill-Version: 3\n")).toBe(3);
        expect(parseAgentSkillVersion("Skill-Version: 27\r\n")).toBe(27);
    });
    it.each(["", "Skill-Version: 0", "Skill-Version: -1", "Skill-Version: 2.1", "Skill-Version: 02", "Skill-Version: 2x", "Skill-Version: 9007199254740992", "Skill-Version: 2\nSkill-Version: 3", "---\nSkill-Version: 2\n---\n"])("拒绝缺失或无效版本 %j", (source) => {
        expect(() => parseAgentSkillVersion(source)).toThrow("AGENT_SKILL_VERSION_INVALID");
    });
    it("当前打包源版本为 4，下载地址指向令牌接口", async () => {
        expect(await getAgentSkillInfo("https://notes.example.com")).toEqual({ version: 4, downloadUrl: "https://notes.example.com/api/agent/skill" });
    });
});
