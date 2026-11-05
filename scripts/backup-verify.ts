import "server-only";

import { getErrorMessage } from "../src/lib/error-message";
import { verifyBackup } from "../src/lib/server-backup/verify";

async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !args[0].trim()) {
        // 验证脚本向终端输出单个 JSON，不输出题目或用户资料。
        console.info(JSON.stringify({ ok: false, errors: ["USAGE: npm run backup:verify -- <快照目录或 manifest 路径>"] }));
        process.exitCode = 1;
        return;
    }
    const result = await verifyBackup(args[0]);
    console.info(JSON.stringify(result));
    if (!result.ok) process.exitCode = 1;
}
main().catch((error: unknown) => {
    console.error(JSON.stringify({ ok: false, errors: [getErrorMessage(error)] }));
    process.exitCode = 1;
});
