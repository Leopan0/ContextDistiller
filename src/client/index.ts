/**
 * context-distiller client half — the plugin's configuration card on the
 * Plugins management page.
 *
 * Since DSH 0.1.7 the Plugins page renders an installed bundle's configuration
 * from the `plugins.bundle.config` slot, keyed by the bundle's package name.
 * This card binds the Host settings namespace `context-distiller` through the
 * shared `configForms` service: values read live from the namespace snapshot,
 * edits staged locally, and a save issues one revision-fenced `mutate` that
 * the Host validates and persists through the active profile's patch. The
 * legacy browser-side settings panel and its `POST /config` runtime override
 * were removed in 0.2.0 — this page is the single configuration surface.
 *
 * React / react-dom stay external (platform-provided); no other client
 * packages are imported, so the bundle carries no host values. The file stays
 * `.ts` with `React.createElement` calls: the build pipeline (and the
 * packaging gate) treat this entry as plain TypeScript.
 *
 * @module context-distiller/client
 */
import React, { useState, useEffect, useSyncExternalStore } from 'react';

/** Client services: the shared configuration-forms facade over Host settings. */
export const inject = [];

/** Settings namespace = this bundle's profile entry id. */
const NS_ID = 'context-distiller';

/** Bilingual card copy; bound through ctx.locale when available. */
const TXT = {
  zh: {
    title: '上下文压缩',
    summary: '为上下文压缩使用独立模型、过滤点踩回答、设置绝对触发阈值。',
    loading: '加载配置中...',
    unavailable: '当前连接不支持写入配置（进程本地模式）。',
    sectionCompact: '独立模型路由',
    sectionFilter: '压缩过滤',
    sectionThreshold: '压缩阈值',
    sectionEngine: '显式压缩引擎（与内置压缩后端互斥）',
    enabled: '启用',
    provider: '提供商',
    model: '模型',
    flaggedTurns: '过滤被点踩回答所在的轮次',
    wan: '触发阈值（万 token，0 跟随默认）',
    thresholdRatio: '触发比例（0.01-0.99）',
    retainRatio: '保留比例（0.01-0.99）',
    headroomTokens: '压力余量（token）',
    maxTokens: '单次压缩输出上限（token）',
    compactionRetries: '压缩重试次数',
    maxOverflowRetries: '溢出重试次数',
    auto: '按压力自动压缩',
    compressPrompt: '压缩指令（留空使用默认）',
    save: '保存',
    saving: '保存中...',
    discard: '放弃修改',
    saved: '已保存，修改随 Profile 持久生效。',
    saveFail: '保存失败：',
    routeNeedsModel: '启用独立模型路由时必须同时填写提供商和模型。',
    invalidNumber: '数值不合法：',
  },
  en: {
    title: 'Context Distiller',
    summary: 'Route compaction to a dedicated model, filter thumbs-downed turns, set an absolute trigger threshold.',
    loading: 'Loading configuration...',
    unavailable: 'This connection cannot write configuration (process-local mode).',
    sectionCompact: 'Dedicated-model route',
    sectionFilter: 'Compaction filter',
    sectionThreshold: 'Compaction threshold',
    sectionEngine: 'Explicit compression engine (exclusive with the stock backend)',
    enabled: 'Enabled',
    provider: 'Provider',
    model: 'Model',
    flaggedTurns: 'Filter turns containing thumbs-downed answers',
    wan: 'Trigger threshold (10k tokens, 0 = default policy)',
    thresholdRatio: 'Threshold ratio (0.01-0.99)',
    retainRatio: 'Retain ratio (0.01-0.99)',
    headroomTokens: 'Pressure headroom (tokens)',
    maxTokens: 'Max tokens per compression',
    compactionRetries: 'Compaction retries',
    maxOverflowRetries: 'Overflow retries',
    auto: 'Compact automatically on pressure',
    compressPrompt: 'Compression instruction (blank = default)',
    save: 'Save',
    saving: 'Saving...',
    discard: 'Discard changes',
    saved: 'Saved. Changes persist through the profile.',
    saveFail: 'Save failed: ',
    routeNeedsModel: 'Enabling the dedicated route requires both provider and model.',
    invalidNumber: 'Invalid number: ',
  },
};

/** One renderable field, mirroring the plugin's volatile config schema. */
interface FieldSpec {
  section: string;
  field: string;
  kind: 'bool' | 'text' | 'number';
  min?: number;
  max?: number;
  integer?: boolean;
  area?: boolean;
}

const FIELDS: FieldSpec[] = [
  { section: 'compact', field: 'enabled', kind: 'bool' },
  { section: 'compact', field: 'provider', kind: 'text' },
  { section: 'compact', field: 'model', kind: 'text' },
  { section: 'filter', field: 'flaggedTurns', kind: 'bool' },
  { section: 'threshold', field: 'wan', kind: 'number', min: 0, max: 100, integer: true },
  { section: 'engine', field: 'enabled', kind: 'bool' },
  { section: 'engine', field: 'thresholdRatio', kind: 'number', min: 0.01, max: 0.99 },
  { section: 'engine', field: 'retainRatio', kind: 'number', min: 0.01, max: 0.99 },
  { section: 'engine', field: 'headroomTokens', kind: 'number', min: 0, integer: true },
  { section: 'engine', field: 'maxTokens', kind: 'number', min: 1, integer: true },
  { section: 'engine', field: 'compactionRetries', kind: 'number', min: 0, integer: true },
  { section: 'engine', field: 'maxOverflowRetries', kind: 'number', min: 0, integer: true },
  { section: 'engine', field: 'auto', kind: 'bool' },
  { section: 'engine', field: 'compressPrompt', kind: 'text', area: true },
];

const SECTION_TITLES: Array<[string, string]> = [
  ['compact', 'sectionCompact'],
  ['filter', 'sectionFilter'],
  ['threshold', 'sectionThreshold'],
  ['engine', 'sectionEngine'],
];

const inputStyle: React.CSSProperties = {
  padding: '4px 8px', fontSize: '13px', border: '1px solid var(--dsh-border, #ccc)',
  borderRadius: '4px', background: 'var(--dsh-bg, #fff)', color: 'var(--dsh-text, #333)',
};

interface CardProps {
  view?: string;
  t: (key: string) => string;
  form: {
    getSnapshot(): any;
    subscribe(listener: () => void): () => void;
    mutate(ops: readonly any[], expectedRevision?: number): Promise<boolean>;
  };
}

/** The configuration card: summary line in list views, the staged form on the detail page. */
function ConfigCard(props: CardProps) {
  const { t, form, view } = props;
  const snapshot: any = useSyncExternalStore(
    (listener: () => void) => form.subscribe(listener),
    () => form.getSnapshot()
  );
  const value: any = snapshot.value ?? {};
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Re-stage whenever the Host accepts a new section, unless the user has
  // unsaved edits (their draft wins until saved or discarded).
  useEffect(() => {
    if (!dirty) setDrafts({});
  }, [snapshot.value, dirty]);

  const read = (section: string, field: string): unknown => {
    const key = `${section}.${field}`;
    if (key in drafts) return drafts[key];
    const sectionValue = value[section];
    return sectionValue === undefined || sectionValue === null ? undefined : sectionValue[field];
  };
  const stage = (section: string, field: string, next: unknown): void => {
    setDirty(true);
    setDrafts((prev) => ({ ...prev, [`${section}.${field}`]: next }));
  };

  const invalid: string[] = [];
  for (const f of FIELDS) {
    if (f.kind !== 'number') continue;
    const raw = read(f.section, f.field);
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)
      || (f.integer === true && !Number.isInteger(n))) {
      invalid.push(t(f.field === 'wan' ? 'wan' : f.field));
    }
  }
  const provider = String(read('compact', 'provider') ?? '').trim();
  const model = String(read('compact', 'model') ?? '').trim();
  const routeIncomplete = read('compact', 'enabled') === true && (provider === '' || model === '');

  const save = async (): Promise<void> => {
    if (routeIncomplete) {
      setMsg({ ok: false, text: t('routeNeedsModel') });
      return;
    }
    if (invalid.length > 0) {
      setMsg({ ok: false, text: t('invalidNumber') + invalid.join(', ') });
      return;
    }
    const ops = FIELDS.flatMap((f) => {
      const key = `${f.section}.${f.field}`;
      if (!(key in drafts)) return [];
      const next: unknown = drafts[key];
      if (f.kind === 'number' && (next === '' || next === undefined)) {
        return [{ op: 'unset', path: [f.section, f.field] }];
      }
      const value2 = f.kind === 'number' ? Number(next) : next;
      return [{ op: 'set', path: [f.section, f.field], value: value2 }];
    });
    setBusy(true);
    setMsg(null);
    try {
      const accepted = await form.mutate(ops, snapshot.revision);
      setMsg({ ok: accepted, text: accepted ? t('saved') : `${t('saveFail')}rejected` });
      if (accepted) {
        setDrafts({});
        setDirty(false);
      }
    } catch (error) {
      setMsg({ ok: false, text: t('saveFail') + (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (view === 'summary') return React.createElement(React.Fragment, null, t('summary'));
  if (snapshot.status === 'loading') return React.createElement('div', null, t('loading'));
  if (snapshot.status === 'unavailable') return React.createElement('div', null, t('unavailable'));

  const fieldNode = (f: FieldSpec): any => {
    const key = `${f.section}.${f.field}`;
    const current = read(f.section, f.field);
    const label = t(f.field);
    if (f.kind === 'bool') {
      return React.createElement('label', {
        key,
        style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', marginBottom: '6px' },
      },
        React.createElement('input', {
          type: 'checkbox',
          checked: current === true,
          disabled: !snapshot.writable,
          onChange: (e: any) => stage(f.section, f.field, e.target.checked),
        }),
        label);
    }
    const input = f.area === true
      ? React.createElement('textarea', {
        style: { ...inputStyle, width: '320px', minHeight: '72px', fontFamily: 'monospace' },
        value: String(current ?? ''),
        disabled: !snapshot.writable,
        onChange: (e: any) => stage(f.section, f.field, e.target.value),
      })
      : React.createElement('input', {
        style: { ...inputStyle, width: '180px' },
        type: f.kind === 'number' ? 'number' : 'text',
        min: f.min,
        max: f.max,
        step: f.integer === true ? 1 : 'any',
        value: String(current ?? ''),
        disabled: !snapshot.writable,
        onChange: (e: any) => stage(f.section, f.field, e.target.value),
      });
    return React.createElement('label', {
      key,
      style: {
        display: 'flex', alignItems: f.area === true ? 'flex-start' : 'center',
        gap: '8px', fontSize: '13px', marginBottom: '6px',
      },
    },
      React.createElement('span', { style: { minWidth: '180px' } }, label),
      input);
  };

  const sectionNodes = SECTION_TITLES.map(([section, titleKey]) =>
    React.createElement('div', { key: section, style: { marginBottom: '14px' } },
      React.createElement('h4', {
        style: { margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: 'var(--dsh-text-sec, #666)' },
      }, t(titleKey)),
      FIELDS.filter((f) => f.section === section).map(fieldNode)));

  const children: any[] = [React.createElement('div', { key: 'sections' }, sectionNodes)];
  children.push(React.createElement('div', {
    key: 'actions',
    style: { display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' },
  },
    React.createElement('button', {
      style: {
        padding: '5px 18px', fontSize: '13px', cursor: 'pointer', border: 'none', borderRadius: '4px',
        background: 'var(--dsh-accent, #4f46e5)', color: '#fff',
      },
      disabled: busy || !snapshot.writable,
      onClick: () => { void save(); },
    }, busy ? t('saving') : t('save')),
    dirty ? React.createElement('button', {
      style: {
        padding: '5px 14px', fontSize: '13px', cursor: 'pointer',
        border: '1px solid var(--dsh-border, #ccc)', borderRadius: '4px', background: 'transparent',
        color: 'var(--dsh-text, #333)',
      },
      disabled: busy,
      onClick: () => { setDrafts({}); setDirty(false); setMsg(null); },
    }, t('discard')) : null,
    msg ? React.createElement('span', {
      style: { fontSize: '12px', color: msg.ok ? 'var(--dsh-ok, #16a34a)' : 'var(--dsh-err, #dc2626)' },
    }, msg.text) : null));

  return React.createElement('div', { style: { padding: '4px 0', fontFamily: 'system-ui, -apple-system, sans-serif' } }, children);
}

/** Client half entry: bind the card to the Plugins page while the Host serves our namespace. */
export function apply(ctx: Record<string, any>): void {
  // Diagnostics: report the client's load state to the plugin's own probe
  // route, so `/context-distiller/health` shows whether (and how far) the
  // plugins-page card bound. Never throws into the host boot.
  const win = window as any;
  const probe = (stage: string): void => {
    try {
      void fetch('/context-distiller/probe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage,
          hasConfigForms: ctx.configForms !== undefined && ctx.configForms !== null,
          whileServedType: typeof ctx.configForms?.whileServed,
          slotsType: typeof ctx.slots,
          cardRegistered: win.__cdCardRegistered === true,
        }),
      }).catch(() => { /* diagnostics only */ });
    } catch { /* diagnostics only */ }
  };
  probe('apply');
  setTimeout(() => probe('late-3s'), 3000);
  setTimeout(() => probe('late-10s'), 10000);
  try {
    const form = ctx.configForms.get(NS_ID);
    const locale = ctx.locale;
    let t: (key: string) => string = (key) => (TXT.en as Record<string, string>)[key] ?? key;
    if (locale && typeof locale.register === 'function' && typeof locale.bind === 'function') {
      locale.register(NS_ID, TXT);
      t = locale.bind(NS_ID);
    }
    const register = (): void => {
      win.__cdCardRegistered = true;
      probe('registered');
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: NS_ID,
        inject: () => ({ t, form }),
      }, (props: any) => React.createElement(ConfigCard, { ...props, t, form })));
    };
    // While the Host serves the namespace the card exists; uninstalling or
    // disabling the plugin withdraws it automatically.
    if (ctx.configForms && typeof ctx.configForms.whileServed === 'function') {
      const dispose = ctx.configForms.whileServed([NS_ID], register);
      if (typeof ctx.effect === 'function') ctx.effect(() => dispose, 'context-distiller: plugins-page card');
    } else {
      register();
    }
  } catch (error) {
    console.error('[context-distiller] plugins-page config card registration failed', error);
  }
}
