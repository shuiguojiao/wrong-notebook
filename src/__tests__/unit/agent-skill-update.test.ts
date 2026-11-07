// @vitest-environment node
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentSkillUpdateCommand } from "@/lib/agent/skill-update-command";
import { createAgentSkillZip } from "@/lib/agent/skill-zip";

const execute = promisify(execFile);
const installer = path.resolve("packaging/agent-skill/wrong-notebook-import/scripts/update.py");
const folder = "wrong-notebook-import";
const oldSkill = "---\nname: wrong-notebook-import\ndescription: 测试\n---\n旧内容\n";
let directory: string;
let target: string;
let archive: string;
beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "skill-update-test-"));
    target = path.join(directory, ".agents/skills", folder);
    archive = path.join(directory, "skill.zip");
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "SKILL.md"), oldSkill);
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

async function install() { return execute("python3", [installer, archive, target]); }
async function bundle(extra: Record<string, Uint8Array> = {}, version = 2) {
    await writeFile(archive, zipSync({
        [`${folder}/SKILL.md`]: strToU8(`${oldSkill}\nSkill-Version: ${version}\n`), ...extra,
    }));
}

describe("Codex Skill 更新", () => {
    it("校验后完整替换旧目录并提示新建对话", async () => {
        await writeFile(path.join(target, "obsolete.txt"), "旧文件");
        await writeFile(archive, await createAgentSkillZip("https://notes.example.com"));
        expect((await install()).stdout).toContain("新建 Codex 对话");
        expect(await readFile(path.join(target, "SKILL.md"), "utf8")).toContain("Skill-Version: 4");
        expect((await execute("python3", [path.join(target, "scripts/images.py"), "--help"])).stdout).toContain("attach");
        expect(await readdir(target)).not.toContain("obsolete.txt");
        expect(await readdir(path.dirname(target))).toEqual([folder]);
    });
    it("符号链接不被覆盖，源目录保持原样", async () => {
        const source = path.join(directory, "source");
        await mkdir(source);
        await writeFile(path.join(source, "SKILL.md"), oldSkill);
        await rm(target, { recursive: true });
        await symlink(source, target);
        await bundle();
        await expect(install()).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("符号链接") });
        expect((await lstat(target)).isSymbolicLink()).toBe(true);
        expect(await readFile(path.join(source, "SKILL.md"), "utf8")).toBe(oldSkill);
    });
    it.each(["../escape", `${folder}/../../escape`, "/absolute", "other/SKILL.md"])("拒绝压缩包越界路径 %s，保留原目录", async (name) => {
        await bundle({ [name]: strToU8("无效内容") });
        await expect(install()).rejects.toMatchObject({ code: 1 });
        expect(await readFile(path.join(target, "SKILL.md"), "utf8")).toBe(oldSkill);
    });
    it("损坏压缩包和降级均不覆盖本地 Skill", async () => {
        await writeFile(archive, "not a zip");
        await expect(install()).rejects.toMatchObject({ code: 1 });
        const newer = `${oldSkill}\nSkill-Version: 4\n`;
        await writeFile(path.join(target, "SKILL.md"), newer);
        await bundle();
        await expect(install()).rejects.toMatchObject({ code: 1 });
        expect(await readFile(path.join(target, "SKILL.md"), "utf8")).toBe(newer);
    });
    it("一行命令可在 bash/zsh 下载更新，令牌仅进入请求头，不跟随重定向", async () => {
        const token = `wnb_${"a".repeat(43)}`;
        const zip = await createAgentSkillZip("https://notes.example.com");
        let status = 200;
        let requests = 0;
        const headers: Array<string | undefined> = [];
        const server = createServer((req, res) => {
            requests++;
            headers.push(req.headers.authorization);
            res.writeHead(status, { "Content-Type": "application/zip", Location: "/unexpected" });
            res.end(zip);
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        try {
            const address = server.address();
            if (!address || typeof address === "string") throw new Error("测试服务器未启动");
            const command = agentSkillUpdateCommand(`http://127.0.0.1:${address.port}`);
            expect(command).not.toContain("\n");
            expect(command).not.toContain(token);
            expect(command).toContain("WRONG_NOTEBOOK_TOKEN");
            // 在命令文本中替换测试安装路径，不改写系统 HOME 环境变量。
            const testCommand = command.replace('"$HOME/.agents/skills/wrong-notebook-import"', `'${target}'`);
            for (const shell of ["bash", "zsh"]) {
                const result = await execute(shell, ["-c", testCommand], { env: { ...process.env, WRONG_NOTEBOOK_TOKEN: token } });
                expect(result.stdout + result.stderr).not.toContain(token);
                expect(result.stdout).toContain("版本 4");
            }
            expect(headers).toEqual([`Bearer ${token}`, `Bearer ${token}`]);
            status = 302;
            await expect(execute("bash", ["-c", testCommand], { env: { ...process.env, WRONG_NOTEBOOK_TOKEN: token } })).rejects.toMatchObject({ code: 1 });
            expect(requests).toBe(3);
            expect(await readFile(path.join(target, "SKILL.md"), "utf8")).toContain("Skill-Version: 4");
        } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
    });
});
