# Daily review reminders

[简体中文](REVIEW_REMINDERS.md)

Under Settings → General → Review reminders, choose one channel, enter a credential and a daily `HH:mm` time, then save and send a test. Reminders are off by default for each user. Enabling them sends due counts and subjects to your selected third-party service, without question text, images or answers. Tests need no due questions and are limited to once per minute; save changes before testing. An empty credential input preserves the saved value; changing channels requires a new credential. Only the last four characters are displayed (short credentials are fully hidden).

## Obtaining credentials

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
- Presets allow only their fixed official HTTPS hosts and paths on the default port. Redirects are rejected. Custom endpoints are checked against all DNS answers on every send, rejecting loopback, private, link-local and special addresses. Connections use the checked address to prevent DNS rebinding. Only explicit administrator permission bypasses private-address rejection. All channels have a 10-second total timeout including DNS and bypass system proxies. Enable private access only for trusted users.

## Deduplication, retries and backups

Reminders share the Ebbinghaus due algorithm with `/api/review/due`, counting all due questions by subject/notebook name, with an uncategorized group for questions without a subject. No-due days are marked checked and skipped. Inactive users are excluded.

The database persists the app-local calendar day, attempt count and completion marker. Successful automatic reminders are sent once per day; saving settings, changing time, restarting and personal backup imports do not clear that ledger. Failures get at most two retries on later minute checks, for three attempts in total. One user's failure does not block others. Database compare-and-swap and a lease guard concurrent schedulers.

Third-party endpoints have no common idempotency key: after a network timeout, retries may still be accepted twice, so end-to-end exactly-once delivery cannot be guaranteed. The day is marked before sending to prevent blind replay after a crash following acceptance; a crash after that marker may instead miss the day's reminder. Avoid stopping during sends. Restoring an old full database also rolls back its ledger: disable reminders and reconcile sends before restoring. Changing the global time zone can change the calendar-day boundary.

Personal JSON backup version **13** includes the enabled flag, channel, **full plaintext credential**, time and latest result. Protect it like a password and do not share it. Personal imports do not reset the server's current-day ledger. Older backups without reminder fields disable reminders. Imported credentials remain subject to current administrator policies, host checks and private-address rules before sending. Full SQLite snapshots contain all users' reminder settings, credentials and ledgers and also require protected file permissions.

Implementation: `src/lib/reminders/`, `src/lib/review-due.ts`, `src/instrumentation.ts`. Reminder logs contain only channels and fixed results, never credentials, raw third-party errors or responses. Prisma uses minimal error formatting to avoid exposing credentials through invocation arguments.
