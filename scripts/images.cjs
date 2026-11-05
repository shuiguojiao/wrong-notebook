// 使用项目已有的 ts-node 执行维护逻辑；react-server 条件允许加载 server-only 模块。
require('ts-node').register({ compilerOptions: { module: 'CommonJS', moduleResolution: 'node' } });
require('./images');
