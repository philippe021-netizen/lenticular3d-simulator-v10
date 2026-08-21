/* HappyHolo — correctif iPad affichage éditeur de masque V1
   Safari/Chrome iPad peuvent ouvrir la modale avant la fin du layout.
   On déclenche automatiquement "Ajuster" une fois la zone réellement dimensionnée.
*/
(() => {
  'use strict';

  let wasVisible = false;
  let fittedThisOpen = false;

  function findMaskModal() {
    const all = [...document.querySelectorAll('div')];
    return all.find(el => {
      if (el.style.position !== 'fixed') return false;
      return el.textContent && el.textContent.includes('Correction du sujet');
    }) || null;
  }

  function findAdjustButton(modal) {
    return [...modal.querySelectorAll('button')]
      .find(b => b.textContent && b.textContent.trim() === 'Ajuster');
  }

  function isVisible(modal) {
    if (!modal) return false;
    const s = getComputedStyle(modal);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  function forceFit(modal) {
    const btn = findAdjustButton(modal);
    if (!btn) return;

    // Double passage : le premier force le layout, le second utilise les dimensions stabilisées.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        btn.click();
        setTimeout(() => btn.click(), 180);
      });
    });
  }

  setInterval(() => {
    const modal = findMaskModal();
    const visible = isVisible(modal);

    if (!visible) {
      wasVisible = false;
      fittedThisOpen = false;
      return;
    }

    if (visible && (!wasVisible || !fittedThisOpen)) {
      wasVisible = true;
      fittedThisOpen = true;
      setTimeout(() => forceFit(modal), 60);
    }
  }, 80);

  console.log('[HAPPYHOLO] Correctif affichage masque iPad actif');
})();
