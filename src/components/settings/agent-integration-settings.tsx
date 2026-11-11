"use client";

import { AgentGuide } from "@/components/question-entry/agent/agent-guide";

/** 设置页复用接入流程，并默认展开管理与手动配置。 */
export function AgentIntegrationSettings() {
    return <section id="agent-title" className="min-w-0"><AgentGuide advancedOpen /></section>;
}
