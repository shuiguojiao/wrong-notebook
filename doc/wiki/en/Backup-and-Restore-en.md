# Backup and Restore

Web export is for moving personal learning data; restoring a whole site requires backing up the database, image directory, server configuration and deployment parameters.


## Automatic server snapshots

Enabled by default, checked around 03:00 in the application time zone each day. Five minutes after startup, a catch-up runs if the last successful backup is over 24 hours old or absent. Manual and scheduled runs share a process-wide mutex; builds never schedule backups. No backups run while the service or Android standalone app is stopped. Desktop and standalone launchers use writable per-user data directories. Directory errors are reported without crashing the service.

- `BACKUP_ENABLED=true`: set `false` to disable both manual and automatic backups.
- `BACKUP_KEEP=7`: retain the latest 7 snapshots (1–365); if none is complete, also retain the latest complete snapshot and its images.
- `BACKUP_DIR`: defaults to `backups/` next to the database, `/app/data/backups` in Docker or `prisma/backups` from source. Custom locations must be persistent and writable by the service account.

**Backups on the same disk cannot protect against disk failure. Use another disk or a persistent NAS mount for `BACKUP_DIR`, or regularly sync the entire backup directory off-site.** Configure the corresponding container mount and permissions in Docker. Multiple service processes must not share a backup directory; locking is process-local.

Each `snapshot-*/` contains `database.sqlite` and `manifest.json`; snapshots share the backup root's incremental `images/` mirror. SQLite `VACUUM INTO` creates a consistent database snapshot rather than copying a live database file. Images are copied and verified by content hash; the manifest records all references. A verified database is atomically published and triggers retention even when images are incomplete (`partial`). The manifest records `complete` and missing/damaged `local-image:` references in `missingImageReferences` / `corruptImageReferences`, without absolute paths. Image cleanup respects all retained snapshots.

Administrators can view the backup location, last result and snapshots on the admin dashboard and trigger a backup. A prominent warning appears after 48 hours without success.

`status.json` stores the last result, last database success (including partial) and `lastCompleteAt` (null for older status files). Errors remain in memory if the directory itself is unwritable. Backups include all users, password hashes and sensitive database content, without encryption; restrict access. Server configuration, environment files and certificates still need separate backups. Never expose the backup directory as static files or run offline `images:prune` while a backup is running.



## Verification and restore drills

Automatic backups and the verifier require Node.js 22.13 or later and use a built-in SQLite read-only connection. Unsupported runtimes report `BACKUP_NODE_UNSUPPORTED` with an upgrade hint on the admin page. Backup module or scheduler startup failures are logged without preventing application startup. Run from the source directory without configuring or stopping the live database:

```bash
npm run backup:verify -- /mnt/backup/wrong-notebook/snapshot-TIMESTAMP-ID
# Or pass its manifest.json
npm run backup:verify -- /mnt/backup/wrong-notebook/snapshot-TIMESTAMP-ID/manifest.json
```

JSON output includes `ok`, SQLite `integrity_check`, user and error-item counts, image reference counts, missing/damaged counts, database checksum and manifest-reference validation. `databaseValid` distinguishes database health from `imagesComplete`. Partial snapshots exit nonzero; exit status is 0 only if everything passes. No user details or question content are printed. npm may print its command banner; add `--silent` when parsing the JSON. Check the counts as well as the exit status.

In Docker, use a path inside the container:

```bash
docker compose exec --user nextjs:nodejs wrong-notebook npm run backup:verify -- /app/data/backups/snapshot-TIMESTAMP-ID
```

The installed npm package also provides the script. Desktop, fnOS and Android standalone server bundles include a compiled command, runnable from the bundle directory with its matching Node runtime:

```bash
node --conditions=react-server dist-scripts/scripts/backup-verify.js /actual/backups/snapshot-TIMESTAMP-ID
```

For a restore drill, copy **both the snapshot directory and the complete shared `images/` mirror** into an isolated location, keeping `backup-root/snapshot-*/` and `backup-root/images/` as siblings, then verify the copy. A snapshot directory alone cannot restore images. Off-site copies must include both; sync while no backup is running to avoid racing retention.

### Restore an automatic snapshot

1. Verify a backup copy first. Require `ok=true`, a known application version and plausible user/error-item counts. Save another copy of current data, configuration and version information.
2. **Stop every service process using the database** (for example `docker compose stop wrong-notebook`; exit the local service on desktop/Android). Never overwrite a running database.
3. Move the current database and its `-wal`, `-shm` and `-journal` sidecars to a safe location. Never combine old WAL files with the restored database. Copy `database.sqlite` from the snapshot to the actual `DATABASE_URL` file path, using the original database filename.
4. Copy the backup root's `images/` contents to `IMAGE_STORAGE_DIR`, or `images/` next to the actual database when unset. You may move aside the current image directory before copying the entire mirror. Extra images belonging to other retained snapshots are harmless.
5. Restore read/write permissions on the database, image directory and parent directories for the service account. Start the matching app version with the original configuration and `NEXTAUTH_SECRET`, and `PRESERVE_EXISTING_DATA=true`. Perform upgrades separately through formal migrations.
6. Start the service (for example `docker compose start wrong-notebook`), check health, sign in and inspect users, mistakes, original images, tags, history and exams. Disable automatic backups or use a separate `BACKUP_DIR` in the drill environment.

The verifier does not validate external configuration, certificates or third-party image URLs; it cannot replace signed-in functional checks. Do not use the backup directory as live database/image storage. Mirror cleanup depends on retained manifests; never edit manifests or delete snapshots while the service is running.


## What each backup covers

| Method | Contents | Use |
| --- | --- | --- |
| Web JSON export (full backup) | Notebooks, system and custom tags, questions, review schedules, practice records, random exam papers, unprocessed recognition tasks and some profile data | Keeping personal data, importing supported fields |
| Question Exchange JSON (Export JSON) | Selected error item question content (question text, answer, analysis, knowledge points, difficulty, figures, optional original images) | Exchanging question content, cross-system import |
| Automatic server snapshots | Complete SQLite database, all users and shared image mirror; excludes external configuration and certificates | Scheduled data protection and offline restore |
| Full-site file backup | The complete SQLite database, image directory, `config/`, deployment configuration and any certificates | Disaster recovery, moving the site, preparing a rollback before upgrades |

The JSON export does not include full user accounts with passwords, AI data sharing consent or the server AI configuration. Even when an admin exports all data, it does not replace a full-site backup.

## Web export and import

Export JSON from the data management section in the settings and keep it safe. When a regular user imports, the email in the export file must match the current account; admins can import and export data for all users.

### Export JSON (Question Exchange Format)

The error list's multi-select bar provides an "Export JSON" feature that exports selected error items as a [Question Exchange JSON v1](../QUESTION_FORMAT.en.md) file. Unlike a full backup, the exchange format contains only question content (question text, answer, analysis, knowledge points, difficulty, figures, etc.) and does not include practice records, review schedules, exam papers, user preferences, or other data.

- Only error items belonging to the current user are exported; ids not owned by the user are silently ignored.
- Optional "Include original images": local image files and legacy Base64 images (PNG/JPEG/WebP) are embedded in the `images` field when enabled.
- Questions with empty question text are skipped and counted in `warnings` as `EMPTY_QUESTION_TEXT_SKIPPED`.
- The export result can be parsed directly by `parseQuestionFile`, achieving a round-trip.

### Full backup export

If local image files are missing or fail checksum verification, full backups (including admin exports of all data) leave those image fields empty and continue. Settings warns how many images were skipped. The optional `missingImages` count appears only when images were skipped (counted per field, so a shared file can count more than once). It does not affect import; the format stays at version 12 and older backups still import. Question exports also skip missing or damaged original images and report the count in the `X-Missing-Images` response header. Skipped images cannot be restored from this backup; retain the original image directory or another intact backup.

System and custom tags retain their tag system and parent-child hierarchy. Identically named chapters and knowledge points under different grades are restored separately, and questions reconnect to the specific nodes recorded in the backup. This includes Chinese grades, chapters, knowledge points and custom tags beneath them. Import supports older backups whose child nodes appear before their parents; repeating an import does not duplicate tags at the same path.

Question figures, GeoGebra demos, Chinese and English SVG animations with their synthesized cloud voice (MP3), the latest similar question and mastery probability are all restored from the export file; SVG is sanitized again on import, and questions without a mastery probability are re-evaluated after import. Exam papers are restored together with their questions and every recorded result; questions still being generated at export time show as failed after import and can be regenerated on the exam page. Importing your own export file also restores preferences such as the question grade rule and fixed grade, review before import, the duplicate threshold, GeoGebra demos, SVG animations and the interface theme.

Export files use version 12, which includes unprocessed recognition tasks (drafts awaiting review and failed tasks, with the question image or question text and the recognition result) and unfinished multi-question batches (split drafts with your adjustments, batches whose split failed, and started batches with questions not yet imported); saved tasks and fully imported batches are not exported. On import, review drafts and split drafts stay as they were; all other tasks, including those still recognizing or saving at export time, show as failed, and batches that were still splitting show as split failed, so you can retry them when needed. Importing never calls the AI. Tasks of a batch stay in their batch after import, and importing the same file again creates nothing new. Older backups without these fields import as before.

Version 7 adds an `extensions` namespace for fork projects to store private extension data (such as question-bank metadata). `extensions` is organized as `<key>: { version, data }`; each extension manages its own version. The upstream exports an empty object `{}` by default; on import, unregistered keys are safely skipped with a warning, and extensions newer than the running program are skipped as well. Fork projects can register extensions in the `BACKUP_EXTENSIONS` array in `src/lib/backup-extensions.ts`.

Version 8 adds a `mode` field to `examPapers` (`generate` for similar questions / `original` for original questions). Older files without this field import as `generate`.

Version 9 adds a `questionType` field to `errorItems` (question type such as single choice, fill in the blank, calculation, etc.). Older files without this field import as null.

Version 10 adds a `score` field to `examPapers.questions` (per-question score, up to one decimal place). Older files without this field import as no score set.

Version 11 adds a `groupByType` field to `examPapers` (whether questions are grouped into sections by question type) and a `questionType` field to `examPapers.questions` (the source question type snapshotted when the exam question was created). Older files without these fields import as false / null.

Import merges existing notebooks and tags and handles duplicates by question similarity. A duplicate may add another wrong attempt under the existing question, so importing the same file repeatedly can change the practice history.

Keep the original backup before importing, and afterwards check the new questions, tags, duplicate count and answer history. To restore to an exact point in time, use a file backup.

Restoring a backup keeps each question's original grade and does not apply the current entry rule. Old backups without a grade rule leave your current account settings unchanged.

Each mistake's and each exam question's figure display scale and alignment (left / center / right) are exported and restored for page display and printouts. Older backups with no scale or alignment, or an invalid value, use the default 100% and center.

## Docker full-site backup

Images default to `images/` next to the database: `/app/data/images` in Docker (inside the `data/` mount), or `prisma/images/` from source. `IMAGE_STORAGE_DIR` can select another persistent directory; include that directory when backing up and restoring. Images are served through authenticated routes; do not expose the directory as public static files.

SQLite stores question and learning data with internal file references for images. Legacy Base64 data remains readable. Full JSON backups still embed images, including answer snapshots, pending tasks and drafts. Question JSON embeds original images when requested. Imports write image files again; local paths are never exported. The backup data structure remains version 12.

### Migrating old images and cleaning files

Stop the app and back up the database and existing image directory first. From the source checkout, with the same `DATABASE_URL` and `IMAGE_STORAGE_DIR` as the app, run:

```bash
npm run images:migrate -- --offline
npm run images:prune -- --offline
```

Migration processes question images, answer snapshots, recognition tasks, page images and images inside split drafts in pages. Files are written and verified before references change; timestamps are preserved and reruns are safe. If interrupted, migrated images remain usable and unmigrated rows retain Base64. The commands do not stop the app: `--offline` declares that all app processes using this database and image directory have been stopped.

Pruning only reports unreferenced files by default. After stopping and backing up, add `--delete` to remove them. Shared images remain while any question, answer record, task or draft references them. Files left by deleted questions, replaced images or failed database transactions are cleaned here to avoid deleting shared files during concurrent operations. Pruning aborts before deleting anything if any referenced file is missing or corrupt.

For Docker, run a one-off maintenance container with the same image, mounts and environment after stopping the service:

```bash
docker compose stop wrong-notebook
docker compose run --rm --no-deps --user nextjs:nodejs --entrypoint node wrong-notebook --conditions=react-server dist-scripts/scripts/images.js migrate --offline
docker compose run --rm --no-deps --user nextjs:nodejs --entrypoint node wrong-notebook --conditions=react-server dist-scripts/scripts/images.js prune --offline
docker compose start wrong-notebook
```

Install packages also include `dist-scripts/scripts/images.js`; use the same Node arguments with an explicit absolute `DATABASE_URL` and any custom image directory. Investigate command failures before restarting and retain the original backup. Migration does not immediately shrink an existing SQLite file; later writes reuse free pages. If physical compaction is needed, back up and stop the app before running SQLite `VACUUM`, with sufficient temporary disk space.

This example uses the directory layout from the [deployment guide](Deployment-en). Stopping the app before archiving keeps the SQLite data file, its WAL/SHM files and the configuration consistent.

Run in the deployment directory:

```bash
mkdir -p backups
docker compose stop wrong-notebook
backup_file="backups/wrong-notebook-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$backup_file" data config docker-compose.yml .env
docker compose start wrong-notebook
tar -tzf "$backup_file"
```

If the backup fails, do not continue with the upgrade; fix the cause and confirm the service is back first. When using the built-in HTTPS, add `certs/` to the archive, along with any other deployment files.

Backups may contain question images, user profiles, password hashes and AI credentials. Restrict access, keep them in a separate location, check that the archive can be read, and verify the restore process in an isolated environment.

## Restore the whole site

1. Confirm the backup time, source version and archive contents; keep another copy of the current data and configuration.
2. Stop the app so nothing is written to the database during the restore.
3. Unpack and check the backup in a separate directory, then restore `data/`, `config/` and the required deployment files.
4. Prefer the image version that matches the backup, and keep the correct mount paths and `NEXTAUTH_SECRET`.
5. After starting, check `/api/health`, then sign in and check users, questions, tags, answer history and exam papers.

Do not switch an old database back and forth between incompatible versions. When an upgrade is needed, run the [upgrade steps](Deployment-en) separately after the restore has been verified.

## Backups when running from source

The default SQLite file is `prisma/dev.db`; the actual location is decided by `DATABASE_URL`. Stop the service, then back up the directory holding the actual database, `config/`, `.env` and the version information. When restoring, use the matching code and dependencies, and run the formal migrations if needed.

Sources: [export](https://github.com/margrop/wrong-notebook/blob/main/src/app/api/export/route.ts) · [import](https://github.com/margrop/wrong-notebook/blob/main/src/app/api/import/route.ts) · [data model](https://github.com/margrop/wrong-notebook/blob/main/prisma/schema.prisma).

From version 12, practice records include working notes (`notes`) and the automatic grading reason (`gradeReason`), while the submitted answer uses the existing answer snapshot (`wrongAnswerText`). Older backups without the new fields restore them as null.
