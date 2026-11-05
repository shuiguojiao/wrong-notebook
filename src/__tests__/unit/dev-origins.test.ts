import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockCrossSiteDEV } from 'next/dist/server/lib/router-utils/block-cross-site-dev';

async function checkOrigin(appUrl: string, origin: string) {
    vi.stubEnv('NEXTAUTH_URL', appUrl);
    vi.resetModules();
    const { default: config } = await import('../../../next.config');
    const response = { statusCode: 200, end: vi.fn() };
    const request = {
        url: '/_next/static/chunks/login.js',
        headers: {
            'sec-fetch-mode': 'no-cors',
            'sec-fetch-site': 'cross-site',
            referer: `${origin}/login`,
        },
    } as unknown as Parameters<typeof blockCrossSiteDEV>[0];
    const blocked = blockCrossSiteDEV(
        request,
        response as unknown as Parameters<typeof blockCrossSiteDEV>[1],
        config.allowedDevOrigins,
        '0.0.0.0',
    );
    return { blocked, response };
}

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('局域网开发资源访问', () => {
    it('允许通过站点配置的主机加载登录脚本，忽略端口差异', async () => {
        const { blocked, response } = await checkOrigin('http://notebook.local:3001', 'http://notebook.local:3002');

        expect(blocked).toBe(false);
        expect(response.end).not.toHaveBeenCalled();
    });

    it('仍然阻止其他站点读取开发资源', async () => {
        const { blocked, response } = await checkOrigin('http://notebook.local:3001', 'https://outside.example');

        expect(blocked).toBe(true);
        expect(response.statusCode).toBe(403);
    });

    it('未配置有效站点地址时不会放开其他主机', async () => {
        const { blocked } = await checkOrigin('invalid-url', 'http://notebook.local:3001');

        expect(blocked).toBe(true);
    });
});
