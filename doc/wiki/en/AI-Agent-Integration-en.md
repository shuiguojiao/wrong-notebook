# AI Agent Integration

Create a personal access token under **Settings → Account → AI Agent Integration**. Enter a name and optional expiration. Copy the plaintext immediately: it is shown only once. Each account can have up to 20 unrevoked tokens. The list shows prefixes and last usage; revoke a token at any time.

Tokens use the `wnb_` prefix plus random data. Only SHA-256 hashes are stored. Credentials are excluded from personal and full backups; create new tokens after restoring elsewhere. Grant tokens only to trusted agents, treat them as account writing credentials, and use HTTPS. Never expose them in logs, screenshots or Git.

The settings panel provides a reserved MCP address and client examples. Structured import APIs and MCP tools will be connected in subsequent commits.

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
| `image` | Optional. Exactly one of `{"base64":"...","mimeType":"image/png"}` or `{"url":"https://..."}`. JPEG/PNG/WebP only, ≤5 MiB decoded bytes, matching MIME/signature. Uses existing local image storage; no image stores an empty string |

URLs must use public HTTPS on the default port, without credentials or redirects. Public DNS addresses are pinned; private addresses are rejected. Downloads time out after 10 seconds. Prefer base64 to avoid revealing image origins in remote server access logs. JSON request limit: 145 MiB.

Duplicates preserve the original question and add a wrong-attempt record, returning `status: "duplicate"`. New questions return `created`. Confirm imports with the user after checking duplicates.

Limits are shared across tokens and REST/MCP: 60 calls/minute per user, including at most 10 imports/minute. Rate limits return 429 with `Retry-After`; invalid authentication returns 401, invalid input 400, and inaccessible notebooks 404. Counters are in-process, reset on restart and are independent across instances.

This synchronous per-item flow does not create `ImportBatch` records, whose semantics concern split drafts and recognition tasks. This avoids making completed structured imports eligible for AI recognition retries. Save hooks and logs mark origin `agent`; callers may provide a custom question `source`. Agents should retain the returned results. Saved questions use existing backup/export behavior; credentials remain excluded, with no backup version change.

```bash
curl "$WRONG_NOTEBOOK_URL/api/agent/notebooks" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN"

curl "$WRONG_NOTEBOOK_URL/api/agent/error-items" \
  -H "Authorization: Bearer $WRONG_NOTEBOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"items":[{"notebookId":"replace-with-notebook-id","questionText":"Solve x + 2 = 5","answerText":"x = 3","wrongAnswerText":"x = 7","knowledgePoints":["Linear equations"]}]}'
```
