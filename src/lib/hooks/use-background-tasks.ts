"use client";

import { useEffect, useState } from "react";
import { backgroundTaskStore } from "@/lib/background-task-store";

/** 只订阅现有共享 store，不增加轮询。 */
export function useBackgroundTasks() {
    const [tasks, setTasks] = useState(() => backgroundTaskStore.getSnapshot());
    useEffect(() => backgroundTaskStore.subscribe(setTasks), []);
    return tasks;
}
