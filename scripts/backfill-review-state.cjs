// 在加载 Prisma（可能读取 .env）之前要求调用者显式提供目标库。
if (!process.env.DATABASE_URL) {
    process.stderr.write('请显式设置 DATABASE_URL 后执行复习回填脚本。\n');
    process.exitCode = 1;
} else {
    // 复用项目 TypeScript 与路径别名；react-server 条件允许导入服务器模块。
    require('ts-node').register({ compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
    const Module = require('node:module');
    const path = require('node:path');
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function(request, ...args) {
        return resolveFilename.call(this, request.startsWith('@/') ? path.resolve(__dirname, '../src', request.slice(2)) : request, ...args);
    };
    require('./backfill-review-state');
}
