export type Child = Node | string | number | null | undefined | false;

export interface ElementProps {
  class?: string;
  className?: string;
  dataset?: Record<string, string | number | boolean | undefined>;
  on?: Record<string, EventListener>;
  [key: string]: unknown;
}

function appendChild(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) {
    for (const item of child) appendChild(parent, item);
    return;
  }
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }
  parent.appendChild(document.createTextNode(String(child)));
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class' || key === 'className') {
        element.className = String(value);
        continue;
      }
      if (key === 'dataset' && typeof value === 'object') {
        for (const [dataKey, dataValue] of Object.entries(value as Record<string, unknown>)) {
          if (dataValue === null || dataValue === undefined || dataValue === false) continue;
          element.dataset[dataKey] = String(dataValue);
        }
        continue;
      }
      if (key === 'on' && typeof value === 'object') {
        for (const [eventName, handler] of Object.entries(value as Record<string, unknown>)) {
          if (typeof handler === 'function') {
            element.addEventListener(eventName, handler as EventListener);
          }
        }
        continue;
      }
      if (key === 'value' || key === 'checked' || key === 'selected') {
        (element as unknown as Record<string, unknown>)[key] = value;
        continue;
      }
      if (key.startsWith('on') && typeof value === 'function') {
        element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
        continue;
      }
      if (value === true) {
        element.setAttribute(key, '');
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) appendChild(element, child);
  return element;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined | null> = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    element.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (child instanceof Node) element.appendChild(child);
    else if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(String(child)));
    }
  }
  return element;
}

export function clear(node: Element): void {
  node.replaceChildren();
}

export function setText(node: Element, value: string): void {
  node.textContent = value;
}

export function fragment(...children: Child[]): DocumentFragment {
  const doc = document.createDocumentFragment();
  for (const child of children) appendChild(doc, child);
  return doc;
}
