import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { translateCaptureText } from './capture-translation';

export type NativeStarted = { id: string; kind: 'screenshot' | 'recording' };
export type NativeFinished = NativeStarted & { error?: string; result?: {action: string; path?: string | null} };
type OcrRequest = {id: string; revision: number; path: string; text: string; translate: boolean};

/** Processing only: window creation, hotkeys and editing are owned by Rust. */
export class NativeCaptureBridge {
  private activeId: string | null = null;
  private pending: OcrRequest | null = null;
  private running = false;
  private controller: AbortController | null = null;
  private ocr: typeof import('./capture-ocr') | undefined;
  private lastRequest = '';
  constructor(private hooks: {
    started: (event: NativeStarted) => void;
    finished: (event: NativeFinished) => void;
    error: (text: string) => void;
    shortcut: (kind: string, key: string) => void;
  }) {}
  async adopt(id: string | null) {
    this.activeId = id;
    if (id) {
      const request = await invoke<OcrRequest | null>('native_capture_pending_ocr');
      if (request) this.enqueue(request);
    }
  }
  private enqueue(request: OcrRequest) {
    const key = `${request.id}:${request.revision}`;
    if (this.activeId !== request.id || key === this.lastRequest) return;
    this.lastRequest = key; this.pending = request;
    this.controller?.abort(); void this.process();
  }
  async initialize() {
    await listen<NativeStarted>('native-capture-started', ({payload}) => { this.activeId = payload.id; this.hooks.started(payload); });
    await listen<NativeFinished>('native-capture-finished', ({payload}) => {
      if (this.activeId && this.activeId !== payload.id) return;
      this.activeId = null; this.pending = null; this.controller?.abort();
      if (!this.running) this.ocr?.disposeOcr();
      this.hooks.finished(payload);
    });
    await listen<string>('native-capture-error', ({payload}) => this.hooks.error(payload));
    await listen<{kind: string; key: string}>('native-shortcut-edit', ({payload}) => this.hooks.shortcut(payload.kind, payload.key));
    await listen<OcrRequest>('native-capture-ocr', ({payload}) => {
      this.enqueue(payload);
    });
  }
  private async process() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending) {
        const request = this.pending; this.pending = null;
        const controller = new AbortController(); this.controller = controller;
        let text = request.text, translated = '', error = '';
        try {
          if (!text) {
            const bytes = await invoke<ArrayBuffer>('read_capture_draft', {path: request.path});
            if (controller.signal.aborted) continue;
            this.ocr ??= await import('./capture-ocr');
            text = await this.ocr.recognizeLocal(new Blob([bytes], {type: 'image/png'}));
          }
          if (controller.signal.aborted) continue;
          if (request.translate && text) translated = await translateCaptureText(text, controller.signal);
        } catch (failure) { error = String(failure); }
        if (this.activeId === request.id && !controller.signal.aborted) {
          await invoke('native_capture_ocr_result', {result: {id: request.id, revision: request.revision, text, translated, error}}).catch(() => {});
        }
      }
    } finally {
      this.running = false; this.controller = null;
      if (!this.activeId) this.ocr?.disposeOcr();
    }
  }
}
