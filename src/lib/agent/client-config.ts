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
