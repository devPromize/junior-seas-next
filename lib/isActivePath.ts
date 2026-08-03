// Shared active-nav rule so every header link (icons + nav text) highlights
// consistently. A link is active on its own path AND any sub-page — e.g.
// "/account" stays active on "/account/admin". "/" is matched exactly, so the
// Home link doesn't light up on every route.
export const isActivePath = (current: string, target: string): boolean => {
  if (!current) return false;
  if (target === '/') return current === '/';
  return current === target || current.startsWith(target + '/');
};
