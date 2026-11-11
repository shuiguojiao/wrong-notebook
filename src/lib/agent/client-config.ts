import type { Language } from "@/lib/translations";

/** 生成给用户的链接时优先用 NEXTAUTH_URL，避免反向代理后拿到容器内部地址。 */
export function agentPublicOrigin(requestUrl: string): string {
    try {
        const base = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL) : null;
        if (base && ["https:", "http:"].includes(base.protocol) && !base.username && !base.password) return base.origin;
    } catch { /* 配置无效时回退请求地址 */ }
    return new URL(requestUrl).origin;
}

/** 配置示例只引用占位符或环境变量，不嵌入本次创建的令牌。 */
export function agentClientConfig(origin: string) {
    const url = `${origin}/api/mcp`;
    return {
        url,
        codex: `[mcp_servers.wrong-notebook]\nurl = ${JSON.stringify(url)}\nbearer_token_env_var = "WRONG_NOTEBOOK_TOKEN"`,
        claude: JSON.stringify({ mcpServers: { "wrong-notebook": {
            type: "http", url, headers: { Authorization: "Bearer ${WRONG_NOTEBOOK_TOKEN}" },
        } } }, null, 2),
        cursor: JSON.stringify({ mcpServers: { "wrong-notebook": {
            url, headers: { Authorization: "Bearer ${env:WRONG_NOTEBOOK_TOKEN}" },
        } } }, null, 2),
        other: JSON.stringify({ mcpServers: { "wrong-notebook": {
            type: "http", url, headers: { Authorization: "Bearer <YOUR_TOKEN>" },
        } } }, null, 2),
        workbuddy: JSON.stringify({ mcpServers: { "wrong-notebook": {
            type: "streamableHttp", url, headers: { Authorization: "Bearer <YOUR_TOKEN>" },
        } } }, null, 2),
    };
}

/** 交给用户自己的 agent 完成接入的提示词；用户随后在对话提供 Key，由助手配置到私有文件或环境中。 */
export function agentSetupPrompt(origin: string, language: Language): string {
    const url = `${origin}/api/mcp`;
    const skill = `${origin}/api/agent/skill`;
    if (language === "en") return `Please connect the wrong-notebook app at ${origin} to you (my AI agent) so I can import mistake questions. Follow these steps and report the result of each one.

1. Identify which client you are (Codex, WorkBuddy or another client that supports MCP and Skills) and where its configuration lives.
2. Configure an MCP server named wrong-notebook: URL ${url}, Streamable HTTP, Bearer token authentication. Back up the configuration first and merge without overwriting other servers.
   - Codex: add to ~/.codex/config.toml:
     [mcp_servers.wrong-notebook]
     url = "${url}"
     bearer_token_env_var = "WRONG_NOTEBOOK_TOKEN"
   - Claude Code .mcp.json: use type http and Authorization: Bearer \${WRONG_NOTEBOOK_TOKEN}. Cursor mcp.json: use Authorization: Bearer \${env:WRONG_NOTEBOOK_TOKEN}. Set the environment before starting the client.
   - Clients with JSON configuration (such as WorkBuddy): {"type": "streamableHttp", "url": "${url}", "headers": {"Authorization": "Bearer <YOUR_TOKEN>"}}. Replace <YOUR_TOKEN> with the Key I send you in step 3.
3. Key: I will send you a Key starting with wnb_ directly in this conversation. Write it into your MCP configuration: Codex, Claude Code and Cursor can use an Authorization header in a configuration file or an environment variable; WorkBuddy and similar clients should replace the placeholder. Keep it out of Git repositories, logs and public files. Ensure the client process can read the configuration or environment variable (restart the desktop app if needed).
4. Install the Skill wrong-notebook-import:
   - Use the Key I send you directly, or read WRONG_NOTEBOOK_TOKEN inside a Python process, to request ${skill} with Authorization: Bearer, accept only HTTP 200 without following redirects, save the zip in a mktemp -d directory, check that every entry stays under wrong-notebook-import/ with no absolute paths, .. or links, then extract it into ~/.agents/skills/ for Codex. Ask me before overwriting an existing directory of the same name.
   - Otherwise: ask me to click "Download Skill" in the app settings and tell you the zip path, then install it. For WorkBuddy, ask me to import the zip under Skills → Upload Skill.
5. After reloading MCP, call list_notebooks to verify. Report the number of notebooks and the returned skill.version. Do not create any questions.
6. Finally, tell me whether I need to start a new conversation or restart the client, and that I can then say "Use $wrong-notebook-import to import the mistakes from this test paper".`;
    return `请帮我把错题本（${origin}）接入你自己（我的 AI Agent），用于导入错题。按以下步骤操作，每步完成后告诉我结果。

1. 判断你是哪个客户端（Codex、WorkBuddy 或其他支持 MCP 与 Skill 的客户端），以及它的配置文件位置。
2. 配置名为 wrong-notebook 的 MCP 服务器：地址 ${url}，Streamable HTTP，Bearer 令牌鉴权。修改前先备份配置，合并写入，不覆盖其他服务器。
   - Codex：在 ~/.codex/config.toml 加入
     [mcp_servers.wrong-notebook]
     url = "${url}"
     bearer_token_env_var = "WRONG_NOTEBOOK_TOKEN"
   - Claude Code 的 .mcp.json 使用 type http 和 Authorization: Bearer \${WRONG_NOTEBOOK_TOKEN}；Cursor 的 mcp.json 使用 Authorization: Bearer \${env:WRONG_NOTEBOOK_TOKEN}。启动客户端前设置环境变量。
   - WorkBuddy 等使用 JSON 配置的客户端：{"type": "streamableHttp", "url": "${url}", "headers": {"Authorization": "Bearer <YOUR_TOKEN>"}}，收到第 3 步的 Key 后替换 <YOUR_TOKEN>。
3. Key：我会把以 wnb_ 开头的 Key 直接发到对话里。请把它写进你的 MCP 配置（Codex、Claude Code、Cursor 可直接写入配置文件的 Authorization 头或环境变量；WorkBuddy 等替换配置里的占位符），不要写进 Git 仓库、日志或公开文件。确保客户端进程能读取配置或环境变量（桌面应用需要时重启）。
4. 安装 Skill「wrong-notebook-import」：
   - 可直接使用我发给你的 Key，或在 Python 进程内读取 WRONG_NOTEBOOK_TOKEN，以 Authorization: Bearer 请求 ${skill}，只接受 HTTP 200、不跟随重定向，把 zip 保存到 mktemp -d 创建的临时目录，检查所有条目都在 wrong-notebook-import/ 下、没有绝对路径、.. 或链接，再解压到 Codex 的 ~/.agents/skills/。已有同名目录时先问我是否覆盖。
   - 否则：让我在错题本设置页点「下载 Skill」，把 zip 路径告诉你后再安装；WorkBuddy 让我在「技能 → 上传技能」导入。
5. 重新加载 MCP 后调用 list_notebooks 验证，报告错题本数量和返回的 skill.version，不要创建任何题目。
6. 最后告诉我是否需要新建对话或重启客户端，以及之后可以直接说「用 $wrong-notebook-import 导入这张试卷的错题」。`;
}
