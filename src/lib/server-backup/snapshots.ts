import "server-only";

import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { localImagePath } from "../image-storage";
import { imageHealth, mirrorPath, readManifest } from "./files";
import type { BackupManifest, BackupSnapshot } from "./schema";

const SNAPSHOT_NAME = /^snapshot-[0-9T-]+Z-[a-f0-9-]{36}$/;

export async function snapshotManifests(directory: string) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }
    const snapshots: Array<{ name: string; manifest: BackupManifest }> = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || !SNAPSHOT_NAME.test(entry.name)) continue;
        // 任一 manifest 不可读时中止清理，绝不凭不完整的引用集合删除镜像。
        snapshots.push({ name: entry.name, manifest: await readManifest(path.join(directory, entry.name)) });
    }
    return snapshots.sort((a, b) => b.name.localeCompare(a.name));
}

export async function listSnapshots(directory: string): Promise<BackupSnapshot[]> {
    return (await snapshotManifests(directory)).map(({ name, manifest }) => ({ name, createdAt: manifest.createdAt, size: manifest.database.size }));
}

export async function mirrorImages(directory: string, references: string[]) {
    const result = { missingImages: 0, corruptImages: 0, copiedImages: 0, missingImageReferences: [] as string[], corruptImageReferences: [] as string[] };
    for (const reference of references) {
        const destination = mirrorPath(directory, reference);
        const existing = await imageHealth(destination, reference);
        if (existing === "ok") continue;
        if (existing === "corrupt") await rm(destination);
        const source = localImagePath(reference);
        const health = await imageHealth(source, reference);
        if (health !== "ok") {
            result[health === "missing" ? "missingImages" : "corruptImages"]++;
            result[health === "missing" ? "missingImageReferences" : "corruptImageReferences"].push(reference);
            continue;
        }
        await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        const temporary = `${destination}.${randomUUID()}.tmp`;
        try {
            await copyFile(source, temporary);
            if (await imageHealth(temporary, reference) !== "ok") { result.corruptImages++; result.corruptImageReferences.push(reference); continue; }
            await rename(temporary, destination);
            result.copiedImages++;
        } finally { await rm(temporary, { force: true }); }
    }
    return result;
}

/** 发布后保留最近快照及最新完整快照，再依据全部保留清单回收镜像。 */
export async function pruneSnapshots(directory: string, keep: number): Promise<void> {
    const snapshots = await snapshotManifests(directory);
    const retainedSnapshots = snapshots.slice(0, keep);
    if (!retainedSnapshots.some(({ manifest }) => manifest.complete)) {
        const complete = snapshots.find(({ manifest }) => manifest.complete);
        if (complete) retainedSnapshots.push(complete);
    }
    const names = new Set(retainedSnapshots.map(({ name }) => name));
    for (const snapshot of snapshots) {
        if (!names.has(snapshot.name)) await rm(path.join(directory, snapshot.name), { recursive: true });
    }
    const retained = new Set(retainedSnapshots.flatMap(({ manifest }) => manifest.images));
    let folders;
    try { folders = await readdir(path.join(directory, "images"), { withFileTypes: true }); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }
    for (const folder of folders) {
        if (!folder.isDirectory() || !/^[a-f0-9]{2}$/.test(folder.name)) continue;
        for (const file of await readdir(path.join(directory, "images", folder.name), { withFileTypes: true })) {
            const reference = `local-image:${file.name}`;
            if (file.isFile() && /^[a-f0-9]{64}\.(jpg|png|webp|gif)$/.test(file.name) && file.name.startsWith(folder.name) && !retained.has(reference)) {
                await rm(path.join(directory, "images", folder.name, file.name));
            }
        }
    }
}
