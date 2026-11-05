import "server-only";

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { getErrorMessage } from "../src/lib/error-message";
import { migrateImages, pruneImages } from "../src/lib/image-maintenance";

config({ quiet: true });

async function main() {
    const [command, ...flags] = process.argv.slice(2);
    if (!["migrate", "prune"].includes(command) || flags.some((flag) => !["--offline", "--delete"].includes(flag))
        || !flags.includes("--offline") || (command === "migrate" && flags.includes("--delete"))) {
        throw new Error("请先停止应用并备份数据，再运行：npm run images:migrate -- --offline，或 npm run images:prune -- --offline [--delete]");
    }
    const db = new PrismaClient();
    try {
        const result = command === "migrate" ? await migrateImages(db) : await pruneImages(db, flags.includes("--delete"));
        console.info(JSON.stringify(result));
    } finally {
        await db.$disconnect();
    }
}

main().catch((error: unknown) => {
    // 维护脚本直接向终端报告错误，不输出数据库或图片内容。
    console.error(getErrorMessage(error));
    process.exitCode = 1;
});
