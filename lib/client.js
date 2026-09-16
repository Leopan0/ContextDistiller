/* context-distiller client bundle — built 2026-09-16T04:11:46.089Z */
window.__ModuleLoader__.load({ id: "context-distiller", factory: function (require) {
  var module = { exports: {} };
  var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_react = __toESM(require("react"), 1);
var inject = ["slots", "locale"];
var NS = "context-distiller";
var TXT = {
  zh: {
    title: "\u4E0A\u4E0B\u6587\u538B\u7F29",
    toggle: "\u4E3A\u4E0A\u4E0B\u6587\u538B\u7F29\u4F7F\u7528\u72EC\u7ACB\u6A21\u578B",
    hintOff: "\u538B\u7F29\u4F7F\u7528\u5F53\u524D\u4F1A\u8BDD\u6A21\u578B\u3002\u5F00\u542F\u540E\u53EF\u5C06\u6458\u8981\u8BF7\u6C42\u8DEF\u7531\u5230\u66F4\u4FBF\u5B9C\u6216\u66F4\u5FEB\u7684\u6A21\u578B\u3002",
    provider: "\u6A21\u578B\u63D0\u4F9B\u5546",
    providerHint: "\u5728 DSH \u6A21\u578B\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u7684\u63D0\u4F9B\u5546\u8DEF\u7531\u3002",
    providerPlaceholder: "\u2014 \u9009\u62E9\u63D0\u4F9B\u5546 \u2014",
    model: "\u6A21\u578B",
    modelHint: "\u4EC5\u7528\u4E8E\u4E0A\u4E0B\u6587\u538B\u7F29\u6458\u8981\u7684\u6A21\u578B\u3002",
    modelPlaceholder: "\u2014 \u9009\u62E9\u6A21\u578B \u2014",
    save: "\u4FDD\u5B58",
    saving: "\u4FDD\u5B58\u4E2D...",
    savedOn: "\u5DF2\u4FDD\u5B58\u3002\u538B\u7F29\u8DEF\u7531\u5DF2\u542F\u7528\u3002",
    savedOff: "\u5DF2\u4FDD\u5B58\u3002\u538B\u7F29\u8DEF\u7531\u5DF2\u5173\u95ED\u3002",
    saveFail: "\u4FDD\u5B58\u5931\u8D25\uFF1A",
    selectWarn: "\u8BF7\u5728\u542F\u7528\u524D\u9009\u62E9\u63D0\u4F9B\u5546\u548C\u6A21\u578B\u3002",
    loadFail: "\u52A0\u8F7D\u914D\u7F6E\u5931\u8D25",
    loading: "\u52A0\u8F7D\u4E2D...",
    custom: "\uFF08\u81EA\u5B9A\u4E49\uFF09"
  },
  en: {
    title: "Context Distiller",
    toggle: "Use a different model for compaction",
    hintOff: "Compaction uses your conversation model. Toggle on to route summaries to a cheaper or faster model.",
    provider: "Provider",
    providerHint: "Provider routes configured in DSH Models settings.",
    providerPlaceholder: "\u2014 Select provider \u2014",
    model: "Model",
    modelHint: "Model used only for context compaction summaries.",
    modelPlaceholder: "\u2014 Select model \u2014",
    save: "Save",
    saving: "Saving...",
    savedOn: "Saved. Compaction route active.",
    savedOff: "Saved. Compaction disabled.",
    saveFail: "Save failed: ",
    selectWarn: "Please select a provider and model before enabling.",
    loadFail: "Failed to load config",
    loading: "Loading...",
    custom: " (custom)"
  }
};
var S = {
  wrap: { padding: "16px", fontFamily: "system-ui, -apple-system, sans-serif" },
  title: { margin: "0 0 16px", fontSize: "15px", fontWeight: 600 },
  row: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" },
  label: { fontSize: "13px", minWidth: "80px", color: "var(--dsh-text, #333)" },
  select: {
    flex: 1,
    padding: "6px 8px",
    fontSize: "13px",
    border: "1px solid var(--dsh-border, #ccc)",
    borderRadius: "4px",
    background: "var(--dsh-bg, #fff)",
    color: "var(--dsh-text, #333)"
  },
  toggle: { width: "18px", height: "18px", cursor: "pointer" },
  btn: {
    padding: "6px 18px",
    fontSize: "13px",
    cursor: "pointer",
    border: "none",
    borderRadius: "4px",
    background: "var(--dsh-accent, #4f46e5)",
    color: "#fff"
  },
  hint: { fontSize: "12px", color: "var(--dsh-text-sec, #888)", marginTop: "-8px", marginBottom: "12px" },
  status: { fontSize: "12px", marginTop: "8px" }
};
function SettingsPanel({ t }) {
  const [enabled, setEnabled] = (0, import_react.useState)(false);
  const [provider, setProvider] = (0, import_react.useState)("");
  const [model, setModel] = (0, import_react.useState)("");
  const [providers, setProviders] = (0, import_react.useState)([]);
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [msg, setMsg] = (0, import_react.useState)(null);
  const [loaded, setLoaded] = (0, import_react.useState)(false);
  (0, import_react.useEffect)(() => {
    Promise.all([
      fetch("/context-distiller/config").then((r) => r.json()),
      fetch("/context-distiller/models").then((r) => r.json())
    ]).then(([cfg, list]) => {
      setEnabled(cfg.compact.enabled);
      setProvider(cfg.compact.provider || "");
      setModel(cfg.compact.model || "");
      setProviders(list || []);
      setLoaded(true);
    }).catch(() => {
      setMsg({ ok: false, text: t("loadFail") });
      setLoaded(true);
    });
  }, []);
  const availableModels = providers.find((p) => p.provider === provider)?.models ?? [];
  const save = async () => {
    if (enabled && (!provider || !model)) {
      setMsg({ ok: false, text: t("selectWarn") });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch("/context-distiller/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          compact: {
            enabled,
            provider: enabled ? provider : "",
            model: enabled ? model : ""
          }
        })
      });
      if (r.ok) {
        setMsg({ ok: true, text: enabled ? t("savedOn") : t("savedOff") });
      } else {
        const text = await r.text().catch(() => "");
        setMsg({ ok: false, text: t("saveFail") + (text || r.status) });
      }
    } catch (e) {
      setMsg({ ok: false, text: t("saveFail") + e.message });
    } finally {
      setSaving(false);
    }
  };
  if (!loaded) {
    return import_react.default.createElement("div", { style: S.wrap }, t("loading"));
  }
  return import_react.default.createElement(
    "div",
    { style: S.wrap },
    import_react.default.createElement("h3", { style: S.title }, t("title")),
    // Toggle
    import_react.default.createElement(
      "div",
      { style: S.row },
      import_react.default.createElement(
        "label",
        { style: { ...S.label, display: "flex", alignItems: "center", gap: "6px" } },
        import_react.default.createElement("input", {
          type: "checkbox",
          style: S.toggle,
          checked: enabled,
          onChange: (e) => setEnabled(e.target.checked)
        }),
        t("toggle")
      )
    ),
    !enabled && import_react.default.createElement("div", { style: S.hint }, t("hintOff")),
    // Provider dropdown
    enabled && import_react.default.createElement(
      "div",
      { style: S.row },
      import_react.default.createElement("span", { style: S.label }, t("provider")),
      import_react.default.createElement(
        "select",
        {
          style: S.select,
          value: provider,
          onChange: (e) => {
            const p = e.target.value;
            setProvider(p);
            const entry = providers.find((x) => x.provider === p);
            if (entry?.models.length) setModel(entry.models[0].id);
          }
        },
        import_react.default.createElement("option", { value: "" }, t("providerPlaceholder")),
        ...providers.map(
          (p) => import_react.default.createElement("option", { key: p.provider, value: p.provider }, p.name || p.provider)
        )
      )
    ),
    enabled && import_react.default.createElement("div", { style: S.hint }, t("providerHint")),
    // Model dropdown
    enabled && import_react.default.createElement(
      "div",
      { style: S.row },
      import_react.default.createElement("span", { style: S.label }, t("model")),
      import_react.default.createElement(
        "select",
        {
          style: S.select,
          value: model,
          onChange: (e) => setModel(e.target.value)
        },
        import_react.default.createElement("option", { value: "" }, t("modelPlaceholder")),
        ...availableModels.length > 0 ? availableModels.map(
          (m) => import_react.default.createElement("option", { key: m.id, value: m.id }, m.name || m.id)
        ) : model ? [import_react.default.createElement("option", { key: model, value: model }, model + t("custom"))] : []
      )
    ),
    enabled && import_react.default.createElement("div", { style: S.hint }, t("modelHint")),
    // Save
    import_react.default.createElement(
      "button",
      {
        style: S.btn,
        onClick: save,
        disabled: saving || enabled && (!provider || !model)
      },
      saving ? t("saving") : t("save")
    ),
    msg && import_react.default.createElement("div", {
      style: { ...S.status, color: msg.ok ? "var(--dsh-ok, #16a34a)" : "var(--dsh-err, #dc2626)" }
    }, msg.text)
  );
}
function apply(ctx) {
  try {
    if (ctx.locale && typeof ctx.locale.register === "function") {
      ctx.locale.register(NS, TXT);
    }
    const t = ctx.locale && typeof ctx.locale.bind === "function" ? ctx.locale.bind(NS) : (key) => TXT.en[key] ?? key;
    if (!ctx.slots || typeof ctx.slots.inject !== "function") {
      console.warn("[context-distiller] slots service unavailable; settings panel not registered");
      return;
    }
    ctx.slots.inject("settings.section", () => {
      return ctx.slots.register({
        name: "settings.section",
        id: "context-distiller",
        order: 50,
        label: () => t("title"),
        inject: () => ({ t })
      }, SettingsPanel);
    });
  } catch (e) {
    console.error("[context-distiller] settings panel registration failed", e);
  }
}

  return module.exports;
} });
