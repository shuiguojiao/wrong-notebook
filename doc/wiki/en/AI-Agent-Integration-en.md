# AI Agent Integration

Create a personal access token under **Settings → Account → AI Agent Integration**. Enter a name and optional expiration. Copy the plaintext immediately: it is shown only once. Each account can have up to 20 unrevoked tokens. The list shows prefixes and last usage; revoke a token at any time.

Tokens use the `wnb_` prefix plus random data. Only SHA-256 hashes are stored. Credentials are excluded from personal and full backups; create new tokens after restoring elsewhere. Grant tokens only to trusted agents, treat them as account writing credentials, and use HTTPS. Never expose them in logs, screenshots or Git.

## Let your agent set it up

**Let your agent set it up** under **Settings → Account → AI Agent Integration** provides a copyable prompt with this site's MCP and Skill URLs filled in, in English when the interface language is English. Send it to your own agent (such as Codex or WorkBuddy). The agent identifies its client, backs up and merges the MCP configuration, installs the Skill and verifies with `list_notebooks` without creating questions. The prompt contains no token: the agent guides you to set the `WRONG_NOTEBOOK_TOKEN` environment variable or replace `<YOUR_TOKEN>` in the configuration yourself. Never paste the token into the conversation. When the agent cannot read the token, it asks you to download the Skill zip from settings before installing.

## MCP and client configuration

Use `https://your-domain/api/mcp`; settings show the complete address for the current origin. The endpoint uses stateless Streamable HTTP with JSON responses. Every POST is authenticated independently, no session id is issued, and GET / DELETE return 405. OAuth and browser login are not required.

### Codex

Make `WRONG_NOTEBOOK_TOKEN` available in the environment of the process launching Codex. For desktop clients, the application process must inherit it; exporting in an unrelated terminal is insufficient. Add to `~/.codex/config.toml`:

```toml
[mcp_servers.wrong-notebook]
url = "https://your-domain/api/mcp"
bearer_token_env_var = "WRONG_NOTEBOOK_TOKEN"
```

`create_error_items` writes data, so Codex asks for approval before each call by default; non-interactive runs such as `codex exec` reject it. To allow unattended imports, approve that tool only:

```toml
[mcp_servers.wrong-notebook.tools.create_error_items]
approval_mode = "approve"
```

Returned error-item links prefer the origin of `NEXTAUTH_URL`; behind a reverse proxy, set it to the address users actually open.

Reload the client, inspect MCP connection status and call `list_notebooks` to verify the account. See the [official Codex MCP documentation](https://developers.openai.com/codex/mcp/). If authentication fails, check the launching process environment; do not place the token in the URL.

### WorkBuddy

Open the MCP configuration editor under Plugins → MCP Servers → Configure MCP (some versions call this Connectors). Merge this server into the existing JSON without overwriting other servers. User-level configuration is also available at `~/.workbuddy/mcp.json`:

```json
{
  "mcpServers": {
    "wrong-notebook": {
      "type": "streamableHttp",
      "url": "https://your-domain/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_TOKEN>"
      }
    }
  }
}
```

Replace `<YOUR_TOKEN>`, protect the configuration as a credential file and keep it out of Git. Save, enable the server and verify connection status before calling tools. See the [official WorkBuddy guide](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide). Server SDK integration tests validate this endpoint; they do not establish acceptance in a particular client version.

### Tools and workflow

1. The agent recognizes images and confirms which questions were wrong and what the student actually answered.
2. `list_notebooks` selects the target notebook.
3. `search_tags` uses its id as `subjectId` to choose knowledge-point names.
4. `find_duplicates` checks `questionText`; confirm how to handle matches.
5. `create_error_items` submits `items`; inspect every entry in `results` and report links, duplicate attempts and failures.

MCP and REST share domain functions and rate limits without HTTP self-calls. The MCP SDK additionally validates tool schemas before execution, rejecting invalid structures as a whole; subsequent per-item save failures are returned individually. A timeout does not prove nothing was saved. Check duplicates before retrying; replaying a whole batch can add unintended wrong-attempt records.

## Install the import Skill

You can also download the zip from **Settings → Account → AI Agent Integration** using your login session; no token is required. For Codex, extract it into `~/.agents/skills/`. For WorkBuddy, use **Skills → Upload Skill**. The archive preserves the `wrong-notebook-import/` top-level folder and includes a `README.txt` with this site’s MCP URL, without tokens. `outputFileTracingIncludes` in `next.config.ts` includes the source files in standalone output, so no additional repository copy is needed.

Source: `packaging/agent-skill/wrong-notebook-import/SKILL.md`. The Skill prefers MCP and supplies curl REST fallbacks. MCP arguments are generated by the model and cannot carry local image bytes, so when the original image should be kept, the Skill directs the agent to crop per question, build the request file with a script and save through REST. It also prompts the agent to fill `source` from the exam or workbook.

For Codex, copy the directory from the repository root into the personal skill location, or into a project's `.agents/skills/`. Inspect an existing skill of the same name before updating:

```bash
mkdir -p ~/.agents/skills
cp -R packaging/agent-skill/wrong-notebook-import ~/.agents/skills/
```

Invoke `$wrong-notebook-import`. See [Codex skill discovery](https://developers.openai.com/codex/skills/).

For WorkBuddy, zip the `wrong-notebook-import` folder and use Skills → Add Skill → Upload Skill, then enable it in Installed. Preserve the folder and `SKILL.md` structure and exclude all tokens. See the [official WorkBuddy skills guide](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market). This repository delivers Skill source and does not install it into local clients automatically.


## Structured REST import

Send `Authorization: Bearer wnb_...` to every `/api/agent/*` request. No session cookie is needed. Each token accesses only its owner's data. The agent recognizes the image and supplies structured questions. The server makes no AI calls, including grade recognition and duplicate mastery evaluation. The existing Openclaw API is unchanged.

| Method and path | Input and result |
| --- | --- |
| `GET /api/agent/notebooks` | `notebooks`: id, name, stage, subjectKey and tagSet owned by the current user |
| `GET /api/agent/tags?subjectId=...&q=...` | Required owned notebook id; optional q substring. Up to 50 system/custom tags from its subject and tag set |
| `POST /api/agent/duplicates` | `{"questionText":"question"}`; returns the best match in `duplicates` using the account threshold (id, shortId, questionText, subjectId, similarity 0–1, link), or an empty array |
| `POST /api/agent/error-items` | `{"items":[...]}`, 1–20 questions. Ordered `results` contain index and id/shortId/status/link or error. A failed item does not roll back others |

Question fields:

| Field | Meaning |
| --- | --- |
| `questionText` | Required nonempty question, up to 20,000 characters; Markdown / LaTeX supported |
| `notebookId` / `notebookName` | Exactly one required. Prefer an id from list_notebooks. A missing name permits creation through existing subject matching only with `createNotebook: true` |
| `answerText`, `analysis` | Correct answer (20,000 characters) and explanation (50,000); optional or null |
| `wrongAnswerText`, `mistakeAnalysis` | Student's wrong answer (20,000) and mistake explanation (50,000). Do not invent unknown answers |
| `mistakeStatus` | `not_attempted` / `wrong_attempt` / `unknown`; optional or null; normalized using existing wrong-answer rules |
| `questionType` | Type name, up to 200 characters, normalized using existing rules; unknown types become null |
| `knowledgePoints` | Up to 100 names, 1–200 characters each. Match existing system/personal tags within the tag set, otherwise create personal tags using existing rules |
| `source`, `errorType`, `userNotes` | Source (1,000 characters; defaults to `agent`), error category (1,000), personal notes (20,000) |
| `gradeSemester`, `difficultyStars` | Grade/semester (100 characters), integer difficulty 1–5; optional or null. Fixed grade follows account rules; omitted grades remain empty in AI grade mode |
| `hasFigure`, `figureSvg` | Question figure (geometry diagram, number line, and so on). `figureSvg` is an SVG redrawn by the agent (≤100,000 characters, sanitized before saving, dropped when invalid) and implies a figure; pass only `hasFigure: true` when it cannot be redrawn. Figures display separately from the original image; do not send a figure crop as `image` |
| `image` | Original image of the whole question (stem, figure and student work). Optional. Exactly one of `{"base64":"...","mimeType":"image/png"}` or `{"url":"https://..."}`. JPEG/PNG/WebP only, ≤5 MiB decoded bytes, matching MIME/signature. Uses existing local image storage; no image stores an empty string |

URLs must use public HTTPS on the default port, without credentials or redirects. Public DNS addresses are pinned; private addresses are rejected. DNS resolution and download share one 10-second total timeout, reported internally as `AGENT_IMAGE_INVALID_URL` (per-item imports still return `AGENT_IMAGE_INVALID`). Prefer base64 to avoid revealing image origins in remote server access logs. JSON request limit: 145 MiB.

Duplicates preserve the original question and add a wrong-attempt record, returning `status: "duplicate"`. New questions return `created`. Confirm imports with the user after checking duplicates.

Limits are shared across tokens and REST/MCP: 60 requests/minute per user, including MCP initialization and tool-list requests, counted once after authentication and before reading the body. At most 2 bodies may be read concurrently per user; excess requests return 429 with `Retry-After`, and slots are released after successful or failed reads. Imports are separately limited to 10 operations/minute. Rate limits return 429 with `Retry-After`; invalid authentication returns 401, invalid input 400, and inaccessible notebooks 404. Counters are in-process, reset on restart and are independent across instances.

This synchronous per-item flow does not create `ImportBatch` records, whose semantics concern split drafts and recognition tasks. This avoids making completed structured imports eligible for AI recognition retries. Save hooks and logs mark origin `agent`; callers may provide a custom question `source`. Agents should retain the returned results. Saved questions use existing backup/export behavior; credentials remain excluded, with no backup version change.

```bash
curl "$WRONG_NOTEBOOK_URL/api/agent/notebooks" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN"

curl "$WRONG_NOTEBOOK_URL/api/agent/error-items" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"items":[{"notebookId":"replace-with-notebook-id","questionText":"Solve x + 2 = 5","answerText":"x = 3","wrongAnswerText":"x = 7","knowledgePoints":["Linear equations"]}]}'
```

## Version notifications and updates

The single source of truth is the fixed body line `Skill-Version: 2` in `SKILL.md` (older files without this line count as version 1). The server reads it from the source file; settings and the archive's `README.txt` display the same version. A body line is used because the [Codex documentation](https://learn.chatgpt.com/docs/build-skills) and [WorkBuddy structure guide](https://open.workbuddy.cn/docs/skill) do not explicitly guarantee that both clients accept arbitrary `metadata.version` fields.

MCP initialization `instructions` advertise the latest version and update steps, allowing older Skills to receive the reminder too. MCP `list_notebooks` and REST `GET /api/agent/notebooks` preserve `notebooks` and add:

```json
{"notebooks": [], "skill": {"version": 2, "downloadUrl": "https://your-domain/api/agent/skill"}}
```

The URL uses `agentPublicOrigin` (preferring `NEXTAUTH_URL`). The new Skill compares versions after `list_notebooks`, notifies the user when the server has a newer version, and continues importing without automatic updates. Older REST-only Skills need one manual update before they can compare versions. Older servers without `skill` remain usable.

- `GET /api/agent/skill`: requires a valid Bearer agent token. Missing, expired or revoked tokens return 401; session cookies cannot substitute. It shares the 60 requests/minute/user limit with REST/MCP; respect `Retry-After` on 429. Returns a token-free zip with caching disabled.
- `GET /api/agent-skill`: retains session-authenticated downloads. Settings read the version and public download URL through session-authenticated `GET /api/agent-skill/version`, without downloading the zip again.
- `next.config.ts` traces Skill files for these routes and `/api/agent/notebooks` and `/api/mcp`, including standalone deployments.

### Updating Codex

After user consent, copy the Codex update command from settings. It requires Python 3, unzip and `WRONG_NOTEBOOK_TOKEN` in the terminal environment. Python reads the credential directly from the environment; the command does not embed it or expose it in process arguments, output or files, and does not follow download redirects. This is a client environment variable, not a server `.env` setting.

The default target is `~/.agents/skills/wrong-notebook-import`. For project installations, change the final path to the actual `.agents/skills/wrong-notebook-import` directory in use. The command downloads the archive from the configured site into `mktemp -d`, verifies integrity, then runs the bundled updater. The updater validates paths, name, version and symlinks, rejects downgrades, stages the new files and replaces the complete directory. Custom changes inside the directory are overwritten. On failure it restores the old directory; if restoration fails it retains and reports the backup location. Download temporary files are automatically removed.

For a symlinked Skill directory, update its source repository instead of replacing the link. Read back the installed version and **start a new Codex conversation**. The settings command also works for older Skills without a local update script.

### Updating WorkBuddy and other GUI clients

Download the latest zip from settings, then replace the installed Skill via **Skills → Upload Skill** and start a new conversation. Do not include tokens in URLs or archives.
