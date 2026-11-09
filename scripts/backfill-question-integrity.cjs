// 在加载 Prisma（可能读取 .env）之前要求调用者显式提供目标库。
if (!process.env.DATABASE_URL) {
    process.stderr.write('请显式设置 DATABASE_URL 后执行存量核对脚本。\n');
    process.exitCode = 1;
} else {
    // CLI 仅转译，完整类型检查由 npx tsc --noEmit 执行；兼容项目依赖的 bundler 导出类型。
    // react-server 条件允许导入服务器模块。
    require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
    const Module = require('node:module');
    const path = require('node:path');
    const resolveFilename = Module._resolveFilename;
    Module._resolveFilename = function(request, ...args) {
        return resolveFilename.call(this, request.startsWith('@/') ? path.resolve(__dirname, '../src', request.slice(2)) : request, ...args);
    };
    require('./backfill-question-integrity');
}
