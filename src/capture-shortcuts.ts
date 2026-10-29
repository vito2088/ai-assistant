import { t } from './i18n';

export type CaptureKind = 'screenshot' | 'recording';
export const captureKinds: CaptureKind[] = ['screenshot', 'recording'];
export const defaultShortcuts = { screenshot: 'Ctrl+Alt+KeyA', recording: 'Ctrl+Alt+KeyR' };
type Bindings = Record<CaptureKind, string>;
type Backend = {
  reset(): Promise<void>;
  register(key: string, handler: () => void, kind?: CaptureKind): Promise<void>;
  unregister(key: string): Promise<void>;
  save(values: Bindings): Promise<void>;
};

export function validShortcut(value: string): boolean {
  if (value === '') return true;
  return /^(Ctrl\+)?(Alt\+)?(Shift\+)?(Super\+)?(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Enter|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Insert|Delete|Backspace)$/.test(value)
    && /(?:Ctrl|Alt|Super)\+/.test(value);
}

export function shortcutFromEvent(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  const value = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super', event.code].filter(Boolean).join('+');
  return validShortcut(value) ? value : null;
}

export function shortcutLabel(value: string) {
  return value.replace(/Key([A-Z])/g, '$1').replace(/Digit([0-9])/g, '$1').replace('Super', 'Win/⌘').replaceAll('+', ' + ');
}

export class CaptureShortcuts {
  values: Bindings = { ...defaultShortcuts };
  active: Partial<Bindings> = {};
  errors: Partial<Bindings> = {};
  busy = false;
  constructor(private backend: Backend, private trigger: (kind: CaptureKind, key: string) => void) {}

  private async register(kind: CaptureKind, key: string) {
    await this.backend.register(key, () => {
      if (!this.busy && this.active[kind] === key) this.trigger(kind, key);
    }, kind);
  }

  async initialize(saved: string | null) {
    // Native registrations outlive a webview reload. Replace our application's
    // registrations so their callbacks point to the current page.
    await this.backend.reset();
    this.active = {};
    this.errors = {};
    this.values = { ...defaultShortcuts };
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        for (const kind of captureKinds) {
          if (typeof parsed?.[kind] === 'string' && validShortcut(parsed[kind])) this.values[kind] = parsed[kind];
        }
      } catch { /* Invalid saved settings fall back to defaults. */ }
    }
    for (const kind of captureKinds) {
      const key = this.values[kind];
      if (!key) continue;
      try {
        if (Object.values(this.active).includes(key)) throw new Error(t('截图与录屏快捷键不能相同'));
        await this.register(kind, key); this.active[kind] = key;
      } catch (error) { this.errors[kind] = t('快捷键 {0} 注册失败，请检查组合键是否被其他程序使用：{1}', [shortcutLabel(key), String(error)]); }
    }
  }

  async update(kind: CaptureKind, key: string) {
    if (this.busy) throw new Error(t('正在保存快捷键，请稍候'));
    if (!validShortcut(key)) throw new Error(t('请使用 Ctrl、Alt 或 Win/⌘ 搭配字母、数字、功能键等组合'));
    const other = kind === 'screenshot' ? 'recording' : 'screenshot';
    if (key && key === this.values[other]) throw new Error(t('截图与录屏快捷键不能相同'));
    this.busy = true;
    const old = this.active[kind];
    let added = false, removed = false;
    let stage: 'register' | 'unregister' | 'save' = 'register';
    try {
      // Reserve the replacement first so an occupied key leaves the old one working.
      if (key && key !== old) { await this.register(kind, key); added = true; }
      stage = 'unregister';
      if (old && old !== key) { await this.backend.unregister(old); removed = true; }
      const next = { ...this.values, [kind]: key };
      stage = 'save';
      await this.backend.save(next);
      this.values = next;
      this.active[kind] = key;
      delete this.errors[kind];
    } catch (error) {
      const failures: string[] = [];
      if (added) { try { await this.backend.unregister(key); } catch (e) { failures.push(String(e)); } }
      if (removed && old) {
        try { await this.register(kind, old); }
        catch (e) { delete this.active[kind]; failures.push(String(e)); }
      }
      const detail = failures.length ? t('；恢复原快捷键时出错，请重启应用：{0}', [failures.join('; ')]) : '';
      this.errors[kind] = (stage === 'register'
        ? t('快捷键 {0} 注册失败，请检查组合键是否被其他程序使用：{1}', [shortcutLabel(key), String(error)])
        : stage === 'unregister'
          ? t('无法释放原快捷键 {0}：{1}', [shortcutLabel(old ?? ''), String(error)])
          : t('快捷键设置保存失败：{0}', [String(error)])) + detail;
      throw new Error(this.errors[kind]);
    } finally { this.busy = false; }
  }
}
