"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  inferAgentPanelSource,
  OPEN_AGENT_SEARCH_PARAM,
  THREAD_SEARCH_PARAM,
  type AgentPanelOpenContext,
} from "@/lib/agent/panel";
import { useAgentPanel } from "./AgentPanelContext";

export default function AgentPanelUrlSync() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { open } = useAgentPanel();

  useEffect(() => {
    if (searchParams.get(OPEN_AGENT_SEARCH_PARAM) !== "1") return;

    const context: AgentPanelOpenContext = {
      source: inferAgentPanelSource(pathname, searchParams),
    };
    const threadId = searchParams.get(THREAD_SEARCH_PARAM);
    if (threadId) context.threadId = threadId;

    open(context);

    const params = new URLSearchParams(searchParams.toString());
    params.delete(OPEN_AGENT_SEARCH_PARAM);
    const search = params.toString();
    const newUrl = `${pathname}${search ? `?${search}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", newUrl);
  }, [searchParams, pathname, open]);

  return null;
}
