/** Plan mode is read-only; progress mutations belong to execution mode. */
export function selectModeTools<T extends { name?: string }>(
  tools: T[],
  mode: string,
  allowed?: ReadonlySet<string> | null,
): T[] {
  const planning = new Set([
    "read_file",
    "list_files",
    "search_files",
    "ask_clarification",
    "create_plan",
    "get_plan",
  ]);
  const planningOnly = new Set(["ask_clarification", "create_plan"]);
  const progressWrites = new Set(["mark_step_complete", "update_plan"]);
  return tools.filter((tool) => {
    const name = tool.name ?? "";
    if(name === "report_task_status") return mode !== "plan";
    if (mode === "plan" && progressWrites.has(name)) return false;
    if (allowed) return allowed.has(name);
    return mode === "plan" ? planning.has(name) : !planningOnly.has(name);
  });
}
