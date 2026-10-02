import type { UiTranslator } from "./text";
// Translate only platform-authored status templates. Unknown model output,
// shell output, package names and paths remain unchanged.
export function translateProgress(value: string, ui: UiTranslator): string {
  // Older chat records stored this SDK tool ID as a humanized label.
  if (/^report[ _]intent$/i.test(value)) return ui("Planning");
  const direct = ui(value);
  if (direct !== value) return direct;
  const resolving = /^Resolving (.+)… \((\d+) packages\)$/.exec(value);
  if (resolving)
    return ui("Resolving {package}… ({count} packages)", {
      package: resolving[1],
      count: Number(resolving[2]),
    });
  const installed = /^Installed (\d+) packages$/.exec(value);
  if (installed)
    return ui("Installed {count} packages", { count: Number(installed[1]) });
  const timed =
    /^(Installing packages…|Downloading and linking packages…|Dependencies installed|Loading preview…|Downloading packages…|Installing dependencies…|Linking packages…|Almost there…) \((\d+)s\)$/.exec(
      value,
    );
  if (timed)
    return ui(timed[1] + " ({seconds}s)", { seconds: Number(timed[2]) });
  // Only known platform action templates; keep filenames, code and raw logs intact.
  const action =
    /^(Reading|Creating|Updating|Removing|Renaming|Installing|Editing|Writing|Overwriting|Deleting) (.+)$/.exec(
      value,
    );
  if (action) return ui(action[1] + " {target}", { target: action[2] });
  const mcp =
    /^(?:mcp[ _])?doable[ _]per[ _]app[ _]database[ _]data[ _](query|schema|migrate|exec)$/i.exec(
      value,
    );
  if (mcp)
    return ui(
      (
        {
          query: "Query",
          schema: "Data Schema",
          migrate: "Data Migrate",
          exec: "Running command",
        } as Record<string, string>
      )[mcp[1]!.toLowerCase()] ?? value,
    );
  const operation =
    /^(Running:|Refining|Reviewing|Searching for|Cleaning up|Running) (.+)$/.exec(
      value,
    );
  if (operation)
    return ui(operation[1] + " {target}", { target: operation[2] });
  const building =
    /^Building your (page|component|UI element|feature|utility|styles|layout|configuration|documentation|file) — (.+)$/.exec(
      value,
    );
  if (building)
    return ui("Building your {context} — {target}", {
      context: ui(building[1]),
      target: building[2],
    });
  const adding = /^Adding (.+) to your toolkit$/.exec(value);
  if (adding)
    return ui("Adding {target} to your toolkit", { target: adding[1] });
  return value;
}

// Render only exact platform-generated prompt envelopes in the selected locale.
// Their payload and the original persisted conversation stay untouched.
export function translatePlatformPrompt(
  value: string,
  ui: UiTranslator,
): string {
  const plan =
    /^(?:Start building! Here's the approved plan:|开始构建！以下是已确认的计划：)\n\n\*\*([\s\S]*?)\*\*\n\n([\s\S]*?)\n\n(?:Build each step in order\. The full plan details are in \.doable\/plan\.md\.|请依次完成各步骤。完整计划见 \.doable\/plan\.md。)$/.exec(
      value,
    );
  if (plan)
    return ui(
      "Start building! Here's the approved plan:\n\n**{summary}**\n\n{steps}\n\nBuild each step in order. The full plan details are in .doable/plan.md.",
      { summary: plan[1], steps: plan[2] },
    );
  const answers =
    /^(?:Here are my answers to your questions:|以下是我的回答：)\n\n([\s\S]+)$/.exec(
      value,
    );
  if (answers)
    return ui("Here are my answers to your questions:\n\n{answers}", {
      answers: answers[1],
    });
  const shortAnswers =
    /^(?:Here are my answers:|以下是我的回答：)\n([\s\S]+)$/.exec(value);
  if (shortAnswers)
    return ui("Here are my answers:\n{answers}", { answers: shortAnswers[1] });
  return value;
}

// Localize only the startup prefix injected by the platform, never model prose.
export function translateThinkingPrefix(
  value: string,
  ui: UiTranslator,
): string {
  let remaining = value,
    prefix = "";
  const pattern =
    /^(\s*)(Preparing workspace\.\.\.|Connecting to AI model\.\.\.)(?=\s|$)/;
  for (;;) {
    const match = pattern.exec(remaining);
    if (!match) break;
    prefix += (match[1] ?? "") + ui(match[2] ?? "");
    remaining = remaining.slice(match[0]!.length);
  }
  return prefix + remaining;
}
