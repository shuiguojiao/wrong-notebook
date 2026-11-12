# Daily review reminders

[简体中文](REVIEW_REMINDERS.md)

Under Settings → General → Review reminders, choose one channel. For credential-based channels, enter a credential and a daily `HH:mm` time, then save and send a test. Reminders are off by default for each user. Credential-based channels send today’s budgeted due counts, subjects and estimated minutes to your selected third-party service, without question text, images or answers. Tests for credential-based channels need no due questions and are limited to once per minute. Save changes before testing. An empty credential input preserves the saved value; changing channels requires a new credential. Only the last four characters are displayed (short credentials are fully hidden).

## Apple device notifications

In Safari on iPhone or iPad, add Wrong Notebook to the Home Screen and sign in from its icon. This requires iOS or iPadOS 16.4 or later. Mac Safari with Web Push support can subscribe too. Under Me → Review reminders, choose Apple device notifications (Web Push), select Enable on this device, and grant system permission. You can send a test before enabling and saving the daily reminder. Each account can register up to six devices.

Daily reminders go to registered devices. The lock-screen message uses generic text and opens Review when tapped. If the session has expired, signing in returns you to Review. Signing out removes the current device's account binding. Other registered devices continue to receive reminders. You can also remove an old device in Settings or explicitly enable the current device after signing in again.

### Enable Web Push on the server

- Keep the external HTTPS origin, manifest and root Service Worker scope stable. Set `NEXTAUTH_URL` to the HTTPS address people use.
- After installing dependencies, run `npx web-push generate-vapid-keys`. Set `WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY` to the generated pair. Set `WEB_PUSH_VAPID_SUBJECT` to a real `mailto:` contact or HTTPS contact page. Store the private key on the server and reuse the same key pair across deployments. Changing keys requires devices to subscribe again.
- Apply the SQLite migration, set `WEB_PUSH_ENABLED=true` in the service environment, and restart. The switch defaults to off. For containers, pass these variables explicitly to the application container. Allow outbound HTTPS to `*.push.apple.com`. The global `REVIEW_REMINDERS_ENABLED=false` also stops device notifications.
- On a real device, verify background or lock-screen receipt, tapping through to Review, and a naturally scheduled reminder. “Accepted by push service” records Apple's acceptance of the request.

Device deliveries have their own records. An accepted device is skipped for the rest of the day. Only devices with explicit temporary failures are retried, with at least 30 minutes between at most three attempts. Unknown outcomes are skipped for the day and expired subscriptions are removed. Tests are limited to once per minute on the current device. Personal backup version 21 restores the channel and time with daily reminders off. Subscriptions and delivery records stay on the original instance. Protect full SQLite snapshots as credentials.

## Obtaining credentials for other channels

| Channel | Instructions |
| --- | --- |
| Bark (iOS) | Install [Bark](https://bark.day.app/) and copy the device key or full `https://api.day.app/<key>` URL from its home screen. |
| ServerChan | Sign in to [ServerChan](https://sct.ftqq.com/), follow the [SendKey guide](https://sct.ftqq.com/docs/getting-started/sendkey/), connect a receiver and copy the SendKey. |
| PushPlus | Sign in to [PushPlus](https://www.pushplus.plus/), connect your receiver and copy your user token. |
| WeCom group bot | Add a group bot and copy `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...`. |
| Feishu group bot | Add a [custom bot](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot) in group settings and copy `https://open.feishu.cn/open-apis/bot/v2/hook/...`. |
| DingTalk group bot | Add a [custom bot](https://open.dingtalk.com/document/robots/custom-robot-access) through the group assistant and copy `https://oapi.dingtalk.com/robot/send?access_token=...`. If using keywords, include `错题本复习提醒`. Additional dynamic signing secrets are not supported. |
| Custom webhook | An administrator must enable custom URLs. Use an HTTPS endpoint accepting POST JSON `{title, body, url?}`; `url` is omitted without a configured site URL. Self-hosted Bark can use its full HTTPS endpoint accepting this JSON; adapt incompatible gateways with a forwarding endpoint. The Bark preset accepts only the official host. |

Configure each bot's required security controls. Additional Feishu signing is not implemented; use keyword/IP restrictions suitable for your deployment. Quotas, service availability, bot permissions and device notification settings can affect delivery. “Accepted by push service” means a successful API response, not verified device receipt. Some services display message URLs as plain text.

## Administration and deployment

- Keep the Next.js Node service running. Checks run every minute in the application time zone from `getAppTimeZone()`. A late start checks reminders for the current day; offline days are not replayed. Desktop editions must be running; standalone Android must keep its server alive. Serverless deployments without a persistent process cannot guarantee scheduling.
- Set `NEXTAUTH_URL=https://your-site` in `.env` to include a `/review` link. Login is still required. Without a valid site URL, the link is omitted and Settings shows a notice. The receiver's device must be able to access this site.
- Set `REVIEW_REMINDERS_ENABLED=false` to disable automatic reminders and tests globally, then restart. The feature is available by default, while each user defaults to off.
- Administrator switches under Settings → General control `allowCustomReminders` and `allowPrivateReminders` in `config/app-config.json`. Both default to `false`; save them with the page's global configuration button. Private access applies only to custom channels, still requiring HTTPS and a trusted certificate.
- Presets allow only their fixed official HTTPS hosts and paths on the default port. Redirects are rejected. Custom endpoints are checked against all DNS answers on every send, rejecting loopback, private, link-local and special addresses. Connections use the checked address to prevent DNS rebinding. Only explicit administrator permission bypasses private-address rejection. Credential-based channels have a 10-second total timeout including DNS and bypass system proxies. Enable private access only for trusted users.

## Deduplication, retries and backups

Reminders share the minute-based queue with `/api/review/due`, counting only today’s minute-budgeted queue by subject/notebook name, after deducting today’s estimated review time and applying priority plus subject rotation, with an uncategorized group for questions without a subject. Empty queues, including exhausted budgets, are marked checked and skipped. Inactive users are excluded.

The database persists the app-local calendar day, attempt count and completion marker. Successful automatic reminders are sent once per day; saving settings, changing time, restarting and personal backup imports do not clear that ledger. After a failure, retries wait at least 30 minutes, with at most two retries and three attempts in total. Test messages cannot be sent during this cooldown. One user's failure does not block others. Database compare-and-swap and a lease guard concurrent schedulers.

Credential-based endpoints have no common idempotency key: after a network timeout, retries may still be accepted twice, so end-to-end exactly-once delivery cannot be guaranteed. The day is marked before sending to prevent blind replay after a crash following acceptance; a crash after that marker may instead miss the day's reminder. Avoid stopping during sends. Restoring an old full database also rolls back its ledger: disable reminders and reconcile sends before restoring. Changing the global time zone can change the calendar-day boundary.

Personal JSON backups from version **13** include the enabled flag, channel, **full plaintext credential**, time and latest result. Protect it like a password and do not share it. Personal imports do not reset the server's current-day ledger. Older backups without reminder fields disable reminders. Imported credentials remain subject to current administrator policies, host checks and private-address rules before sending. Full SQLite snapshots contain all users' reminder settings, credentials and ledgers and also require protected file permissions.

Implementation: `src/lib/reminders/`, `src/lib/review-due.ts`, `src/instrumentation.ts`. Reminder logs contain only channels and fixed results, never credentials, raw third-party errors or responses. Prisma uses minimal error formatting to avoid exposing credentials through invocation arguments.

Reminders filter persisted nextReviewAt, initialize old questions by history replay, and share the home page’s budgeted queue. Set Daily review minutes under Settings → General → Review (default 30, range 10–180 in steps of 5). Messages include an approximate minute estimate. Backlog and extra groups are excluded from automatic reminders; no backlog count is shown.
