// 源码项目使用 ts-node，发布包与容器使用预编译脚本。
const fs = require('node:fs');
const path = require('node:path');
const compiled = path.join(__dirname, '..', 'dist-scripts', 'scripts', 'backup-verify.js');
if (fs.existsSync(path.join(__dirname, 'backup-verify.ts'))) {
    require('ts-node').register({ compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
    require('./backup-verify');
} else {
    require(compiled);
}
