import type { ToastLevel } from '../shared/types';

const CONTAINER_ID = 'ezsave-toast-container';

function toastContainer(): HTMLElement {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.documentElement.append(container);
  }
  return container;
}

export function showToast(message: string, level: ToastLevel): void {
  const toast = document.createElement('div');
  toast.className = `ezsave-toast ezsave-toast--${level}`;
  toast.textContent = message;
  toastContainer().append(toast);

  window.setTimeout(() => toast.classList.add('ezsave-toast--visible'), 0);
  window.setTimeout(() => {
    toast.classList.remove('ezsave-toast--visible');
    window.setTimeout(() => toast.remove(), 180);
  }, level === 'error' ? 5_500 : 3_600);
}
