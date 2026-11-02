export const RERENDER_EVENT = 'carrier-helper:rerender';

export function requestRender(): void {
  window.dispatchEvent(new Event(RERENDER_EVENT));
}
