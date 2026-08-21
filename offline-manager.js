(() => {
  'use strict';

  const PACK_VERSION = 'happyholo-offline-v1';
  const PACK_KEY = `${PACK_VERSION}:ready`;
  const MODE_KEY = 'happyholo:work-mode'; // "local" | "connected"
  const $ = s => document.querySelector(s);

  let registration = null;
  let preparing = false;

  function make(tag, props = {}, parent) {
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'style') Object.assign(el.style, v);
      else if (k === 'text') el.textContent = v;
      else el[k] = v;
    });
    if (parent) parent.appendChild(el);
    return el;
  }

  function getMode() {
    return localStorage.getItem(MODE_KEY) === 'local' ? 'local' : 'connected';
  }

  function setMode(mode) {
    const safe = mode === 'local' ? 'local' : 'connected';
    localStorage.setItem(MODE_KEY, safe);
    sendModeToServiceWorker(safe);
    updateModeUI();
  }

  function networkText() {
    return navigator.onLine ? 'Réseau iPad : disponible' : 'Réseau iPad : indisponible';
  }

  function sendModeToServiceWorker(mode = getMode()) {
    const msg = {type:'SET_HAPPYHOLO_MODE', mode};

    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage(msg);
    }

    if (registration?.active) {
      registration.active.postMessage(msg);
    }
  }

  function buildOfflineUI() {
    const wrap = $('.wrap') || document.body;

    const panel = make('div', {
      id: 'happyholoModePanel',
      style: {
        position: 'sticky',
        top: '0',
        zIndex: '99990',
        margin: '0 0 14px',
        padding: '14px',
        borderRadius: '16px',
        background: '#fff',
        border: '2px solid #111',
        boxShadow: '0 3px 16px #0002'
      }
    });

    wrap.insertBefore(panel, wrap.firstChild);

    const top = make('div', {
      style: {
        display:'flex',
        gap:'10px',
        alignItems:'center',
        justifyContent:'space-between',
        flexWrap:'wrap'
      }
    }, panel);

    make('div', {
      text:'MODE DE TRAVAIL HAPPYHOLO',
      style:{fontWeight:'900',fontSize:'18px'}
    }, top);

    const buttons = make('div', {
      style:{display:'flex',gap:'8px',flexWrap:'wrap'}
    }, top);

    const connectedBtn = make('button', {
      id:'modeConnectedBtn',
      type:'button',
      text:'MODE CONNECTÉ'
    }, buttons);

    const localBtn = make('button', {
      id:'modeLocalBtn',
      type:'button',
      text:'MODE LOCAL'
    }, buttons);

    const status = make('div', {
      id:'happyholoModeStatus',
      style:{
        marginTop:'10px',
        padding:'10px 12px',
        borderRadius:'11px',
        fontWeight:'800',
        fontSize:'14px'
      }
    }, panel);

    const net = make('div', {
      id:'happyholoNetworkStatus',
      style:{
        marginTop:'7px',
        fontSize:'13px',
        color:'#555'
      }
    }, panel);

    connectedBtn.addEventListener('click', ()=>setMode('connected'));
    localBtn.addEventListener('click', ()=>setMode('local'));

    const card = make('div', {
      id: 'offlinePackCard',
      style: {
        background: '#fff',
        border: '2px solid #111',
        borderRadius: '18px',
        padding: '16px',
        margin: '0 0 16px'
      }
    });

    const sub = $('.sub');
    if (sub && sub.parentNode) sub.parentNode.insertBefore(card, sub.nextSibling);
    else wrap.insertBefore(card, panel.nextSibling);

    make('div', {
      text: 'Pack de secours iPad',
      style: {fontSize:'18px', fontWeight:'850', marginBottom:'6px'}
    }, card);

    make('div', {
      text: 'À préparer une fois avec une bonne connexion. Ensuite le mode LOCAL utilise uniquement les ressources déjà stockées sur cet iPad, même si le Wi‑Fi ou la 4G/5G restent actifs.',
      style: {fontSize:'13px', lineHeight:'1.45', color:'#444'}
    }, card);

    const controls = make('div', {
      style: {display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'10px'}
    }, card);

    const prepare = make('button', {
      id: 'prepareOfflinePack',
      type: 'button',
      text: 'Télécharger / vérifier le pack hors ligne'
    }, controls);

    const packStatus = make('div', {
      id: 'offlinePackStatus',
      text: 'Vérification…',
      style: {
        marginTop:'10px',
        padding:'10px',
        borderRadius:'10px',
        background:'#f2f2f2',
        fontSize:'13px',
        whiteSpace:'pre-wrap'
      }
    }, card);

    prepare.addEventListener('click', prepareOfflinePack);

    updateModeUI();
    updatePackStatus();
  }

  function updateModeUI() {
    const mode = getMode();
    const connectedBtn = $('#modeConnectedBtn');
    const localBtn = $('#modeLocalBtn');
    const status = $('#happyholoModeStatus');
    const net = $('#happyholoNetworkStatus');

    if (!status) return;

    if (mode === 'local') {
      status.textContent = 'MODE LOCAL — HAPPYHOLO N’UTILISE PAS INTERNET';
      status.style.background = '#ffe4cf';
      status.style.color = '#7b3100';
      status.style.border = '2px solid #d86b1c';

      localBtn.style.background = '#111';
      localBtn.style.color = '#fff';
      connectedBtn.style.background = '#e8e8e8';
      connectedBtn.style.color = '#111';
    } else {
      status.textContent = 'MODE CONNECTÉ — IA ET SERVICES EN LIGNE AUTORISÉS';
      status.style.background = '#dff7e7';
      status.style.color = '#0c5c29';
      status.style.border = '2px solid #2c9b52';

      connectedBtn.style.background = '#111';
      connectedBtn.style.color = '#fff';
      localBtn.style.background = '#e8e8e8';
      localBtn.style.color = '#111';
    }

    if (net) {
      net.textContent = `${networkText()} — indépendant du mode HappyHolo.`;
    }

    sendModeToServiceWorker(mode);
  }

  async function updatePackStatus(extra = '') {
    const out = $('#offlinePackStatus');
    if (!out) return;

    const ready = localStorage.getItem(PACK_KEY);
    let storage = '';

    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        if (Number.isFinite(e.usage)) {
          storage = `\nStockage navigateur utilisé : ${(e.usage/1024/1024).toFixed(0)} Mo.`;
        }
      }
    } catch (_) {}

    if (ready) {
      out.textContent =
        `Pack hors ligne préparé sur cet iPad.\nDernière préparation : ${new Date(ready).toLocaleString('fr-FR')}.${storage}` +
        (extra ? `\n${extra}` : '');
    } else {
      out.textContent =
        `Pack hors ligne pas encore préparé sur cet iPad.${storage}` +
        (extra ? `\n${extra}` : '');
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker non disponible dans ce navigateur.');
    }

    if (!registration) {
      registration = await navigator.serviceWorker.register('./service-worker.js', {scope:'./'});
    }

    await navigator.serviceWorker.ready;

    if (!navigator.serviceWorker.controller) {
      await new Promise(resolve => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          navigator.serviceWorker.removeEventListener('controllerchange', finish);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', finish, {once:true});
        setTimeout(finish, 1500);
      });
    }

    sendModeToServiceWorker();
    return registration;
  }

  async function tinyTestBlob() {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#e8e8e8';
    x.fillRect(0,0,96,96);
    x.fillStyle = '#222';
    x.beginPath();
    x.arc(48,43,25,0,Math.PI*2);
    x.fill();
    x.fillRect(35,65,26,20);

    return await new Promise((resolve, reject) => {
      c.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image test impossible.')), 'image/png');
    });
  }

  async function warmBackgroundRemoval(testBlob, setStep) {
    setStep('Téléchargement du moteur de détourage…');

    const mod = await import('https://esm.sh/@imgly/background-removal');
    const removeBackground = mod.removeBackground || mod.default;
    if (typeof removeBackground !== 'function') throw new Error('Moteur de détourage indisponible.');

    await removeBackground(testBlob, {
      progress: (key, current, total) => {
        if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
          setStep(`Détourage : ${Math.round(current / total * 100)} % — ${key}`);
        }
      }
    });
  }

  async function warmDepthModel(testBlob, setStep) {
    setStep('Téléchargement du moteur de profondeur…');

    const {pipeline, env} = await import(
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm'
    );

    env.allowLocalModels = false;

    const estimator = await pipeline(
      'depth-estimation',
      'onnx-community/depth-anything-v2-small',
      {dtype:'q4'}
    );

    const url = URL.createObjectURL(testBlob);
    try {
      setStep('Vérification du moteur de profondeur…');
      await estimator(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function prepareOfflinePack() {
    if (preparing) return;

    const button = $('#prepareOfflinePack');
    const out = $('#offlinePackStatus');

    if (!navigator.onLine) {
      out.textContent = 'Une connexion est nécessaire uniquement pour préparer ou réparer le pack hors ligne.';
      return;
    }

    preparing = true;
    button.disabled = true;

    const previousMode = getMode();
    setMode('connected');

    const setStep = msg => {
      out.textContent = `Préparation du pack hors ligne…\n${msg}`;
    };

    try {
      setStep('Activation du stockage local…');
      await registerServiceWorker();

      if (navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch (_) {}
      }

      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({type:'CACHE_APP_SHELL'});
      }

      setStep('Mise en cache des bibliothèques principales…');
      await Promise.allSettled([
        fetch('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', {mode:'cors'}),
        import('https://esm.sh/@imgly/background-removal'),
        import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm')
      ]);

      const testBlob = await tinyTestBlob();

      await warmBackgroundRemoval(testBlob, setStep);
      await warmDepthModel(testBlob, setStep);

      localStorage.setItem(PACK_KEY, new Date().toISOString());
      await updatePackStatus('Vérification réussie : détourage et profondeur disponibles.');

    } catch (error) {
      console.error('[OFFLINE]', error);
      out.textContent =
        `Pack incomplet.\n${error?.message || error}\nRelance la préparation avec une connexion stable.`;
    } finally {
      setMode(previousMode);
      preparing = false;
      button.disabled = false;
    }
  }

  async function boot() {
    buildOfflineUI();

    window.addEventListener('online', () => updateModeUI());
    window.addEventListener('offline', () => updateModeUI());

    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      sendModeToServiceWorker();
    });

    try {
      await registerServiceWorker();
    } catch (error) {
      console.warn('[OFFLINE] Service Worker:', error);
      updatePackStatus('Le mode local strict nécessite HTTPS et le Service Worker.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
