import "server-only";

import { createHash } from "node:crypto";
import { serializeLastPractice } from "@/lib/last-practice";
import type { LastPractice } from "@/lib/last-practice";

/** 题目、答案和生成时间一起绑定；旧版缓存无需迁移即可获得稳定版本。 */
export function getPracticeVersion(practice: LastPractice): string {
    return createHash("sha256").update(serializeLastPractice(practice)).digest("hex");
}
