import { loadActionLibrary, getActionVariant } from './action-library.js';
import { runPixVerseAction } from './pixverse-client.js';

function canvasToFile(canvas) {
  return new Promise((resolve, reject) => {
    if (!canvas) return reject(new Error('Aperçu HappyHolo introuvable.'));
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('Impossible de préparer l’image finale.'));
      resolve(new File([blob], `happyholo-${Date.now()}.png`, { type: 'image/png' }));
    }, 'image/png', 0.95);
  });
}

function setStatus(el, text, tone = 'neutral') {
  el.textContent = text;
  el.style.background = tone === 'error' ? '#ffe9e7' : tone === 'ok' ? '#e7f7eb' : '#f2f2f2';
  el.style.color = tone === 'error' ? '#8b1f17' : tone === 'ok' ? '#17652c' : '#333';
}

function buildPanel() {
  const panel = document.createElement('section');
  panel.id = 'hhPixverseActionsPanel';
  panel.style.cssText = 'margin:18px auto 0;max-width:1120px;background:#fff;border:2px solid #111;border-radius:18px;padding:18px;box-shadow:0 8px 30px #0001';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <div><h2 style="margin:0 0 4px">Actions PixVerse</h2><div style="font-size:13px;color:#555">Test intégré — image finale HappyHolo → 2 s / 540p → retour MP4.</div></div>
      <span style="background:#fff3cd;color:#725c00;border:1px solid #eed47a;padding:6px 9px;border-radius:999px;font-size:12px;font-weight:800">BRANCHE TEST</span>
    </div>
    <div style="display:grid;grid-template-columns:180px 1fr;gap:12px;margin-top:14px" class="hh-pv-grid">
      <div>
        <label style="font-size:13px;font-weight:700;display:block;margin:0 0 6px">Catégorie</label>
        <select id="hhPvFamily" style="width:100%;padding:11px;border:1px solid #ccc;border-radius:10px;background:#fff">
          <option value="person">Personne</option>
          <option value="group">Duo / Groupe</option>
          <option value="animal">Animal</option>
        </select>
      </div>
      <div>
        <label style="font-size:13px;font-weight:700;display:block;margin:0 0 6px">Action</label>
        <select id="hhPvAction" style="width:100%;padding:11px;border:1px solid #ccc;border-radius:10px;background:#fff"></select>
      </div>
    </div>
    <div id="hhPvPromptBox" style="margin-top:12px;padding:11px;border-radius:11px;background:#f7f7f7;font-size:13px;line-height:1.4"></div>
    <button id="hhPvRun" type="button" style="width:100%;margin-top:12px;border:0;border-radius:13px;padding:14px 16px;font:inherit;font-weight:800;background:#111;color:#fff">Lancer l’action PixVerse</button>
    <div id="hhPvStatus" style="margin-top:12px;padding:11px;border-radius:11px;background:#f2f2f2;font-size:13px;white-space:pre-wrap">Prêt.</div>
    <video id="hhPvVideo" controls playsinline loop style="display:none;width:100%;max-height:520px;margin-top:14px;border-radius:14px;background:#111"></video>
    <div id="hhPvResultActions" style="display:none;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button id="hhPvReplay" type="button" style="border:0;border-radius:11px;padding:11px 13px;font-weight:750;background:#e8e8e8;color:#111">Relire</button>
      <button id="hhPvRerun" type="button" style="border:0;border-radius:11px;padding:11px 13px;font-weight:750;background:#e8e8e8;color:#111">Relancer</button>
    </div>`;
  const style = document.createElement('style');
  style.textContent = '@media(max-width:700px){#hhPixverseActionsPanel .hh-pv-grid{grid-template-columns:1fr!important}}';
  document.head.appendChild(style);
  return panel;
}

async function init() {
  const anchor = document.querySelector('.wrap');
  if (!anchor || document.getElementById('hhPixverseActionsPanel')) return;
  const panel = buildPanel();
  anchor.appendChild(panel);

  const familyEl = panel.querySelector('#hhPvFamily');
  const actionEl = panel.querySelector('#hhPvAction');
  const promptBox = panel.querySelector('#hhPvPromptBox');
  const runBtn = panel.querySelector('#hhPvRun');
  const statusEl = panel.querySelector('#hhPvStatus');
  const videoEl = panel.querySelector('#hhPvVideo');
  const resultActions = panel.querySelector('#hhPvResultActions');
  const replayBtn = panel.querySelector('#hhPvReplay');
  const rerunBtn = panel.querySelector('#hhPvRerun');

  let library;
  try {
    library = await loadActionLibrary();
  } catch (e) {
    setStatus(statusEl, `Bibliothèque d’actions indisponible : ${e.message}`, 'error');
    runBtn.disabled = true;
    return;
  }

  function compatibleActions() {
    const family = familyEl.value;
    return (library.actions || []).filter(a => a.active !== false && a.categories?.includes(family) && a.variants?.some(v => v.family === family || v.id === a.defaultVariantId));
  }

  function refreshActions() {
    const actions = compatibleActions();
    actionEl.innerHTML = actions.map(a => `<option value="${a.id}">${a.label}</option>`).join('');
    runBtn.disabled = !actions.length;
    refreshPrompt();
  }

  function currentSelection() {
    if (!actionEl.value) return null;
    return getActionVariant(library, actionEl.value, familyEl.value);
  }

  function refreshPrompt() {
    try {
      const sel = currentSelection();
      if (!sel) {
        promptBox.textContent = 'Aucune action disponible dans cette catégorie.';
        return;
      }
      const v = sel.variant;
      promptBox.innerHTML = `<b>${sel.action.label}</b><br>${v.prompt}<br><span style="color:#666">${v.duration ?? 2} s · ${v.quality || '540p'} · audio ${v.audio ? 'ON' : 'OFF'}</span>`;
    } catch (e) {
      promptBox.textContent = e.message;
    }
  }

  async function run() {
    if (!navigator.onLine) {
      setStatus(statusEl, 'PixVerse nécessite une connexion Internet.', 'error');
      return;
    }
    let sel;
    try { sel = currentSelection(); } catch (e) { setStatus(statusEl, e.message, 'error'); return; }
    if (!sel) return;

    const canvas = document.getElementById('view');
    runBtn.disabled = true;
    videoEl.style.display = 'none';
    resultActions.style.display = 'none';
    setStatus(statusEl, 'Préparation de l’image finale HappyHolo…');

    try {
      const file = await canvasToFile(canvas);
      const result = await runPixVerseAction(file, sel.variant, {
        onStatus: s => {
          const labels = {
            upload: '1/4 — Envoi de l’image à PixVerse…',
            create: '2/4 — Génération 2 s / 540p lancée…',
            processing: '3/4 — PixVerse génère la vidéo…',
            done: '4/4 — Vidéo reçue.'
          };
          setStatus(statusEl, labels[s.step] || 'Traitement PixVerse…');
        }
      });
      videoEl.src = result.videoUrl;
      videoEl.style.display = 'block';
      resultActions.style.display = 'flex';
      setStatus(statusEl, `Terminé — vidéo PixVerse #${result.videoId} récupérée dans HappyHolo.`, 'ok');
      try { await videoEl.play(); } catch (_) {}
      window.HappyHoloLastPixVerseResult = { ...result, actionId: sel.action.id, variantId: sel.variant.id };
      window.dispatchEvent(new CustomEvent('happyholo:pixverse-result', { detail: window.HappyHoloLastPixVerseResult }));
    } catch (e) {
      setStatus(statusEl, `Erreur PixVerse : ${e.message}`, 'error');
    } finally {
      runBtn.disabled = false;
    }
  }

  familyEl.addEventListener('change', refreshActions);
  actionEl.addEventListener('change', refreshPrompt);
  runBtn.addEventListener('click', run);
  rerunBtn.addEventListener('click', run);
  replayBtn.addEventListener('click', () => { videoEl.currentTime = 0; videoEl.play().catch(() => {}); });
  refreshActions();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
