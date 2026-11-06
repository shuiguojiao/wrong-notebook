import type { NextConfig } from "next";

const appUrl = process.env.NEXTAUTH_URL;
const appHostname = appUrl && URL.canParse(appUrl) ? new URL(appUrl).hostname : undefined;

/**
 * 所有响应都带的安全头。
 * 不设置 HSTS（局域网常用 HTTP 访问），也不限制脚本来源（GeoGebra、KaTeX 等需要），
 * 只收紧不影响功能的部分：禁止被其他站点嵌入、禁止插件和改写 base/表单目标。
 */
export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 上传题目需要摄像头和屏幕截图，其余敏感能力一律关闭
  { key: "Permissions-Policy", value: "camera=(self), display-capture=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // 下载接口递归读取 Skill，显式追踪以便 standalone 保留相同的相对目录。
  outputFileTracingIncludes: {
    '/api/agent-skill': ['./packaging/agent-skill/wrong-notebook-import/**/*'],
    '/api/agent-skill/version': ['./packaging/agent-skill/wrong-notebook-import/**/*'],
    '/api/agent/skill': ['./packaging/agent-skill/wrong-notebook-import/**/*'],
    '/api/agent/notebooks': ['./packaging/agent-skill/wrong-notebook-import/**/*'],
    '/api/mcp': ['./packaging/agent-skill/wrong-notebook-import/**/*'],
  },
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  // 局域网开发访问沿用站点主机，允许加载开发资源和连接热更新。
  allowedDevOrigins: appHostname ? [appHostname] : undefined,
  // 禁止 next dev 自动向 AGENTS.md / CLAUDE.md 写入 agent-rules 段落
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
