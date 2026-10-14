/* HappyHolo V4.0 — pipeline de rendu unique et ordonné.
   Les moteurs historiques restent disponibles ; les extensions s'enregistrent
   explicitement au lieu de réassigner window.renderAt selon leur ordre de chargement. */
(() => {
  'use strict';
  const entries = new Map();
  let rendering = false;

  function ordered() {
    return [...entries.values()].sort((a, b) => b.priority - a.priority);
  }

  function renderFrom(list, index, norm, target) {
    for (let i = index; i < list.length; i++) {
      const entry = list[i];
      if (entry.enabled && !entry.enabled()) continue;
      return entry.render(norm, target, (nextNorm = norm, nextTarget = target) => renderFrom(list, i + 1, nextNorm, nextTarget));
    }
  }

  function dispatch(norm, target) {
    if (rendering) return;
    rendering = true;
    try {
      return renderFrom(ordered(), 0, norm, target);
    } finally {
      rendering = false;
    }
  }

  function register(name, render, { priority = 0, enabled = () => true } = {}) {
    if (typeof name !== 'string' || typeof render !== 'function') throw new Error('Rendu HappyHolo invalide.');
    entries.set(name, { name, render, priority: Number(priority) || 0, enabled });
    return () => entries.delete(name);
  }

  window.HappyHoloRenderPipeline = Object.freeze({
    register,
    render: dispatch,
    active: () => ordered().filter(entry => !entry.enabled || entry.enabled()).map(entry => entry.name),
    has: name => entries.has(name)
  });
  window.renderAt = dispatch;
})();
