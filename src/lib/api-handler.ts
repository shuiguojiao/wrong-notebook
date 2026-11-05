import "server-only";

/**
 * API 路由鉴权包装器
 *
 * 统一处理「getServerSession → 按邮箱查用户 → 未登录/用户不存在返回 401 → 管理员校验返回 403」的样板代码，
 * 并统一捕获 handler 抛出的未处理异常（记录日志后返回 500）。
 *
 * 用法：
 *   export const GET = withUser(async (req, { user, session }) => { ... });
 *   export const POST = withAdmin(async (req, { user, session }) => { ... });
 *
 * 与 withRecoverableResponse 组合时，把 withRecoverableResponse 放在外层：
 *   export const POST = withRecoverableResponse(withUser(handler));
 * 这样鉴权失败不会被暂存，成功响应才会按请求编号暂存供断线后取回。
 */

import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import type { User } from "@prisma/client";
import { validateAgentToken } from "@/lib/agent-token";
import { withAiUsageScope } from "@/lib/ai-usage-context";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { unauthorized, forbidden, internalError, createErrorResponse, ErrorCode } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger("api-handler");

/** 包装后的 handler 上下文：原有路由上下文加上当前登录用户与 session */
export interface AuthenticatedContext {
    user: User;
    session: Session;
}

type Handler<Context> = (req: Request, ctx: Context) => Promise<Response>;

type AnyContext = Record<string, unknown>;

export async function resolveUser(): Promise<{ user: User; session: Session } | { error: Response }> {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return { error: unauthorized("Authentication required") };
    }
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
        return { error: unauthorized("Authentication required") };
    }
    if (user.isActive === false) {
        return { error: forbidden("Account is disabled") };
    }
    // 会话中的角色可能早于管理员的修改，后续鉴权统一使用数据库当前值。
    return { user, session: { ...session, user: { ...session.user, role: user.role } } };
}

function wrapWithAuth<Context extends AnyContext>(
    requireAdmin: boolean,
    handler: Handler<Context & AuthenticatedContext>
): (req?: Request, ctx?: Context) => Promise<Response> {
    return async (req?: Request, ctx?: Context): Promise<Response> => {
        try {
            const resolved = await resolveUser();
            if ("error" in resolved) return resolved.error;
            if (requireAdmin && resolved.user.role !== "admin") {
                return forbidden("Admin access required");
            }
            const context = { ...(ctx ?? {} as Context), user: resolved.user, session: resolved.session };
            return await withAiUsageScope(() => handler(req ?? new Request("http://localhost"), context));
        } catch (error) {
            if (error instanceof Error && error.message === ErrorCode.AI_MONTHLY_TOKEN_LIMIT_EXCEEDED) return createErrorResponse(error.message, 429, ErrorCode.AI_MONTHLY_TOKEN_LIMIT_EXCEEDED);
            logger.error({ error }, "Unhandled error in API route");
            return internalError();
        }
    };
}

/**
 * 要求已登录的 API 路由包装器。
 * 未登录或用户不存在时返回 401，账号禁用时返回 403；鉴权或 handler 抛错时记录日志并返回 500。
 * req 与 ctx 参数可选，兼容测试中直接以 0 参或 1 参调用的情况。
 */
export function withUser<Context extends AnyContext = AnyContext>(
    handler: Handler<Context & AuthenticatedContext>
): (req?: Request, ctx?: Context) => Promise<Response> {
    return wrapWithAuth(false, handler);
}

/**
 * 要求管理员的 API 路由包装器。
 * 在未登录/用户不存在时返回 401，非管理员时返回 403；handler 抛错时记录日志并返回 500。
 * 启用状态和管理员角色以数据库当前值为准，不信任旧会话中的角色。
 */
export function withAdmin<Context extends AnyContext = AnyContext>(
    handler: Handler<Context & AuthenticatedContext>
): (req?: Request, ctx?: Context) => Promise<Response> {
    return wrapWithAuth(true, handler);
}

/** 个人访问令牌鉴权；保持与会话路由一致的用户上下文和异常处理。 */
export function withAgentUser<Context extends AnyContext = AnyContext>(
    handler: Handler<Context & AuthenticatedContext>
): (req?: Request, ctx?: Context) => Promise<Response> {
    return async (req, ctx) => {
        try {
            const match = req?.headers.get("Authorization")?.match(/^Bearer (wnb_[A-Za-z0-9_-]{43})$/i);
            const user = match ? await validateAgentToken(match[1]) : null;
            if (!user) return unauthorized();
            const session: Session = {
                user: { id: user.id, email: user.email, name: user.name, role: user.role },
                expires: new Date(Date.now() + 60_000).toISOString(),
            };
            return await withAiUsageScope(() => handler(req!, { ...(ctx ?? {} as Context), user, session }));
        } catch (error) {
            if (error instanceof Error && error.message === ErrorCode.AI_MONTHLY_TOKEN_LIMIT_EXCEEDED) return createErrorResponse(error.message, 429, ErrorCode.AI_MONTHLY_TOKEN_LIMIT_EXCEEDED);
            logger.error({ error }, "代理接口执行失败");
            return internalError();
        }
    };
}
