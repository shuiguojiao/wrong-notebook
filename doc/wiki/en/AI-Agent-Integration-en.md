# AI Agent Integration


## Getting started from the entry panel

The **AI Agent** entry tab offers client configuration and a setup prompt, token creation, recent usage status, Skill download and example prompts. Manage or revoke tokens in settings. Status reflects the most recent use of an active token, not live presence; refresh stops when leaving the tab.

Claude Code `.mcp.json` uses `type: "http"` and `Authorization: "Bearer ${WRONG_NOTEBOOK_TOKEN}"`; Cursor `mcp.json` uses `Authorization: "Bearer ${env:WRONG_NOTEBOOK_TOKEN}"`. Copy the full configuration from the entry tab and set the environment variable for the process launching the client. Keep tokens out of command arguments, chat and Git.

Create a personal access token under **Me → AI Agent Integration** (opens the Account settings tab). Enter a name and optional expiration. Copy the plaintext immediately: it is shown only once. Each account can have up to 20 unrevoked tokens. The list shows prefixes and last usage; revoke a token at any time.

Tokens use the `wnb_` prefix plus random data. Only SHA-256 hashes are stored. Credentials are excluded from personal and full backups; create new tokens after restoring elsewhere. Grant tokens only to trusted agents, treat them as account writing credentials, and use HTTPS. Never expose them in logs, screenshots or Git.

## Let your agent set it up

**Let your agent set it up** under **Me → AI Agent Integration** (opens the Account settings tab) provides a copyable prompt with this site's MCP and Skill URLs filled in, in English when the interface language is English. Send it to your own agent (such as Codex or WorkBuddy). The agent identifies its client, backs up and merges the MCP configuration, installs the Skill and verifies with `list_notebooks` without creating questions. The prompt contains no token: the agent guides you to set the `WRONG_NOTEBOOK_TOKEN` environment variable or replace `<YOUR_TOKEN>` in the configuration yourself. Never paste the token into the conversation. When the agent cannot read the token, it asks you to download the Skill zip from settings before installing.

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

## Correcting imported items

MCP also exposes `search_error_items`, `get_error_item`, `update_error_item`, `update_error_record`, `delete_error_record` and `delete_error_item`. Do not re-import to correct an item: that appends an attempt. These REST endpoints share token authentication, domain logic and rate limits with MCP:

| Tool / method and path | Input and result |
| --- | --- |
| `search_error_items` / `GET /api/agent/error-items/search` | Optional `notebookId`, `q` (question/source/short ID), `source` substring, `createdFrom` (inclusive) / `createdBefore` (exclusive, ISO timestamps with timezone); `offset=0`, `limit=20` (maximum 50). Returns `items`, `total`, `nextOffset` |
| `get_error_item` / `GET /api/agent/error-items/detail` | `id` accepts a full or short ID. Returns `item` including tags, SVG, `revision`, paginated `records`, `recordTotal`, `nextOffset`; use `offset`/`limit` for records |
| `GET /api/agent/error-items/image` | `id`, optional `recordId`; reads original-image bytes with the same Bearer token without exposing storage paths. Supports local images and legacy data URLs; does not fetch legacy external URLs (404) |
| `update_error_item` / `PATCH /api/agent/error-items/update` | `id`, `expectedRevision`, `patch`. Updates import fields and `notebookId`, never identity, owner, mastery or arbitrary database fields. Returns a new `item` |
| `update_error_record` / `PATCH /api/agent/error-items/records/update` | Also requires `recordId`; edits only `duplicate_import` snapshots with no exam link. Supports text, wrong answer, mistake analysis, `notes`, `result`, `figureSvg`, `image`; preserves the original item |
| `delete_error_record` / `DELETE /api/agent/error-items/records/delete` | `id`, `recordId`, `expectedRevision`, `confirm: true`; removes only that duplicate-import attempt and returns a new `item` |
| `delete_error_item` / `DELETE /api/agent/error-items/delete` | `id`, `expectedRevision`, `confirm: true`; deletes the item and its attempt/practice/review records. Generated exam snapshots remain, with their original-item link cleared |

PATCH and DELETE take JSON bodies. Read details first and send its `revision` as `expectedRevision`. The digest covers the full item, tags and all attempts, including records outside the current page. Validation repeats inside the transaction; website edits, appended attempts or another agent's changes cause 409 / `AGENT_REVISION_CONFLICT`. Re-read and reconcile rather than overwriting automatically. Image requests also share the 60 requests/minute budget and return `Cache-Control: no-store`.

Omitted patch fields remain unchanged; explicit `null` clears nullable fields, `knowledgePoints: []` clears tags, and `image: null` clears the original image. Question text must remain nonempty. Question types are normalized; unrecognized nonempty values are rejected. SVG is sanitized and invalid SVG rejected; `hasFigure: false` clears the figure. Moving an item resolves its existing or specified tags in the destination notebook's taxonomy. Updates never append attempts. Updating/removing an attempt recomputes mastery using existing rules within the same transaction, without AI.

Agents must identify deletion targets and consequences and obtain explicit user authorization; existing explicit authorization need not be requested again. `confirm: true` marks caller intent and cannot prove user consent to the server. All operations remain scoped to the token owner. Deletion is irreversible; there is no bulk-clear tool. After a timeout, read back before retrying. Field allowlists and empty-patch validation prevent accidental whole-object writes. All writes (imports, updates and deletions) share 10 operations/minute per user, within the overall 60 requests/minute budget.

Example (replace the ID and revision with actual detail values):

```json
{"id":"ITEM_ID","expectedRevision":"REVISION_FROM_DETAIL","patch":{"answerText":"x = 3","wrongAnswerText":null,"mistakeStatus":"unknown"}}
```

Image URLs require the agent token in the header, never the URL. To replace an original image, generate `patch.image` from file bytes in a script and send it through REST PATCH as described in the Skill. Import receipts now include `practiceRecordId` for `status: "duplicate"`; older receipts can locate the attempt through paginated details. No persistent fields or tables are added, so the backup format/version is unchanged.

## Install the import Skill

You can also download the zip from **Me → AI Agent Integration** (opens the Account settings tab) using your login session; no token is required. For Codex, extract it into `~/.agents/skills/`. For WorkBuddy, use **Skills → Upload Skill**. The archive preserves the `wrong-notebook-import/` top-level folder and includes a `README.txt` with this site’s MCP URL, without tokens. `outputFileTracingIncludes` in `next.config.ts` includes the source files in standalone output, so no additional repository copy is needed.

The shared Skill is `packaging/agent-skill/wrong-notebook-import/SKILL.md` (v5). Render full image/PDF pages, list question numbers and confirm the selected questions and student responses. Provide 1–4 relative rectangles per question in reading order, with coordinates from 0 to 1. Inspect previews before submission and compare the question, choices and student response word by word. Upload shared pages with `upload_source_page`, reuse each `pageId`, and submit `sourcePage` for server-side cropping. Only text-only sources omit source pages. Use LaTeX consistently, including `$a_{n+1}$` and `$a_{2026}$`, check browser rendering after saving, and fill textual `source` from the material.

The Skill includes `scripts/images.py` (Python 3.9+, standard library only). `import --items FILE --receipt NEW_FILE` accepts a question array with `pagePath`, `regions`, and optional `fileName` and `pageNumber`. Relative paths resolve from the JSON file, and each page is uploaded once. Pages accept JPEG/PNG up to 10 MiB and 4096 pixels on the longest edge. Legacy `imagePath` remains supported. `verify --id ID --source-page FILE --receipt NEW_FILE` compares provenance read-only. The file contains a receipt item's `sourcePage` object with `pageId`, `regions` and optional metadata. Legacy `verify --image FILE` still compares question-image bytes. `attach --id ID --image FILE --receipt NEW_FILE` reads the revision and patches only the image. Existing images require an authorized `--replace`. Attachment clears the original item's source regions. Correct provenance through `update_error_item` with `patch.sourcePage`.

Connection settings come from `WRONG_NOTEBOOK_URL` / `WRONG_NOTEBOOK_TOKEN`, or pass `--config .codex/config.toml` before the subcommand to read existing MCP settings (Python 3.11+). Credentials are never printed, and image encoding stays in memory. Keep pages, previews and input files in system temporary directories and private receipts outside Git. The standard library cannot reliably crop images locally. The script saves the server crop in a temporary directory and records `previewPath`, its SHA-256, `pageId` and regions for visual inspection. Use an available local tool to inspect regions before upload. The fallback requires visual self-review after saving.

Read details back and compare text, student responses, `sourcePage` and the question image. If a response includes `check` issues, correct what is possible and report each unresolved issue. Reports include the saved count, links and questions that still need user review. B2 writes currently support one source page. Leave cross-page questions pending. Use `--record-id practiceRecordId` to read a duplicate-import attempt's image. Attempts currently omit `sourcePage`, so the script leaves provenance pending instead of verifying it against the original item's source.

The script persists upload/write states and item IDs before readback, refuses existing receipts, and never follows redirects or retries automatically. Per-item failures in HTTP 200 responses, 409, 401, 429, disconnections and readback mismatches return nonzero while preserving receipts. Page uploads share the 10-writes-per-user-per-minute limit. For unknown outcomes, consult receipts or run read-only `verify` before another write. `state: verified` with every item `verified: true` means script checks passed. Inspect the actual crop and formula rendering separately.

For Codex, copy the directory from the repository root into the personal skill location, or into a project's `.agents/skills/`. Inspect an existing skill of the same name before updating:

```bash
mkdir -p ~/.agents/skills
cp -R packaging/agent-skill/wrong-notebook-import ~/.agents/skills/
```

Invoke `$wrong-notebook-import`. See [Codex skill discovery](https://developers.openai.com/codex/skills/).

For WorkBuddy, zip the `wrong-notebook-import` folder and use Skills → Add Skill → Upload Skill, then enable it in Installed. Preserve the folder and `SKILL.md` structure and exclude all tokens. See the [official WorkBuddy skills guide](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market). This repository delivers Skill source and does not install it into local clients automatically.


## Structured REST import

Send `Authorization: Bearer wnb_...` to every `/api/agent/*` request. No session cookie is needed. Each token accesses only its owner's data. The agent recognizes the image and supplies structured questions. The server does not add grade recognition or duplicate mastery evaluation; saved image questions call AI in the background according to the automatic integrity setting. The existing Openclaw API is unchanged.

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

Limits are shared across tokens and REST/MCP: 60 requests/minute per user, including MCP initialization and tool-list requests, counted once after authentication and before reading the body. At most 2 bodies may be read concurrently per user; excess requests return 429 with `Retry-After`, and slots are released after successful or failed reads. Writes (imports, corrections and deletions) are separately limited to 10 operations/minute. Rate limits return 429 with `Retry-After`; invalid authentication returns 401, invalid input 400, and inaccessible notebooks 404. Counters are in-process, reset on restart and are independent across instances.

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

The single source of truth is the fixed body line `Skill-Version: 5` in `SKILL.md` (older files without this line count as version 1). The server reads it from the source file; settings and the archive's `README.txt` display the same version. A body line is used because the [Codex documentation](https://learn.chatgpt.com/docs/build-skills) and [WorkBuddy structure guide](https://open.workbuddy.cn/docs/skill) do not explicitly guarantee that both clients accept arbitrary `metadata.version` fields.

MCP initialization `instructions` advertise the latest version and update steps, allowing older Skills to receive the reminder too. MCP `list_notebooks` and REST `GET /api/agent/notebooks` preserve `notebooks` and add:

```json
{"notebooks": [], "skill": {"version": 5, "downloadUrl": "https://your-domain/api/agent/skill"}}
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

## Source pages and server-side cropping

`upload_source_page` maps to `POST /api/agent/source-pages`. Supply `{ base64, mimeType }` or `{ url }`, optionally with `fileName`, a one-based `pageNumber`, and `origin` (`agent` by default, also `upload`, `pdf`, or `docx`). It returns `{ pageId, width, height, reused }`. Original image bytes are deduplicated by SHA-256 within each user. Reuploads retain the first filename, page number, and origin. Uploads share the existing 10 writes/minute/user limit.

Pages accept JPEG and PNG, up to 10 MiB and 4096 pixels on the longest edge. The server sniffs the format and checks header dimensions before decoding and validating. WebP and other formats return `AGENT_SOURCE_FORMAT_UNSUPPORTED`. URLs follow the existing public HTTPS, pinned DNS, no redirects, and 10-second total timeout rules. Coordinates refer to the image pixels described by the returned width and height.

Each `create_error_items` item or `update_error_item` patch can contain the following `sourcePage` object. Choose `pageId` or `page`, exclusively. `page` takes the image input described above and combines upload with import. A `sourcePage` object is mutually exclusive with `image`, including `image: null`.

```json
{
  "sourcePage": {
    "pageId": "replace-with-page-id",
    "regions": [
      { "x": 0.08, "y": 0.12, "width": 0.84, "height": 0.25 },
      { "x": 0.08, "y": 0.65, "width": 0.42, "height": 0.2 }
    ]
  }
}
```

Each question has 1–4 regions. `x`, `y`, `width`, and `height` use relative coordinates from 0 to 1. Width and height must be at least 0.01, and the rectangle must fit within the page. The server adds 0.008 relative padding, stacks regions vertically in submission order with left alignment and a 16-pixel gap, and preserves their relative sizes on the same page. Output is white-background JPEG at quality 0.85, with a longest edge of 1600 pixels and at most 1 MiB. Oversized output is progressively downscaled.

The question image and regions are written in one transaction. Updating `sourcePage` replaces all old regions. Replacing or clearing the image with `image` also clears the regions. Duplicate imports preserve the original question and its source. The new crop belongs to the duplicate-attempt snapshot identified by the returned `practiceRecordId`. Use `update_error_item` to change the original question's source.

Details return `item.sourcePage` as `{ pageId, fileName, pageNumber, regions }`, or `null` for questions without a source page. For existing cross-page questions restored from B1 backups, each region also carries `pageId`, `fileName`, and `pageNumber` to preserve page ownership. Write parameters in this step address one source page at a time. `source` accepts textual provenance strings only, retains its name in details, and can accompany `sourcePage`. The search `source` filter continues to match textual provenance. Optional `fileName` and `pageNumber` in `sourcePage` only fill empty fields on the shared page. Existing values are preserved without errors.

Source error codes include `AGENT_SOURCE_INVALID` (invalid `sourcePage`, page-upload input, regions, or conflict with `image`), `AGENT_SOURCE_PAGE_NOT_FOUND` (404, also used for another user's page), `AGENT_SOURCE_FORMAT_UNSUPPORTED`, `AGENT_SOURCE_TOO_LARGE` (413), `AGENT_SOURCE_DIMENSIONS_EXCEEDED`, and `AGENT_SOURCE_CROP_TOO_LARGE`. REST operation errors use the existing `message` field. Per-item batch errors and MCP tool failures use `error`.

With the application stopped, `npm run images:prune -- --offline` also previews images belonging to source pages without region references. Adding `--delete` removes orphan page rows and prunes files against all business references. Shared files remain while referenced. Uploaded pages awaiting their first question follow the same cleanup rule. Source pages and regions use the current backup v18 (supported since v17).

## Synchronous rule check results

Each successful `results[]` entry from `create_error_items`, and the `item` returned by `update_error_item` or `get_error_item`, includes `check: { status, issues }`. This stage writes `pass` (no pending user issue, including dismissed issues) or `flagged` (pending user issue). Unchecked records or a failed initial check return `none`; existing `dismissed` and `resolved` statuses are returned as stored. A `pass` result can still contain agent-only issues. Reading details returns stored results without checking existing questions again.

Each issue has `code`, `severity: 'major' | 'minor'`, `visibility: 'user' | 'agent'`, `field`, and `source: 'rules' | 'ai'`, with optional `message`, `evidence`, `suggestion`, `model`, and `dismissed`. Synchronous rules (`checkVersion = 1`) make no AI calls and do not reject saves; image questions additionally run background AI comparison as described below. Only `missing_figure` (Chinese text referring to a figure with neither a figure nor an original image) appears on web proofreading cards. Missing answers, options or blanks, subquestion count differences, formula syntax, and image/PDF input without a source page are agent-only. Number gaps are checked only when an explicitly continuous same-page batch sequence is passed to the rule function; the current API does not infer gaps from a user's selected questions.

Inspect all `issues` after saving, fix what you can through `update_error_item`, and report unresolved items individually. Changes to question text, answers, type, figures, original images or provenance rerun rules synchronously while retaining AI issues and dismissals keyed by `code + field`, including dismissals for temporarily absent issues. Check failures are logged without failing the save. The current full backup v18 preserves `checkStatus`, `checkIssues` (a JSON string), `checkedAt`, and `checkVersion`; the question exchange JSON v1 content structure stays the same.

## Background integrity checks and privacy

Images imported by agents are also checked after saving: the server sends the question image, source-page thumbnails (with highlighted question regions), question text, reference answer and recorded student answer to its configured AI service, subject to account AI data consent. The initial response contains synchronous rule checks; read later AI results through `get_error_item` → `check`. Saving successfully does not prove an AI check passed. `source: "ai"` identifies AI issues, and `visibility: "agent"` issues stay out of the user review entry. For text differences, `evidence` contains the image excerpt and `suggestion: { textSays, imageSays }` supplies the saved and proposed replacement fragments; verify the source before correcting them.

Edits to the question, reference answer, student answer, image or source regions trigger a debounced recheck, without automatically editing the question. AI and rule issues coexist and preserve dismissed types. Exhausted quotas, disabled checks or missing consent cause a skip; background failure does not undo an import. Administrators can disable “Automatically check imported questions against original images” under **Settings → AI Settings**, or specify a separate vision model (blank reuses recognition). Checks count toward AI usage and quotas; text-only questions do not call AI.
