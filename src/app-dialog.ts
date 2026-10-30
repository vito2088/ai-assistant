import { t } from './i18n';
import './app-dialog.css';

type ConfirmOptions = {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};
type Request = {
  message: string;
  options: ConfirmOptions;
  key: string;
  resolve: (accepted: boolean) => void;
};
type Active = Request & {
  dialog: HTMLDialogElement;
  previousFocus: HTMLElement | null;
  lastFocus: HTMLElement;
};
const queue: Request[] = [];
let active: Active | null = null;

/** Async application confirmation. Repeated clicks must never run an action twice. */
export function confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
  const key = JSON.stringify([message, options.title, options.kind, options.okLabel, options.cancelLabel, options.destructive]);
  if (active?.key === key || queue.some(request => request.key === key)) return Promise.resolve(false);
  return new Promise(resolve => {
    queue.push({ message, options, key, resolve });
    showNext();
  });
}

function finish(request: Active, accepted: boolean) {
  if (active !== request) return;
  active = null;
  request.dialog.close();
  request.dialog.remove();
  if (request.previousFocus?.isConnected) request.previousFocus.focus({ preventScroll: true });
  else document.querySelector<HTMLDialogElement>('dialog[open]')?.focus({ preventScroll: true });
  request.resolve(accepted);
  queueMicrotask(showNext);
}

function showNext() {
  if (active || !queue.length) return;
  const request = queue.shift()!;
  const { options } = request;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-confirm-dialog';
  dialog.dataset.tone = options.destructive || options.kind === 'error' ? 'danger' : options.kind ?? 'info';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'app-confirm-title');
  dialog.setAttribute('aria-describedby', 'app-confirm-message');
  dialog.innerHTML = `<header><span class="app-confirm-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></svg></span><h2 id="app-confirm-title"></h2><button type="button" class="app-confirm-close" data-confirm-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><p id="app-confirm-message"></p><footer><button type="button" data-confirm-cancel></button><button type="button" class="app-confirm-accept" data-confirm-accept></button></footer>`;
  dialog.querySelector('#app-confirm-title')!.textContent = options.title ?? t('请确认');
  dialog.querySelector('#app-confirm-message')!.textContent = request.message;
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-confirm-cancel]')!;
  const accept = dialog.querySelector<HTMLButtonElement>('[data-confirm-accept]')!;
  cancel.textContent = options.cancelLabel ?? t('取消');
  accept.textContent = options.okLabel ?? t('确认');
  dialog.querySelector('[data-confirm-close]')!.setAttribute('aria-label', t('关闭'));
  const initialFocus = options.destructive ? cancel : accept;
  const state: Active = { ...request, dialog, previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null, lastFocus: initialFocus };
  active = state;
  cancel.addEventListener('click', () => finish(state, false));
  accept.addEventListener('click', () => finish(state, true));
  dialog.querySelector('[data-confirm-close]')!.addEventListener('click', () => finish(state, false));
  dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); finish(state, false); });
  dialog.addEventListener('close', () => { if (!dialog.open) finish(state, false); });
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); finish(state, false); return; }
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = index < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next]?.focus({ preventScroll: true });
  });
  dialog.addEventListener('focusin', event => { if (event.target instanceof HTMLElement) state.lastFocus = event.target; });
  document.body.append(dialog);
  try {
    dialog.showModal();
    initialFocus.focus({ preventScroll: true });
  } catch {
    finish(state, false);
  }
}

/** A background render may recreate an underlying editor and put it on top. */
export function keepConfirmationOnTop() {
  const state = active;
  if (!state) return;
  if (!state.dialog.isConnected || !state.dialog.open) { finish(state, false); return; }
  if (state.dialog.contains(document.activeElement)) return;
  state.dialog.close();
  state.dialog.showModal();
  state.lastFocus.focus({ preventScroll: true });
}
