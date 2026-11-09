# Existing-question integrity operations

Existing questions are checked on demand; no full backfill runs automatically. Back up before deploying and apply the regular Prisma migrations while preserving existing data. This migration adds only a nullable user-level daily surfacing ledger. Do not recreate the database for checks.

## Manual, rate-limited backfill

As with the review-state backfill, explicitly set the target database and enable Node's `react-server` condition. Validate against an isolated copy first:

```bash
DATABASE_URL="file:/absolute/path/target.db" node --conditions=react-server scripts/backfill-question-integrity.cjs --user user@example.com --source-prefix "Past paper" --limit 100 --interval-ms 1000 --rules-only
```

- `--user`: optional user ID or full email. An unknown user is an error; it never falls back to all users.
- `--source-prefix`: optional prefix of the question's `source` field, rather than the source-page filename.
- `--limit`: maximum questions, default 100, range 1–10000. Selects unchecked or outdated questions by creation time and ID.
- `--interval-ms`: delay after one question finishes before the next starts; default 1000 ms, range 100–60000. Processing is sequential.
- `--rules-only`: the default; no AI calls or AI quota consumption.
- `--ai`: explicitly enables AI alongside rules; mutually exclusive with `--rules-only`. Waits for the existing debounced queue to finish and persist results before processing the next question. Consent, administrator settings, quotas, model concurrency and retries still apply.

Omitting user and source includes all users; start with a small limit. One JSON line reports `selected`, `checked` (rules completed), `skippedOrFailed` (concurrently checked or failed), `flagged` (including deferred findings), `deferred`, and `rulesOnly`. `checked` does not prove an AI call happened: disabled checks, missing images, exhausted quotas or missing consent skip AI. Current-version questions are excluded on later runs; this script does not force AI retries.

Rules and AI share the three-new-legacy-questions daily limit per user. Resolving or deleting a question does not refund the allowance. Excess findings retain their evidence and are released, up to three per day, when the unified entry is read. All dates follow the application time zone. The script never registers a scheduled task.

## Daily observations

Authenticated administrators can read `GET /api/admin/question-integrity`. Responses disable caching and also produce an `integrity-daily-summary` log. Ordinary users cannot access it. The endpoint never surfaces, checks or changes questions and never invokes AI.

- `imports`, `flaggedImports`, `flaggedImportRate`: today's newly imported questions, those ever found to have a visible issue, and their ratio.
- `byType`: `handled`, `dismissed` and `dismissRate` per issue type. Tighten types with a dismissal rate reaching 30%.
- `timedActions`, `timedQuestions`, `averageHandlingMs`: timed action samples, question samples and mean duration per question (summing same-day actions for each question). Target below 10000 ms; no samples return `null`.

Only imports with the new metadata participate; historical timings are never invented, and pending AI makes ratios a current snapshot. Repairs retain previous finding counts. Deleting a question removes its metadata: the endpoint covers retained questions, while delete events remain in `question-check-handling` logs. It is not a complete audit ledger. Timing includes time spent on a card and confirmations, capped at one hour. Optional v17 backup fields remain backward compatible; same-day ledger restoration keeps the larger count.
