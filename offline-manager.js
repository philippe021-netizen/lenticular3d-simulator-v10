(() => {
  'use strict';

  const PACK_VERSION = 'happyholo-offline-v1.11';
  const PACK_KEY = `${PACK_VERSION}:ready`;
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

  function formatMB(bytes) {
    if (!Number.isFinite(bytes)) return '';
    return `${(bytes / 1024 / 1024).toFixed(0)} Mo`;
  }

  function buildOfflineUI() {
    const wrap = $('.wrap') || document.body;

    const banner = make('div', {
      id: 'networkModeBanner',
      style: {
        position: 'sticky',
        top: '0',
        zIndex: '99990',
        margin: '0 0 14px',
        padding: '14px 16px',
        borderRadius: '14px',
        fontSize: '18px',
        fontWeight: '900',
        textAlign: 'center',
        letterSpacing: '.02em',
        boxShadow: '0 3px 16px #0002'
      }
    });

    wrap.insertBefore(banner, wrap.firstChild);

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
    else wrap.insertBefore(card, banner.nextSibling);

    make('div', {
      text: 'Pack de secours iPad',
      style: {fontSize:'18px', fontWeight:'850', marginBottom:'6px'}
    }, card);

    make('div', {
      text: 'À préparer une fois avec une bonne connexion. Ensuite le détourage, la profondeur, le masque et les 9 vues restent disponibles hors ligne.',
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

    const status = make('div', {
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
    updateNetworkBanner();
    updatePackStatus();
  }

  function updateNetworkBanner() {
    const banner = $('#networkModeBanner');
    if (!banner) return;

    if (navigator.onLine) {
      banner.textContent = 'MODE CONNECTÉ — IA EN LIGNE DISPONIBLE';
      banner.style.background = '#dff7e7';
      banner.style.color = '#0c5c29';
      banner.style.border = '2px solid #2c9b52';
    } else {
      banner.textContent = 'MODE LOCAL — HORS LIGNE';
      banner.style.background = '#ffe4cf';
      banner.style.color = '#7b3100';
      banner.style.border = '2px solid #d86b1c';
    }
  }

  async function updatePackStatus(extra = '') {
    const out = $('#offlinePackStatus');
    if (!out) return;

    const ready = localStorage.getItem(PACK_KEY);
    let storage = '';

    try {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        if (Number.isFinite(e.usage)) storage = `\nStockage navigateur utilisé : ${formatMB(e.usage)}.`;
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

  async function sleepMemoryGap() {
    // Laisse Safari terminer les tâches WASM et rendre la mémoire récupérable.
    await new Promise(resolve => setTimeout(resolve, 350));
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

    let estimator = null;
    const url = URL.createObjectURL(testBlob);
    try {
      estimator = await pipeline(
        'depth-estimation',
        'onnx-community/depth-anything-v2-small',
        {dtype:'q4'}
      );
      setStep('Vérification du moteur de profondeur…');
      await estimator(url);
    } finally {
      URL.revokeObjectURL(url);
      try { await estimator?.dispose?.(); } catch (_) {}
      estimator = null;
    }
  }

  async function prepareOfflinePack() {
    if (preparing) return;

    const button = $('#prepareOfflinePack');
    const out = $('#offlinePackStatus');

    if (!navigator.onLine) {
      out.textContent = 'Connexion nécessaire uniquement pour préparer ou réparer le pack hors ligne.';
      return;
    }

    preparing = true;
    button.disabled = true;

    const setStep = msg => {
      out.textContent = `Préparation du pack hors ligne…\n${msg}`;
    };

    try {
      setStep('Activation du stockage local…');
      await registerServiceWorker();

      if (navigator.storage && navigator.storage.persist) {
        try { await navigator.storage.persist(); } catch (_) {}
      }

      // IMPORTANT iPad/Safari : ne pas lancer les pipelines IA ici.
      // Les tests WASM/ONNX simultanés ou successifs peuvent dépasser la mémoire WebAssembly.
      // Le service worker met l'application et les dépendances en cache au fil de leur vrai usage.
      setStep('Mise en cache de l’application…');
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({type:'CACHE_APP_SHELL'});
      }

      // JSZip est léger et peut être préchargé sans créer de session WASM.
      try {
        await fetch('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', {mode:'cors'});
      } catch (_) {}

      // Laisse le service worker finir l'écriture du shell avant de valider.
      await new Promise(resolve => setTimeout(resolve, 900));

      localStorage.setItem(PACK_KEY, new Date().toISOString());
      await updatePackStatus(
        'Application hors ligne prête. Les moteurs IA ne sont plus testés ici pour éviter le dépassement mémoire sur iPad. ' +
        'Pour mettre aussi chaque moteur IA en cache, utilise une fois le détourage et la profondeur en mode connecté ; leurs fichiers seront alors conservés par le cache runtime.'
      );

    } catch (error) {
      console.error('[OFFLINE]', error);
      out.textContent =
        `Pack application incomplet.\n${error?.message || error}\nRelance la préparation avec une connexion stable.`;
    } finally {
      preparing = false;
      button.disabled = false;
    }
  }

  async function boot() {
    buildOfflineUI();

    window.addEventListener('online', () => {
      updateNetworkBanner();
      updatePackStatus('Connexion revenue.');
    });

    window.addEventListener('offline', () => {
      updateNetworkBanner();
      updatePackStatus('Le programme passe en fonctions locales uniquement.');
    });

    try {
      await registerServiceWorker();
    } catch (error) {
      console.warn('[OFFLINE] Service Worker:', error);
      updatePackStatus('Le mode hors ligne nécessite que cette page soit servie en HTTPS depuis HappyHolo/Vercel.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
