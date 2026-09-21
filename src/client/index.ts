/**
 * context-distiller client half — browser-side settings panel.
 *
 * Registers a "Context Distiller" section in the DSH web settings page via
 * `ctx.slots.inject('settings.section', ...)`. The panel lets the user toggle
 * the dedicated-model compaction router and pick a provider/model pair from
 * dropdowns populated by `GET /context-distiller/models` (backed by ctx.llm).
 * Changes are persisted through `POST /context-distiller/config`, taking
 * effect immediately without a restart.
 *
 * UI text follows the DSH interface locale via `ctx.locale.register/bind`.
 *
 * @module context-distiller/client
 */
import React, { useEffect, useState } from 'react';

/** Client half inject: `slots` for settings panel, `locale` for i18n. */
export const inject = ['slots', 'locale'];

/** i18n namespace. */
const NS = 'context-distiller';

/** Bilingual text dictionary. */
const TXT = {
  zh: {
    title: '上下文压缩',
    toggle: '为上下文压缩使用独立模型',
    hintOff: '压缩使用当前会话模型。开启后可将摘要请求路由到更便宜或更快的模型。',
    provider: '模型提供商',
    providerHint: '在 DSH 模型设置中配置的提供商路由。',
    providerPlaceholder: '— 选择提供商 —',
    model: '模型',
    modelHint: '仅用于上下文压缩摘要的模型。',
    modelPlaceholder: '— 选择模型 —',
    save: '保存',
    saving: '保存中...',
    savedOn: '已保存。压缩路由已启用。',
    savedOff: '已保存。压缩路由已关闭。',
    saveFail: '保存失败：',
    selectWarn: '请在启用前选择提供商和模型。',
    loadFail: '加载配置失败',
    loading: '加载中...',
    custom: '（自定义）',
    filterSection: '压缩过滤',
    filterToggle: '压缩时过滤被标记为有问题的对话',
    filterHint: '在会话中对回答点"有问题"（/feedback）后，该轮对话不会进入压缩摘要。与独立模型开关互不影响。',
    thresholdSection: '压缩阈值',
    thresholdLabel: '触发阈值（万 token）',
    thresholdHint: '上下文达到该 token 数即触发压缩，可选 1-100（即 1万-100万 token）。填 0 表示跟随默认策略。',
  },
  en: {
    title: 'Context Distiller',
    toggle: 'Use a different model for compaction',
    hintOff: 'Compaction uses your conversation model. Toggle on to route summaries to a cheaper or faster model.',
    provider: 'Provider',
    providerHint: 'Provider routes configured in DSH Models settings.',
    providerPlaceholder: '— Select provider —',
    model: 'Model',
    modelHint: 'Model used only for context compaction summaries.',
    modelPlaceholder: '— Select model —',
    save: 'Save',
    saving: 'Saving...',
    savedOn: 'Saved. Compaction route active.',
    savedOff: 'Saved. Compaction disabled.',
    saveFail: 'Save failed: ',
    selectWarn: 'Please select a provider and model before enabling.',
    loadFail: 'Failed to load config',
    loading: 'Loading...',
    custom: ' (custom)',
    filterSection: 'Compaction filter',
    filterToggle: 'Filter out conversations reported as problematic during compaction',
    filterHint: 'After you report an answer via the "report problem" action (/feedback), that whole turn is kept out of the compaction summary. Independent of the dedicated-model toggle.',
    thresholdSection: 'Compaction threshold',
    thresholdLabel: 'Trigger threshold (10k tokens)',
    thresholdHint: 'Compact once the context reaches this many tokens; pick 1-100 (10k-1M tokens). 0 keeps the default policy.',
  },
};

/** Current config snapshot returned by GET /context-distiller/config. */
interface ConfigSnapshot {
  compact: { enabled: boolean; provider: string; model: string };
  filter: { flaggedTurns: boolean };
  threshold: { wan: number };
  engine: { enabled: boolean; thresholdRatio: number; retainRatio: number };
}

/** Upper bound of threshold.wan: 100 wan = 1,000,000 tokens. */
const WAN_MAX = 100;

/** Provider/model directory entry from GET /context-distiller/models. */
interface ProviderEntry {
  provider: string;
  name: string;
  models: Array<{ id: string; name: string }>;
}

/** Inline styles (host CSS may override class names). */
const S = {
  wrap: { padding: '16px', fontFamily: 'system-ui, -apple-system, sans-serif' as const },
  title: { margin: '0 0 16px', fontSize: '15px', fontWeight: 600 },
  row: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' },
  label: { fontSize: '13px', minWidth: '80px', color: 'var(--dsh-text, #333)' },
  select: {
    flex: 1, padding: '6px 8px', fontSize: '13px',
    border: '1px solid var(--dsh-border, #ccc)', borderRadius: '4px',
    background: 'var(--dsh-bg, #fff)', color: 'var(--dsh-text, #333)',
  } as const,
  toggle: { width: '18px', height: '18px', cursor: 'pointer' },
  btn: {
    padding: '6px 18px', fontSize: '13px', cursor: 'pointer',
    border: 'none', borderRadius: '4px',
    background: 'var(--dsh-accent, #4f46e5)', color: '#fff',
  } as const,
  hint: { fontSize: '12px', color: 'var(--dsh-text-sec, #888)', marginTop: '-8px', marginBottom: '12px' },
  status: { fontSize: '12px', marginTop: '8px' },
  divider: { border: 'none', borderTop: '1px solid var(--dsh-border, #e5e7eb)', margin: '16px 0' },
  sectionTitle: { margin: '0 0 12px', fontSize: '13px', fontWeight: 600, color: 'var(--dsh-text-sec, #666)' },
};

/** Settings panel component. Receives `t` from slots.inject. */
function SettingsPanel({ t }: { t: (key: string) => string }) {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [wan, setWan] = useState(0);
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/context-distiller/config').then((r) => r.json()) as Promise<ConfigSnapshot>,
      fetch('/context-distiller/models').then((r) => r.json()) as Promise<ProviderEntry[]>,
    ])
      .then(([cfg, list]) => {
        setEnabled(cfg.compact.enabled);
        setProvider(cfg.compact.provider || '');
        setModel(cfg.compact.model || '');
        setFilterFlagged(cfg.filter?.flaggedTurns ?? false);
        setWan(cfg.threshold?.wan ?? 0);
        setProviders(list || []);
        setLoaded(true);
      })
      .catch(() => {
        setMsg({ ok: false, text: t('loadFail') });
        setLoaded(true);
      });
  }, []);

  const availableModels = providers.find((p) => p.provider === provider)?.models ?? [];

  const save = async () => {
    if (enabled && (!provider || !model)) {
      setMsg({ ok: false, text: t('selectWarn') });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch('/context-distiller/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          compact: {
            enabled,
            provider: enabled ? provider : '',
            model: enabled ? model : '',
          },
          filter: {
            flaggedTurns: filterFlagged,
          },
          threshold: {
            wan: Math.min(WAN_MAX, Math.max(0, Math.round(wan) || 0)),
          },
        }),
      });
      if (r.ok) {
        setMsg({ ok: true, text: enabled ? t('savedOn') : t('savedOff') });
      } else {
        const text = await r.text().catch(() => '');
        setMsg({ ok: false, text: t('saveFail') + (text || r.status) });
      }
    } catch (e) {
      setMsg({ ok: false, text: t('saveFail') + (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return React.createElement('div', { style: S.wrap }, t('loading'));
  }

  return React.createElement('div', { style: S.wrap },
    React.createElement('h3', { style: S.title }, t('title')),
    // Toggle
    React.createElement('div', { style: S.row },
      React.createElement('label', { style: { ...S.label, display: 'flex', alignItems: 'center', gap: '6px' } },
        React.createElement('input', {
          type: 'checkbox',
          style: S.toggle,
          checked: enabled,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEnabled(e.target.checked),
        }),
        t('toggle')),
    ),
    !enabled && React.createElement('div', { style: S.hint }, t('hintOff')),
    // Provider dropdown
    enabled && React.createElement('div', { style: S.row },
      React.createElement('span', { style: S.label }, t('provider')),
      React.createElement('select', {
        style: S.select,
        value: provider,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
          const p = e.target.value;
          setProvider(p);
          const entry = providers.find((x) => x.provider === p);
          if (entry?.models.length) setModel(entry.models[0].id);
        },
      },
        React.createElement('option', { value: '' }, t('providerPlaceholder')),
        ...providers.map((p) =>
          React.createElement('option', { key: p.provider, value: p.provider }, p.name || p.provider)
        ),
      ),
    ),
    enabled && React.createElement('div', { style: S.hint }, t('providerHint')),
    // Model dropdown
    enabled && React.createElement('div', { style: S.row },
      React.createElement('span', { style: S.label }, t('model')),
      React.createElement('select', {
        style: S.select,
        value: model,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setModel(e.target.value),
      },
        React.createElement('option', { value: '' }, t('modelPlaceholder')),
        ...(availableModels.length > 0
          ? availableModels.map((m) =>
            React.createElement('option', { key: m.id, value: m.id }, m.name || m.id)
          )
          : model
            ? [React.createElement('option', { key: model, value: model }, model + t('custom'))]
            : []),
      ),
    ),
    enabled && React.createElement('div', { style: S.hint }, t('modelHint')),
    // Flagged-turn filter section (independent of the dedicated-model toggle)
    React.createElement('hr', { style: S.divider }),
    React.createElement('h4', { style: S.sectionTitle }, t('filterSection')),
    React.createElement('div', { style: S.row },
      React.createElement('label', { style: { ...S.label, display: 'flex', alignItems: 'center', gap: '6px' } },
        React.createElement('input', {
          type: 'checkbox',
          style: S.toggle,
          checked: filterFlagged,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFilterFlagged(e.target.checked),
        }),
        t('filterToggle')),
    ),
    React.createElement('div', { style: { ...S.hint, marginTop: '0' } }, t('filterHint')),
    // Absolute-threshold section (independent of both toggles)
    React.createElement('hr', { style: S.divider }),
    React.createElement('h4', { style: S.sectionTitle }, t('thresholdSection')),
    React.createElement('div', { style: S.row },
      React.createElement('label', { style: S.label }, t('thresholdLabel')),
      React.createElement('input', {
        type: 'number',
        style: S.select,
        min: 0,
        max: WAN_MAX,
        step: 1,
        value: wan,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setWan(Number(e.target.value) || 0),
      }),
    ),
    React.createElement('div', { style: { ...S.hint, marginTop: '0' } }, t('thresholdHint')),
    // Save
    React.createElement('button', {
      style: S.btn,
      onClick: save,
      disabled: saving || (enabled && (!provider || !model)),
    },
      saving ? t('saving') : t('save')),
    msg && React.createElement('div', {
      style: { ...S.status, color: msg.ok ? 'var(--dsh-ok, #16a34a)' : 'var(--dsh-err, #dc2626)' },
    }, msg.text),
  );
}

/** Client half entry. */
export function apply(ctx: Record<string, any>): void {
  try {
    // Register bilingual dictionary so DSH locale can bind it.
    if (ctx.locale && typeof ctx.locale.register === 'function') {
      ctx.locale.register(NS, TXT);
    }
    const t: (key: string) => string =
      ctx.locale && typeof ctx.locale.bind === 'function'
        ? ctx.locale.bind(NS)
        : (key: string) => TXT.en[key as keyof typeof TXT.en] ?? key;

    if (!ctx.slots || typeof ctx.slots.inject !== 'function') {
      console.warn('[context-distiller] slots service unavailable; settings panel not registered');
      return;
    }
    ctx.slots.inject('settings.section', () => {
      return ctx.slots.register({
        name: 'settings.section',
        id: 'context-distiller',
        order: 50,
        label: () => t('title'),
        inject: () => ({ t }),
      }, SettingsPanel);
    });
  } catch (e) {
    console.error('[context-distiller] settings panel registration failed', e);
  }
}
