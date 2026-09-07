import { render } from "preact";

/**
 * Mount a Preact component tree into a DOM container managed by the existing
 * router. Call from a phone screen's render/mount path instead of setting
 * innerHTML. Returns an unmount function for cleanup().
 */
export function mountPreact(vnode, container) {
  render(vnode, container);
  return () => render(null, container);
}
