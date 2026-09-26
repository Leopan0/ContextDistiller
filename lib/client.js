/* context-distiller client bundle — built 2026-09-26T04:51:24.218Z */
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
var inject = [];
var NS_ID = "context-distiller";
var TXT = {
  zh: {
    title: "\u4E0A\u4E0B\u6587\u538B\u7F29",
    summary: "\u4E3A\u4E0A\u4E0B\u6587\u538B\u7F29\u4F7F\u7528\u72EC\u7ACB\u6A21\u578B\u3001\u8FC7\u6EE4\u70B9\u8E29\u56DE\u7B54\u3001\u8BBE\u7F6E\u7EDD\u5BF9\u89E6\u53D1\u9608\u503C\u3002",
    loading: "\u52A0\u8F7D\u914D\u7F6E\u4E2D...",
    unavailable: "\u5F53\u524D\u8FDE\u63A5\u4E0D\u652F\u6301\u5199\u5165\u914D\u7F6E\uFF08\u8FDB\u7A0B\u672C\u5730\u6A21\u5F0F\uFF09\u3002",
    sectionCompact: "\u72EC\u7ACB\u6A21\u578B\u8DEF\u7531",
    sectionFilter: "\u538B\u7F29\u8FC7\u6EE4",
    sectionThreshold: "\u538B\u7F29\u9608\u503C",
    sectionEngine: "\u663E\u5F0F\u538B\u7F29\u5F15\u64CE\uFF08\u4E0E\u5185\u7F6E\u538B\u7F29\u540E\u7AEF\u4E92\u65A5\uFF09",
    enabled: "\u542F\u7528",
    provider: "\u63D0\u4F9B\u5546",
    model: "\u6A21\u578B",
    flaggedTurns: "\u8FC7\u6EE4\u88AB\u70B9\u8E29\u56DE\u7B54\u6240\u5728\u7684\u8F6E\u6B21",
    wan: "\u89E6\u53D1\u9608\u503C\uFF08\u4E07 token\uFF0C0 \u8DDF\u968F\u9ED8\u8BA4\uFF09",
    thresholdRatio: "\u89E6\u53D1\u6BD4\u4F8B\uFF080.01-0.99\uFF09",
    retainRatio: "\u4FDD\u7559\u6BD4\u4F8B\uFF080.01-0.99\uFF09",
    headroomTokens: "\u538B\u529B\u4F59\u91CF\uFF08token\uFF09",
    maxTokens: "\u5355\u6B21\u538B\u7F29\u8F93\u51FA\u4E0A\u9650\uFF08token\uFF09",
    compactionRetries: "\u538B\u7F29\u91CD\u8BD5\u6B21\u6570",
    maxOverflowRetries: "\u6EA2\u51FA\u91CD\u8BD5\u6B21\u6570",
    auto: "\u6309\u538B\u529B\u81EA\u52A8\u538B\u7F29",
    compressPrompt: "\u538B\u7F29\u6307\u4EE4\uFF08\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\uFF09",
    save: "\u4FDD\u5B58",
    saving: "\u4FDD\u5B58\u4E2D...",
    discard: "\u653E\u5F03\u4FEE\u6539",
    saved: "\u5DF2\u4FDD\u5B58\uFF0C\u4FEE\u6539\u968F Profile \u6301\u4E45\u751F\u6548\u3002",
    saveFail: "\u4FDD\u5B58\u5931\u8D25\uFF1A",
    routeNeedsModel: "\u542F\u7528\u72EC\u7ACB\u6A21\u578B\u8DEF\u7531\u65F6\u5FC5\u987B\u540C\u65F6\u586B\u5199\u63D0\u4F9B\u5546\u548C\u6A21\u578B\u3002",
    invalidNumber: "\u6570\u503C\u4E0D\u5408\u6CD5\uFF1A"
  },
  en: {
    title: "Context Distiller",
    summary: "Route compaction to a dedicated model, filter thumbs-downed turns, set an absolute trigger threshold.",
    loading: "Loading configuration...",
    unavailable: "This connection cannot write configuration (process-local mode).",
    sectionCompact: "Dedicated-model route",
    sectionFilter: "Compaction filter",
    sectionThreshold: "Compaction threshold",
    sectionEngine: "Explicit compression engine (exclusive with the stock backend)",
    enabled: "Enabled",
    provider: "Provider",
    model: "Model",
    flaggedTurns: "Filter turns containing thumbs-downed answers",
    wan: "Trigger threshold (10k tokens, 0 = default policy)",
    thresholdRatio: "Threshold ratio (0.01-0.99)",
    retainRatio: "Retain ratio (0.01-0.99)",
    headroomTokens: "Pressure headroom (tokens)",
    maxTokens: "Max tokens per compression",
    compactionRetries: "Compaction retries",
    maxOverflowRetries: "Overflow retries",
    auto: "Compact automatically on pressure",
    compressPrompt: "Compression instruction (blank = default)",
    save: "Save",
    saving: "Saving...",
    discard: "Discard changes",
    saved: "Saved. Changes persist through the profile.",
    saveFail: "Save failed: ",
    routeNeedsModel: "Enabling the dedicated route requires both provider and model.",
    invalidNumber: "Invalid number: "
  }
};
var FIELDS = [
  { section: "compact", field: "enabled", kind: "bool" },
  { section: "compact", field: "provider", kind: "text" },
  { section: "compact", field: "model", kind: "text" },
  { section: "filter", field: "flaggedTurns", kind: "bool" },
  { section: "threshold", field: "wan", kind: "number", min: 0, max: 100, integer: true },
  { section: "engine", field: "enabled", kind: "bool" },
  { section: "engine", field: "thresholdRatio", kind: "number", min: 0.01, max: 0.99 },
  { section: "engine", field: "retainRatio", kind: "number", min: 0.01, max: 0.99 },
  { section: "engine", field: "headroomTokens", kind: "number", min: 0, integer: true },
  { section: "engine", field: "maxTokens", kind: "number", min: 1, integer: true },
  { section: "engine", field: "compactionRetries", kind: "number", min: 0, integer: true },
  { section: "engine", field: "maxOverflowRetries", kind: "number", min: 0, integer: true },
  { section: "engine", field: "auto", kind: "bool" },
  { section: "engine", field: "compressPrompt", kind: "text", area: true }
];
var SECTION_TITLES = [
  ["compact", "sectionCompact"],
  ["filter", "sectionFilter"],
  ["threshold", "sectionThreshold"],
  ["engine", "sectionEngine"]
];
var inputStyle = {
  padding: "4px 8px",
  fontSize: "13px",
  border: "1px solid var(--dsh-border, #ccc)",
  borderRadius: "4px",
  background: "var(--dsh-bg, #fff)",
  color: "var(--dsh-text, #333)"
};
function ConfigCard(props) {
  const { t, form, view } = props;
  const snapshot = (0, import_react.useSyncExternalStore)(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot()
  );
  const value = snapshot.value ?? {};
  const [drafts, setDrafts] = (0, import_react.useState)({});
  const [dirty, setDirty] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [msg, setMsg] = (0, import_react.useState)(null);
  (0, import_react.useEffect)(() => {
    if (!dirty) setDrafts({});
  }, [snapshot.value, dirty]);
  const read = (section, field) => {
    const key = `${section}.${field}`;
    if (key in drafts) return drafts[key];
    const sectionValue = value[section];
    return sectionValue === void 0 || sectionValue === null ? void 0 : sectionValue[field];
  };
  const stage = (section, field, next) => {
    setDirty(true);
    setDrafts((prev) => ({ ...prev, [`${section}.${field}`]: next }));
  };
  const invalid = [];
  for (const f of FIELDS) {
    if (f.kind !== "number") continue;
    const raw = read(f.section, f.field);
    if (raw === void 0 || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || f.min !== void 0 && n < f.min || f.max !== void 0 && n > f.max || f.integer === true && !Number.isInteger(n)) {
      invalid.push(t(f.field === "wan" ? "wan" : f.field));
    }
  }
  const provider = String(read("compact", "provider") ?? "").trim();
  const model = String(read("compact", "model") ?? "").trim();
  const routeIncomplete = read("compact", "enabled") === true && (provider === "" || model === "");
  const save = async () => {
    if (routeIncomplete) {
      setMsg({ ok: false, text: t("routeNeedsModel") });
      return;
    }
    if (invalid.length > 0) {
      setMsg({ ok: false, text: t("invalidNumber") + invalid.join(", ") });
      return;
    }
    const ops = FIELDS.flatMap((f) => {
      const key = `${f.section}.${f.field}`;
      if (!(key in drafts)) return [];
      const next = drafts[key];
      if (f.kind === "number" && (next === "" || next === void 0)) {
        return [{ op: "unset", path: [f.section, f.field] }];
      }
      const value2 = f.kind === "number" ? Number(next) : next;
      return [{ op: "set", path: [f.section, f.field], value: value2 }];
    });
    setBusy(true);
    setMsg(null);
    try {
      const accepted = await form.mutate(ops, snapshot.revision);
      setMsg({ ok: accepted, text: accepted ? t("saved") : `${t("saveFail")}rejected` });
      if (accepted) {
        setDrafts({});
        setDirty(false);
      }
    } catch (error) {
      setMsg({ ok: false, text: t("saveFail") + error.message });
    } finally {
      setBusy(false);
    }
  };
  if (view === "summary") return import_react.default.createElement(import_react.default.Fragment, null, t("summary"));
  if (snapshot.status === "loading") return import_react.default.createElement("div", null, t("loading"));
  if (snapshot.status === "unavailable") return import_react.default.createElement("div", null, t("unavailable"));
  const fieldNode = (f) => {
    const key = `${f.section}.${f.field}`;
    const current = read(f.section, f.field);
    const label = t(f.field);
    if (f.kind === "bool") {
      return import_react.default.createElement(
        "label",
        {
          key,
          style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", marginBottom: "6px" }
        },
        import_react.default.createElement("input", {
          type: "checkbox",
          checked: current === true,
          disabled: !snapshot.writable,
          onChange: (e) => stage(f.section, f.field, e.target.checked)
        }),
        label
      );
    }
    const input = f.area === true ? import_react.default.createElement("textarea", {
      style: { ...inputStyle, width: "320px", minHeight: "72px", fontFamily: "monospace" },
      value: String(current ?? ""),
      disabled: !snapshot.writable,
      onChange: (e) => stage(f.section, f.field, e.target.value)
    }) : import_react.default.createElement("input", {
      style: { ...inputStyle, width: "180px" },
      type: f.kind === "number" ? "number" : "text",
      min: f.min,
      max: f.max,
      step: f.integer === true ? 1 : "any",
      value: String(current ?? ""),
      disabled: !snapshot.writable,
      onChange: (e) => stage(f.section, f.field, e.target.value)
    });
    return import_react.default.createElement(
      "label",
      {
        key,
        style: {
          display: "flex",
          alignItems: f.area === true ? "flex-start" : "center",
          gap: "8px",
          fontSize: "13px",
          marginBottom: "6px"
        }
      },
      import_react.default.createElement("span", { style: { minWidth: "180px" } }, label),
      input
    );
  };
  const sectionNodes = SECTION_TITLES.map(([section, titleKey]) => import_react.default.createElement(
    "div",
    { key: section, style: { marginBottom: "14px" } },
    import_react.default.createElement("h4", {
      style: { margin: "0 0 8px", fontSize: "13px", fontWeight: 600, color: "var(--dsh-text-sec, #666)" }
    }, t(titleKey)),
    FIELDS.filter((f) => f.section === section).map(fieldNode)
  ));
  const children = [import_react.default.createElement("div", { key: "sections" }, sectionNodes)];
  children.push(import_react.default.createElement(
    "div",
    {
      key: "actions",
      style: { display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }
    },
    import_react.default.createElement("button", {
      style: {
        padding: "5px 18px",
        fontSize: "13px",
        cursor: "pointer",
        border: "none",
        borderRadius: "4px",
        background: "var(--dsh-accent, #4f46e5)",
        color: "#fff"
      },
      disabled: busy || !snapshot.writable,
      onClick: () => {
        void save();
      }
    }, busy ? t("saving") : t("save")),
    dirty ? import_react.default.createElement("button", {
      style: {
        padding: "5px 14px",
        fontSize: "13px",
        cursor: "pointer",
        border: "1px solid var(--dsh-border, #ccc)",
        borderRadius: "4px",
        background: "transparent",
        color: "var(--dsh-text, #333)"
      },
      disabled: busy,
      onClick: () => {
        setDrafts({});
        setDirty(false);
        setMsg(null);
      }
    }, t("discard")) : null,
    msg ? import_react.default.createElement("span", {
      style: { fontSize: "12px", color: msg.ok ? "var(--dsh-ok, #16a34a)" : "var(--dsh-err, #dc2626)" }
    }, msg.text) : null
  ));
  return import_react.default.createElement("div", { style: { padding: "4px 0", fontFamily: "system-ui, -apple-system, sans-serif" } }, children);
}
function apply(ctx) {
  const win = window;
  const probe = (stage) => {
    try {
      void fetch("/context-distiller/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stage,
          hasConfigForms: ctx.configForms !== void 0 && ctx.configForms !== null,
          whileServedType: typeof ctx.configForms?.whileServed,
          slotsType: typeof ctx.slots,
          cardRegistered: win.__cdCardRegistered === true
        })
      }).catch(() => {
      });
    } catch {
    }
  };
  probe("apply");
  setTimeout(() => probe("late-3s"), 3e3);
  setTimeout(() => probe("late-10s"), 1e4);
  try {
    const form = ctx.configForms.get(NS_ID);
    const locale = ctx.locale;
    let t = (key) => TXT.en[key] ?? key;
    if (locale && typeof locale.register === "function" && typeof locale.bind === "function") {
      locale.register(NS_ID, TXT);
      t = locale.bind(NS_ID);
    }
    const register = () => {
      win.__cdCardRegistered = true;
      probe("registered");
      ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
        name: "plugins.bundle.config",
        key: NS_ID,
        inject: () => ({ t, form })
      }, (props) => import_react.default.createElement(ConfigCard, { ...props, t, form })));
    };
    if (ctx.configForms && typeof ctx.configForms.whileServed === "function") {
      const dispose = ctx.configForms.whileServed([NS_ID], register);
      if (typeof ctx.effect === "function") ctx.effect(() => dispose, "context-distiller: plugins-page card");
    } else {
      register();
    }
  } catch (error) {
    console.error("[context-distiller] plugins-page config card registration failed", error);
  }
}

  return module.exports;
} });
