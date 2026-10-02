import React from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { Users } from "lucide-react";
import { OverviewCard } from "./panels/analytics-charts";
import { InlineCreateForm } from "../skills/skills-panel-components";
import zh from "../../../messages/zh-CN.json";
import en from "../../../messages/en.json";
test("metric semantics are independent of translated labels", () => {
  for (const label of ["Bounce Rate", "跳出率"]) {
    const bad = renderToStaticMarkup(
      <OverviewCard
        label={label}
        lowerIsBetter
        value="40%"
        change={10}
        icon={Users}
      />,
    );
    const good = renderToStaticMarkup(
      <OverviewCard
        label={label}
        lowerIsBetter
        value="20%"
        change={-10}
        icon={Users}
      />,
    );
    assert.match(bad, /text-red-400/);
    assert.match(good, /text-emerald-500/);
  }
});
test("both locales retain skill description and auto-invoke controls; rules do not", () => {
  for (const [locale, messages, label] of [
    ["en", en, "Skill"],
    ["zh-CN", zh, "技能"],
  ] as const) {
    const render = (kind: "skill" | "rule") =>
      renderToStaticMarkup(
        <NextIntlClientProvider
          locale={locale}
          messages={messages}
          timeZone="UTC"
        >
          <InlineCreateForm
            kind={kind}
            label={label}
            placeholder="test"
            onSubmit={() => {}}
            onCancel={() => {}}
          />
        </NextIntlClientProvider>,
      );
    assert.match(render("skill"), /type="checkbox"/);
    assert.doesNotMatch(render("rule"), /type="checkbox"/);
  }
});
