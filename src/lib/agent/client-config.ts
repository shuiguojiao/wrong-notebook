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
        workbuddy: JSON.stringify({ mcpServers: { "wrong-notebook": {
            type: "streamableHttp", url, headers: { Authorization: "Bearer <YOUR_TOKEN>" },
        } } }, null, 2),
    };
}
