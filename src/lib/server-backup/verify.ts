import "server-only";

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getErrorMessage } from "../error-message";
import { inspectDatabase } from "./database";
import { databaseMetadata, errorCode, imageHealth, mirrorPath } from "./files";
import { manifestSchema } from "./schema";

/** 独立于在线数据库和环境配置，只读验证整份快照及其共享图片镜像。 */
export async function verifyBackup(target: string) {
    const result = {
        ok: false, integrity: "unchecked", users: 0, errorItems: 0, referencedImages: 0,
        missingImages: 0, corruptImages: 0, databaseHashValid: false, manifestReferencesValid: false, errors: [] as string[],
    };
    try {
        const input = path.resolve(target);
        const manifestPath = (await stat(input)).isDirectory() ? path.join(input, "manifest.json") : input;
        const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
        const snapshot = path.dirname(manifestPath);
        const database = path.join(snapshot, manifest.database.file);
        const metadata = await databaseMetadata(database);
        result.databaseHashValid = metadata.sha256 === manifest.database.sha256 && metadata.size === manifest.database.size;
        if (!result.databaseHashValid) result.errors.push("DATABASE_CHECKSUM_MISMATCH");
        const inspected = inspectDatabase(database);
        result.integrity = inspected.integrity;
        result.users = inspected.users;
        result.errorItems = inspected.errorItems;
        result.referencedImages = inspected.images.length;
        result.manifestReferencesValid = JSON.stringify(inspected.images) === JSON.stringify([...manifest.images].sort())
            && manifest.referencedImages === inspected.images.length;
        if (!result.manifestReferencesValid) result.errors.push("MANIFEST_REFERENCES_MISMATCH");
        if (manifest.missingImages || manifest.corruptImages) result.errors.push("MANIFEST_IMAGES_INCOMPLETE");
        for (const reference of inspected.images) {
            const health = await imageHealth(mirrorPath(path.dirname(snapshot), reference), reference);
            if (health === "missing") result.missingImages++;
            if (health === "corrupt") result.corruptImages++;
        }
        if (result.missingImages) result.errors.push("BACKUP_IMAGES_MISSING");
        if (result.corruptImages) result.errors.push("BACKUP_IMAGES_CORRUPT");
        result.ok = result.errors.length === 0;
    } catch (error) {
        result.errors.push(getErrorMessage(error) === "DATABASE_INTEGRITY_FAILED" ? "DATABASE_INTEGRITY_FAILED" : errorCode(error));
    }
    return result;
}
