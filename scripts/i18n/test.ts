import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUiTranslator,
  translateUiData,
} from "../../apps/web/src/i18n/text";
import { normalizeLocale } from "../../apps/web/src/i18n/config";
import source from "../../apps/web/messages/source.json";
import en from "../../apps/web/messages/en.json";
import zh from "../../apps/web/messages/zh-CN.json";
import index from "../../apps/web/messages/index.json";

test("first visit and invalid preferences preserve the upstream English default", () => {
  for (const value of [undefined, null, "", "en", "ja", "../../en", "EN"])
    assert.equal(normalizeLocale(value), "en");
  assert.equal(normalizeLocale("zh-CN"), "zh-CN");
});
test("catalogs have identical source keys and nonempty messages", () => {
  const keys = Object.keys(source).sort();
  assert.deepEqual(Object.keys(en.ui).sort(), keys);
  assert.deepEqual(Object.keys(zh.ui).sort(), keys);
  for (const [key, record] of Object.entries(source)) {
    assert.equal(index[record.source as keyof typeof index], key);
    assert.ok((zh.ui as Record<string, string>)[key]?.trim(), key);
    assert.ok((en.ui as Record<string, string>)[key]?.trim(), key);
  }
});
test("only static UI metadata changes; IDs, URLs, enums, user data and callbacks survive", () => {
  const ui = createUiTranslator(() => "已翻译");
  const callback = () => true;
  const data = {
    label: "Preview",
    desc: "Preview",
    id: "Preview",
    value: "Preview",
    url: "https://example.com/Preview",
    onClick: callback,
    nested: [{ title: "Settings", model: "gpt-5.5" }],
  };
  const output = translateUiData(data, ui);
  assert.equal(output.desc, "已翻译");
  assert.equal(output.label, "已翻译");
  assert.equal(output.nested[0].title, "已翻译");
  assert.equal(output.id, data.id);
  assert.equal(output.value, data.value);
  assert.equal(output.url, data.url);
  assert.equal(output.onClick, callback);
  assert.equal(output.nested[0].model, "gpt-5.5");
  assert.equal(data.label, "Preview");
  assert.equal(
    ui("customer entered a unique application name"),
    "customer entered a unique application name",
  );
  assert.equal(ui(42), 42);
  assert.equal(ui(null), null);
});
test("request translators are independent and preserve interpolation values", () => {
  const a = createUiTranslator(() => "预览", "zh-CN");
  const b = createUiTranslator(() => "Preview", "en");
  assert.equal(a("Preview"), "预览");
  assert.equal(b("Preview"), "Preview");
  assert.equal(a.locale, "zh-CN");
  let values: unknown;
  const t = createUiTranslator((_key, v) => {
    values = v;
    return "result";
  });
  const message = Object.values(source).find((v) =>
    v.source.includes("{v0}"),
  )!.source;
  assert.equal(t(message, { v0: "<script>alert(1)</script>" }), "result");
  assert.deepEqual(values, { v0: "<script>alert(1)</script>" });
});

test("interpolated translations preserve named variables and compile in both locales", async () => {
  const { createRequire } = await import("node:module");
  const { createTranslator } = createRequire(
    new URL("../../apps/web/package.json", import.meta.url),
  )("next-intl");
  for (const [locale, messages] of [
    ["en", en],
    ["zh-CN", zh],
  ] as const) {
    const errors: Error[] = [];
    const t = createTranslator({
      locale,
      messages,
      namespace: "ui",
      onError: (error: Error) => errors.push(error),
    });
    for (const [key, { source: text, locations }] of Object.entries(source)) {
      if (
        !locations.some(
          (l) => l.kind === "interpolation" || l.kind === "icu",
        ) &&
        !/\{(current|total|count)\}/.test(text)
      )
        continue;
      const names = [
        ...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)(?:[,}])/g),
      ].map((x) => x[1]);
      const target = (messages.ui as Record<string, string>)[key];
      for (const name of new Set(names))
        assert.ok(
          target.includes("{" + name),
          `${locale}:${key} missing ${name}`,
        );
      t(
        key,
        Object.fromEntries(
          names.map((n) => [
            n,
            n === "count" || n === "current" || n === "total" ? 2 : "sample",
          ]),
        ),
      );
    }
    assert.equal(errors.length, 0, errors.map((e) => e.message).join("\n"));
  }
});

test("runtime progress translates known templates and preserves package IDs and raw output", async () => {
  const { translateProgress } =
    await import("../../apps/web/src/i18n/progress");
  const ui = createUiTranslator((key, values) => {
    const message = (zh.ui as Record<string, string>)[key];
    return message.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name]));
  }, "zh-CN");
  assert.equal(
    translateProgress("Resolving @types/react… (12 packages)", ui),
    "正在解析 @types/react…（12 个依赖包）",
  );
  assert.equal(
    translateProgress("Installing packages… (9s)", ui),
    "正在安装依赖包…（9 秒）",
  );
  assert.equal(
    translateProgress("user supplied prose, npm ERR! EACCES", ui),
    "user supplied prose, npm ERR! EACCES",
  );
});

test("build store initializes outside React and keeps canonical phase labels", async () => {
  const { useBuildStore } =
    await import("../../apps/web/src/modules/editor/build/store/build-store");
  useBuildStore.getState().reset("i18n-test");
  assert.equal(useBuildStore.getState().phases[0].label, "Setting up files");
  assert.equal(useBuildStore.getState().status, "idle");
});

test("tool statuses translate without changing file names or command output", async () => {
  const { translateProgress } =
    await import("../../apps/web/src/i18n/progress");
  const ui = createUiTranslator(
    (key, values) =>
      (zh.ui as Record<string, string>)[key].replace(/\{(\w+)\}/g, (_, name) =>
        String(values?.[name]),
      ),
    "zh-CN",
  );
  assert.equal(translateProgress("Reading App.tsx", ui), "正在读取 App.tsx");
  assert.equal(translateProgress("report intent", ui), "正在规划");
  assert.equal(translateProgress("report_intent", ui), "正在规划");
  assert.equal(
    translateProgress("mcp doable per app database data migrate", ui),
    "正在执行数据库迁移",
  );
  assert.equal(translateProgress("$ npm run build", ui), "$ npm run build");
  assert.equal(
    translateProgress("Building your component — UserCard", ui),
    "正在构建组件：UserCard",
  );
  assert.equal(
    translateProgress("Running: npm run build", ui),
    "正在执行：npm run build",
  );
  assert.equal(translateProgress("Reviewing App.tsx", ui), "正在查看 App.tsx");
  assert.equal(
    ui("Applied {count} changes", { count: 77 }),
    "已应用 77 项更改",
  );
});

test("historical platform prompt envelopes follow locale without rewriting their payload", async () => {
  const { translatePlatformPrompt } =
    await import("../../apps/web/src/i18n/progress");
  const translator = (messages: typeof zh, locale: "zh-CN" | "en") =>
    createUiTranslator(
      (key, values) =>
        (messages.ui as Record<string, string>)[key].replace(
          /\{(\w+)\}/g,
          (_, name) => String(values?.[name]),
        ),
      locale,
    );
  const chinese = translator(zh, "zh-CN");
  const english = translator(en, "en");
  const payload = "1. Keep App.tsx and SELECT * FROM employees; unchanged";
  const original =
    "Start building! Here's the approved plan:\n\n**HR 管理**\n\n" +
    payload +
    "\n\nBuild each step in order. The full plan details are in .doable/plan.md.";
  const localized = translatePlatformPrompt(original, chinese);
  assert.ok(localized.startsWith("开始构建！"));
  assert.ok(localized.includes(payload));
  assert.equal(translatePlatformPrompt(localized, english), original);
  const answers = "Here are my answers to your questions:\n\n**Color**: green";
  assert.equal(
    translatePlatformPrompt(answers, chinese),
    "以下是我的回答：\n\n**Color**: green",
  );
  assert.equal(
    translatePlatformPrompt("Here are my answers:\nA: App.tsx", chinese),
    "以下是我的回答：\nA: App.tsx",
  );
  const custom = "Here are my answers without a platform envelope";
  assert.equal(translatePlatformPrompt(custom, chinese), custom);
  assert.equal(
    chinese("Show {count} earlier steps", { count: 7 }),
    "显示前 7 个步骤",
  );
});

test("thinking startup prefix translates without rewriting model prose", async () => {
  const { translateThinkingPrefix } =
    await import("../../apps/web/src/i18n/progress");
  const ui = createUiTranslator(
    (key) => (zh.ui as Record<string, string>)[key],
    "zh-CN",
  );
  const body =
    "Model text and App.tsx remain original.\nPreparing workspace...";
  assert.equal(
    translateThinkingPrefix(
      "Preparing workspace... Connecting to AI model...\n" + body,
      ui,
    ),
    "正在准备工作区… 正在连接 AI 模型…\n" + body,
  );
  assert.equal(translateThinkingPrefix(body, ui), body);
});
