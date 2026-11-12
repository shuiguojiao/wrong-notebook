# 部署与升级

安卓客户端的系统 WebView 建议使用 Chromium 111 及以上，旧版本会显示升级提示。

可自行构建镜像，或在本 fork 的 Docker 工作流成功推送后使用 `ghcr.io/shuiguojiao/wrong-notebook:latest`。工作流支持 `linux/amd64` 和 `linux/arm64`。可用标签以本 fork 的容器包页面为准，上游版本标签不代表本 fork 已有对应镜像。

## Docker Compose 部署

创建部署目录：

```bash
mkdir -p wrong-notebook/data wrong-notebook/config
cd wrong-notebook
openssl rand -base64 32
```

将生成的密钥和实际访问地址写入当前目录的 `.env`：

```dotenv
NEXTAUTH_SECRET=替换为生成的密钥
NEXTAUTH_URL=http://localhost:3000
```

从其他设备访问时，把 `NEXTAUTH_URL` 改为实际访问应用的完整 URL。

新建 `docker-compose.yml`：

```yaml
services:
  wrong-notebook:
    image: ghcr.io/shuiguojiao/wrong-notebook:latest
    container_name: wrong-notebook
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:?请在 .env 中设置 NEXTAUTH_SECRET}
      NEXTAUTH_URL: ${NEXTAUTH_URL:-http://localhost:3000}
      PRESERVE_EXISTING_DATA: "true"
    volumes:
      - ./data:/app/data
      - ./config:/app/config
```

启动并检查服务：

```bash
docker compose up -d
docker compose ps
curl --fail http://localhost:3000/api/health
```

全新部署没有默认账号，启动日志中会打印一次性初始化链接：

```bash
docker compose logs wrong-notebook | grep initialize
```

在浏览器中打开该链接（链接主机与 `NEXTAUTH_URL` 一致），设置管理员邮箱和密码后进入安装向导。链接只能使用一次；令牌也保存在 `config/setup-token`。

健康接口正常时返回 `status: "ok"`，并包含 `version`、`revision`。接口会执行数据库查询，但不会测试 AI；还需登录后在 AI 设置中测试连接，再识别一道实际题目。

新安装的默认账户见[快速开始](Quick-Start)。

## 持久化目录

| 容器目录 | 内容 | 处理方式 |
| --- | --- | --- |
| `/app/data` | SQLite 数据库及初始化标记 | 持久挂载并定期备份 |
| `/app/config` | 网页保存的 AI 配置、提示词和全局设置 | 持久挂载，备份中包含敏感凭据 |
| `/app/certs` | 使用内置 HTTPS 时的证书 | 按需挂载并备份 |

镜像默认设置 `PRESERVE_EXISTING_DATA=true`。检测到已有数据库时，启动流程执行正式迁移，跳过管理员播种和系统标签重建，以保留已有账户、标签及关联。

## HTTPS 与反向代理

域名访问建议使用受浏览器信任的 HTTPS 证书。可以通过反向代理将 HTTPS 请求转到应用的 HTTP 端口，并将 `NEXTAUTH_URL` 设置为外部 HTTPS 地址。

反向代理请转发 `X-Real-IP` 或 `X-Forwarded-For`，登录失败次数按来源 IP 统计。应用默认返回 `X-Frame-Options: SAMEORIGIN` 等安全头，不能被其他域名的页面用 iframe 嵌入；需要启用 HSTS 时请在反向代理上配置。

应用也提供内置 HTTPS，参考仓库中的 [`docker-compose.https.yml`](https://github.com/shuiguojiao/wrong-notebook/blob/main/docker-compose.https.yml)：

- 设置 `HTTPS_ENABLED=true`、`CERT_DOMAIN` 和正确的 `NEXTAUTH_URL`。
- 映射容器 `443` 端口，将证书目录挂载到 `/app/certs`。
- 自定义证书文件名为 `cert.pem` 和 `key.pem`；缺失时启动脚本会尝试生成自签名证书。

自签名证书需要客户端正确配置并信任。HTTPS 是屏幕截图的必要条件之一，移动浏览器仍可能不支持 `getDisplayMedia()`。更多说明见 [HTTPS 配置文档](https://github.com/shuiguojiao/wrong-notebook/blob/main/doc/HTTPS_SETUP.md)。

在 HTTPS 实例上启用 Apple 设备通知时，按[复习提醒指南](https://github.com/shuiguojiao/wrong-notebook/blob/main/doc/REVIEW_REMINDERS.md)配置 VAPID 密钥和出站网络。

## 升级

1. 记录当前镜像版本，按[整站备份流程](Backup-and-Restore)备份 `data/`、`config/` 和部署配置。
2. 修改 Compose 中的镜像版本，保持挂载目录和会话密钥。
3. 执行：

   ```bash
   docker compose pull
   docker compose up -d
   docker compose logs --tail=100 wrong-notebook
   curl --fail http://localhost:3000/api/health
   ```

4. 核对运行版本，并登录确认原账户、错题、标签和试卷仍可使用。

升级后若需回退，先停服务，按备份恢复与旧版本匹配的数据和配置，再启动旧镜像。数据库已经迁移时，仅切回旧镜像未必兼容。

## 从源码构建镜像

```bash
git clone https://github.com/shuiguojiao/wrong-notebook.git
cd wrong-notebook
docker build -t wrong-notebook:local .
```

Dockerfile 在镜像内执行 Vitest、脚本语法检查和生产构建，并初始化新安装使用的数据库。将 Compose 的 `image` 改为 `wrong-notebook:local` 后，可沿用上述挂载方式运行。

## 本地构建安装包

安装包可用 `scripts/package/` 自行构建，见 [INSTALL_PACKAGES.md](https://github.com/shuiguojiao/wrong-notebook/blob/main/doc/INSTALL_PACKAGES.md)。本 fork 暂不发布安装包、npm 包或 App。

### 存量题按需核对

部署 C5 时应用正式迁移以增加用户每日展示账本；不会自动全量检查。手动限速脚本、显式 AI 参数和只读管理员指标见 [存量核对运维](../QUESTION_INTEGRITY_OPERATIONS.md)。

## 主屏幕图标

暖橙色纸笔图标位于 `public/icons/`：iOS 使用 180×180 的 `apple-touch-icon.png`，PWA 清单使用 192×192、512×512 与预留裁切安全区的 maskable 版本，网页使用 `icon.png`。同路径替换图标时需同步更新 `public/sw.js` 的缓存版本；standalone 部署还需同步运行产物中的 `public`。浏览器标签页的 `src/app/favicon.ico` 随 Next.js 构建发布。已添加的 iOS 主屏幕快捷方式若仍显示旧图标，可移除后重新添加。
