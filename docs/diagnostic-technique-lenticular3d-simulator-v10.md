# Diagnostic technique complet — lenticular3d-simulator-v10

> Périmètre respecté lors de l’analyse : lecture seule. Aucun fichier applicatif n’a été modifié, créé ou supprimé. Aucun commit n’a été créé au moment du diagnostic.

## Conclusion exécutive

Le dépôt contient plusieurs pipelines concurrents plutôt qu’un moteur 3D unique stabilisé.

1. Le pipeline ouvert par défaut dans le hub est `relief3d-test-v31.html` avec `relief-engine-v31.js`. Il fait : photo → détourage → fond reconstruit localement → profondeur monoculaire → parallaxe 2D → 9 PNG → ZIP. 【F:index.html†L23-L29】【F:relief3d-test-v31.html†L71-L98】

2. `happyholo-tiefling-v15.html` est un pipeline alternatif qui sépare davantage sujet et fond et calcule deux profondeurs, mais reste fondé sur du warping image-space susceptible de tordre les sols et décors structurés.

3. Des prototypes Tiefling V20/V21 et `tiefling-fullphoto-test.html` coexistent. Le test photo entière ne sépare pas sujet et fond.

4. De nombreux scripts redéfinissent `window.renderAt`, notamment la composition avancée et ExplodeView ; le résultat final dépend donc de l’ordre de chargement. 【F:relief3d-test-v31.html†L84-L98】【F:composition-advanced-v350.js†L115-L145】【F:explodeview-machines-v380.js†L102-L115】

Le défaut structurel du moteur par défaut est que le sujet et le fond sont séparés comme calques visuels, sans être traités comme deux géométries 3D cohérentes. Le sujet est surtout translaté horizontalement avec une légère déformation par bandes verticales ; le fond est surtout translaté comme une plaque. Cela explique les glissements, les incohérences de contact au sol et les déformations localisées.

## 1. Architecture générale du dépôt

Le projet est une application Web statique en HTML et JavaScript vanilla. `package.json` ne déclare ni framework front-end ni scripts de build, seulement les métadonnées du package et le mode ES modules. 【F:package.json†L1-L6】

• `index.html` : hub/routeur avec chargement des modules dans un iframe.

• `relief3d-test-v31.html` et `relief-engine-v31.js` : pipeline Photo & relief local par défaut.

• `happyholo-tiefling-v15.html` et `tiefling-dual-worker.js` : pipeline sujet/fond avec profondeur Tiefling/ONNX.

• `happyholo-tiefling-v16.html` à `happyholo-tiefling-v21.html`, `tiefling-v20-*.js`, `tiefling-v21-*.js`, `tiefling-fullphoto-test.html` : variantes et prototypes Tiefling.

• `glb-3d-studio.html` : pipeline GLB avec vraie caméra 3D.

• `custom-background-v338.js`, `composition-advanced-v350.js`, `background-multiselect-engine.js`, `mask-editor-v315-panfix.js`, `action-preview-engine.js`, `explodeview-machines-v380.js` : extensions du moteur Relief.

• `api/` : handlers Vercel pour PixVerse, OpenAI, fond IA et ExplodeView.

• `modules/` : extraction vidéo, clients PixVerse et utilitaires réutilisables.

• `tests/` : tests Node ; `docs/` : documentation ; `backups/` : sauvegardes non exécutées.

Le README décrit le flux PixVerse : upload d’une photo, génération vidéo Image-to-Video, analyse de 49 instants, sélection de 9 instants distincts et export ZIP. 【F:README.md†L3-L12】

## 2. Point d’entrée de l’application

Le point d’entrée est `index.html`. Il construit le hub, les onglets et charge les modules dans l’iframe. 【F:index.html†L18-L18】【F:index.html†L44-L54】

La route initiale `photo` charge `./relief3d-test-v31.html?embed=1&v=406` : le moteur Relief V31 est donc celui réellement présenté en premier. 【F:index.html†L23-L29】

Les routes `cutout`, `local-actions`, `supports` et `explode` réutilisent ce même fichier puis le font défiler vers la zone voulue. La route `tiefling15` est secondaire. 【F:index.html†L25-L39】

## 3. Rôle des principaux fichiers et dossiers

### Hub et moteur Relief

• `index.html` : navigation, routeur, iframe, route conservée en session et état de santé API. 【F:index.html†L23-L54】

• `relief3d-test-v31.html` : interface import/réglages/export ; charge les extensions. 【F:relief3d-test-v31.html†L71-L98】

• `relief-engine-v31.js` : chargement, détourage, masque alpha, reconstruction de fond, profondeur, rendu, neuf vues et ZIP. 【F:relief-engine-v31.js†L73-L90】【F:relief-engine-v31.js†L110-L195】【F:relief-engine-v31.js†L268-L307】【F:relief-engine-v31.js†L362-L388】

### Tiefling

• `happyholo-tiefling-v15.html` : moteur autonome sujet/fond avec détourage, fond reconstruit, deux inférences profondeur, warping et ZIP.

• `tiefling-dual-worker.js` : worker ONNX Runtime Web ; préparation tenseur, exécution WebGPU/WASM, fallback WASM, post-traitement. 【F:tiefling-dual-worker.js†L13-L53】【F:tiefling-dual-worker.js†L55-L110】

• `happyholo-tiefling-v21.html` et `tiefling-v21-*.js` : surcouches d’injection runtime sur V15, pas un moteur isolé.

• `tiefling-fullphoto-test.html` : test à une carte de profondeur pour la photo entière, sans séparation du sujet.

### Extensions Relief

• `mask-editor-v315-panfix.js` : correction manuelle de masque et sélections.

• `custom-background-v338.js` : fonds A/B, cover/contain, zoom/décalage du fond, zoom/décalage du sujet. 【F:custom-background-v338.js†L7-L75】

• `composition-advanced-v350.js` : remplace `window.renderAt` et ajoute zoom/X/Y/yaw/pitch/mouvement et objets de fond. 【F:composition-advanced-v350.js†L115-L145】

• `background-multiselect-engine.js` : plusieurs objets de fond avec translation, zoom, yaw et pitch. 【F:background-multiselect-engine.js†L11-L19】

• `background-object-editor-ipad-fix.js` : éditeur tactile de zones de fond.

• `action-preview-engine.js` : yaw, rotations, ExplodeView, glint et clin d’œil.

• `explodeview-machines-v380.js` : rendu dédié aux machines, qui remplace le rendu normal si actif. 【F:explodeview-machines-v380.js†L102-L115】

• `v311-monotonic-patch.js` : export support, densité PNG et manifeste. 【F:v311-monotonic-patch.js†L1-L6】【F:v311-monotonic-patch.js†L217-L231】

### APIs et modules

`api/pixverse-upload.js`, `api/pixverse-create.js`, `api/pixverse-status.js` et `api/pixverse-video.js` gèrent l’upload, la création et le proxy vidéo PixVerse. `api/explodeview-openai.js`, `api/explodeview-step.js`, `api/explodeview-auto.js` servent aux étapes IA ExplodeView. `modules/video-frame-extractor.js` et ses variantes traitent l’extraction/évaluation de frames vidéo.

## 4. Fichiers par responsabilité

### Chargement image

`relief-engine-v31.js`, fonction `loadSourceFile(nextFile)`, convertit le `File` en `Image`, ajuste le canvas de prévisualisation et conserve `sourceImg`. 【F:relief-engine-v31.js†L316-L328】

### Détourage et masque

`relief-engine-v31.js`, fonction `localRemoveBackground(file)`, charge `@imgly/background-removal@1.7.0`, utilise `isnet_quint8` sur CPU et produit un sujet transparent. 【F:relief-engine-v31.js†L73-L90】 La fonction `makeAlphaCanvas(subject)` extrait l’alpha dans un canvas monochrome. 【F:relief-engine-v31.js†L92-L108】 Les retouches manuelles passent par `mask-editor-v315-panfix.js`.

### Profondeur

`relief-engine-v31.js`, fonctions `getEstimator()` et `estimateDepth()`, charge `@huggingface/transformers@3.8.1` et `onnx-community/depth-anything-v2-small` quantifié q4. 【F:relief-engine-v31.js†L197-L205】【F:relief-engine-v31.js†L237-L266】 `fallbackDepth()` applique une heuristique luminance/position si l’inférence échoue. 【F:relief-engine-v31.js†L208-L228】

`tiefling-dual-worker.js` prépare l’entrée RGB float32 `[1, 3, size, size]`, exécute l’ONNX et normalise la carte de profondeur en niveaux de gris 0–255. 【F:tiefling-dual-worker.js†L13-L53】

### Parallaxe, mouvement et rotation

`relief-engine-v31.js`, `renderAt(norm, target)`, gère la translation du fond, la translation du sujet et la déformation par bandes verticales. 【F:relief-engine-v31.js†L268-L307】 `composition-advanced-v350.js`, `advancedRender(norm, target)`, ajoute yaw/pitch affine et remplace ce rendu. 【F:composition-advanced-v350.js†L118-L145】 `explodeview-machines-v380.js`, `explodeRender()`, remplace le rendu pour les machines. 【F:explodeview-machines-v380.js†L102-L115】

### Fond

`relief-engine-v31.js`, `reconstructBackground(original, alphaCanvas)`, remplit la zone retirée par diffusion des voisins et applique un flou. 【F:relief-engine-v31.js†L110-L195】 `custom-background-v338.js`, `draw()`, gère les fonds A/B. 【F:custom-background-v338.js†L21-L35】 `background-multiselect-engine.js`, `drawOne()`, isole et transforme des objets de fond. 【F:background-multiselect-engine.js†L17-L19】

### Neuf vues et export

`relief-engine-v31.js`, handler `#export`, utilise les poses `[-1, -.75, -.5, -.25, 0, .25, .5, .75, 1]`, appelle `renderAt()` neuf fois et produit les PNG. 【F:relief-engine-v31.js†L362-L373】 Le handler `#download` écrit `vue-01.png` à `vue-09.png` et `manifest.json`. 【F:relief-engine-v31.js†L375-L388】

Il n’y a pas d’export GIF identifié pour le pipeline Relief/Tiefling. Le flux PixVerse manipule des MP4 ; `api/pixverse-video.js` retourne une vidéo avec `video/mp4` par défaut. 【F:api/pixverse-video.js†L60-L83】 Le moteur Relief local n’exporte pas les neuf vues en MP4.

## 5. Chemin exact : import photo vers neuf images finales

1. `index.html` démarre la route `photo` et charge `relief3d-test-v31.html`. 【F:index.html†L23-L29】【F:index.html†L44-L54】

2. L’utilisateur sélectionne la photo via `#file`. 【F:relief3d-test-v31.html†L71-L78】

3. `loadSourceFile()` charge la photo dans `sourceImg` et prépare le canvas. 【F:relief-engine-v31.js†L316-L328】

4. `buildRelief()` appelle `localRemoveBackground(sourceFile)` et produit `subjectImg`. 【F:relief-engine-v31.js†L330-L338】

5. `makeAlphaCanvas(subjectImg)` produit le masque alpha. 【F:relief-engine-v31.js†L92-L108】

6. `estimateDepth(sourceImg, ...)` calcule une seule profondeur sur l’original entier. 【F:relief-engine-v31.js†L339-L341】

7. `backgroundDepthCanvas = subjectDepthCanvas` : le fond et le sujet n’ont pas deux profondeurs indépendantes. 【F:relief-engine-v31.js†L339-L345】

8. `reconstructBackground(sourceImg, subjectAlphaCanvas)` produit `backgroundImg`. 【F:relief-engine-v31.js†L343-L346】

9. L’état est publié via `window.HappyHoloReliefState`. 【F:relief-engine-v31.js†L345-L346】

10. Les extensions peuvent prendre la main sur le rendu. 【F:relief3d-test-v31.html†L84-L98】

11. `renderAt()` ou un remplacement rend les vues pour les neuf phases. 【F:relief-engine-v31.js†L362-L373】

12. Le ZIP contient les neuf PNG et un manifeste. 【F:relief-engine-v31.js†L375-L388】

## 6. Algorithmes utilisés pour l’effet 3D

### Relief V31

Le moteur par défaut ne reconstruit pas de géométrie 3D. Il combine une translation de fond, une translation de sujet et une correction de 96 bandes verticales selon une profondeur échantillonnée à hauteur fixe. 【F:relief-engine-v31.js†L268-L307】

Les formules sont :

    const amplitude = Number(angle.value) / 4;

    const bgK = Number(bgDepth.value) / 0.10;

    const subK = Number(subjectDepth.value) / 0.30;

    const bgShift = norm * 6 * amplitude * bgK;

    const subShift = norm * 18 * amplitude * subK;

【F:relief-engine-v31.js†L277-L291】

Chaque bande du sujet échantillonne la profondeur à `dy = hauteur * .52`, puis applique une correction latérale. 【F:relief-engine-v31.js†L294-L305】 C’est une parallaxe 2.5D simplifiée, non une projection de caméra sur une scène 3D.

### Reconstruction fond

Le remplissage de fond est une diffusion locale des couleurs voisines suivie d’un flou. Il ne comprend ni les lignes de fuite, ni les routes, ni la perspective, ni les zones cachées derrière le sujet. 【F:relief-engine-v31.js†L131-L194】

### Tiefling dual

Tiefling V15 utilise un sujet détouré, un fond reconstruit et deux cartes de profondeur. Il warpe le fond par profondeur et applique déplacement/pivot/volume au sujet. C’est plus proche du besoin, mais reste du warping de pixels sans géométrie, occlusions nouvelles fiables ni plan de sol explicite.

### GLB

`glb-3d-studio.html` utilise une vraie caméra et une géométrie 3D ; c’est la seule voie avec rotation réellement cohérente, mais elle demande un GLB et ne convertit pas une photo seule en scène 3D.

## 7. Sources probables des défauts observés

### Déformation visage ou sujet

`renderAt()` découpe le sujet en 96 bandes verticales. La profondeur de chaque bande est lue à une seule hauteur, ce qui peut provoquer cisaillement, accordéon et cassures sur visage, bras, vêtements ou cheveux. 【F:relief-engine-v31.js†L288-L305】

Le redessin du sujet complet en transparence sert de stabilisation visuelle :

    x.globalAlpha = 0.24 + protect * 0.28;

    x.drawImage(tmp, subShift, 0);

Il peut masquer des défauts mais aussi créer du doublage et de la rémanence. 【F:relief-engine-v31.js†L303-L305】

`composition-advanced-v350.js` ajoute une matrice affine avec `Math.tan(yaw)`/`Math.tan(pitch)`, susceptible de cisailler une image plane au lieu de simuler une rotation réelle. 【F:composition-advanced-v350.js†L126-L139】

### Étirement ou tordage du décor

Dans Relief V31, le fond est surtout translaté, mais la reconstruction locale du fond remplace les pixels cachés par diffusion/flou. Cela casse les routes, carrelages, murs, murets, ombres et lignes de fuite. 【F:relief-engine-v31.js†L131-L194】

Les objets de fond sélectionnés reçoivent translation, zoom, yaw et pitch ; ils peuvent se tordre visuellement. 【F:background-multiselect-engine.js†L17-L19】

Dans Tiefling et le test photo entière, le warping selon une profondeur monoculaire bruitée peut déformer localement les sols, routes et décors structurés.

### Route, sol, podium ou muret incohérents

Le pipeline Relief V31 ne détecte pas de sol, de ligne d’horizon, de plan, de contacts sujet-sol ni d’ombre. Il applique seulement les déplacements : fond `norm * 6 * ...`, sujet `norm * 18 * ...`. 【F:relief-engine-v31.js†L277-L303】 Le sujet peut donc se déplacer plus vite que le décor sans relation de perspective ou d’ancrage.

### Impression de glissement du sujet

C’est le comportement attendu du code : le sujet reçoit principalement une translation horizontale globale `subShift`, et le relief interne est faible. Il n’y a ni pivot autour des pieds, ni variation de perspective du sol, ni occlusion cohérente. 【F:relief-engine-v31.js†L291-L305】

### Incohérence sujet/fond

La cause principale est :

    subjectDepthCanvas = await estimateDepth(sourceImg, ...);

    backgroundDepthCanvas = subjectDepthCanvas;

【F:relief-engine-v31.js†L339-L345】

La profondeur est unique et calculée avant la suppression du sujet. Ensuite, `renderAt()` ne fait pas de parallaxe locale à partir de `backgroundDepthCanvas` : `bgDepth` ne règle qu’une translation globale du fond. 【F:relief-engine-v31.js†L277-L285】

## 8. Sujet et fond : traitement séparé ou non ?

### Réponse courte

Oui, séparés comme images/couches ; non, pas séparés de façon complète pour la profondeur et la géométrie dans le moteur principal.

### Relief V31

`subjectImg` est un PNG détouré et `backgroundImg` est le fond reconstruit. 【F:relief-engine-v31.js†L330-L345】 Ils sont rendus comme deux calques distincts. 【F:relief-engine-v31.js†L281-L305】

Mais la profondeur est calculée une seule fois sur l’original, et le fond reçoit la même référence de carte de profondeur que le sujet. 【F:relief-engine-v31.js†L339-L345】 Le fond n’est pas réellement reprojeté selon une profondeur propre et le sujet n’est pas ancré à un sol.

### Tiefling V15

Oui, plus réellement : sujet détouré, fond reconstruit, profondeur sujet, profondeur fond et paramètres propres aux deux calques. C’est l’architecture la plus proche du besoin, avec les limites du warping image-space.

### Tiefling photo entière

Non : une seule photo et une seule profondeur, sans détourage.

## 9. Paramètres qui contrôlent l’amplitude entre les neuf vues

Dans `relief3d-test-v31.html` : 【F:relief3d-test-v31.html†L73-L78】

Les formules correspondantes se trouvent dans `renderAt()`. 【F:relief-engine-v31.js†L277-L305】 Les neuf phases sont fixes : `-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1`. 【F:relief-engine-v31.js†L362-L369】

Paramètres additionnels : zoom/X/Y sujet, zoom/X/Y/cadrage fonds A/B, yaw/pitch, objets de fond et paramètres ExplodeView. 【F:custom-background-v338.js†L38-L75】【F:composition-advanced-v350.js†L15-L39】【F:background-multiselect-engine.js†L11-L19】

## 10. Les 10 fichiers prioritaires à modifier ensuite

1. `relief-engine-v31.js` — moteur par défaut, priorité absolue.

2. `relief3d-test-v31.html` — interface et ordre de chargement des extensions. 【F:relief3d-test-v31.html†L73-L98】

3. `happyholo-tiefling-v15.html` — meilleur prototype de séparation sujet/fond.

4. `tiefling-dual-worker.js` — inférence et normalisation profondeur. 【F:tiefling-dual-worker.js†L55-L110】

5. `custom-background-v338.js` — composition sujet/fond et placement. 【F:custom-background-v338.js†L38-L75】

6. `composition-advanced-v350.js` — transformations affine et remplacement du rendu. 【F:composition-advanced-v350.js†L115-L145】

7. `background-multiselect-engine.js` — objets de fond et risques de déformation. 【F:background-multiselect-engine.js†L17-L19】

8. `mask-editor-v315-panfix.js` — précision du masque autour des détails et contacts.

9. `v311-monotonic-patch.js` — export de production. 【F:v311-monotonic-patch.js†L217-L231】

10. `index.html` — changement futur de moteur principal. 【F:index.html†L23-L29】

## Plan d’amélioration proposé — aucune modification incluse

### Étape 1 — Unifier le moteur de production

Choisir entre refondre Relief V31, promouvoir Tiefling dual, ou créer un moteur unique. Éliminer les remplacements concurrents de `window.renderAt`. Définir un contrat de données unique : original, sujet RGBA, fond, profondeur sujet, profondeur fond, modèle de sol, neuf frames.

### Étape 2 — Séparer réellement sujet et fond

Calculer une profondeur propre sur le sujet détouré et une profondeur propre sur le fond. Ne plus partager une même carte. Ajouter une carte de confiance et gérer explicitement les zones révélées derrière le sujet.

### Étape 3 — Remplacer les bandes verticales

Supprimer l’approche `strips=96`. Utiliser une reprojection pixel-à-pixel ou un maillage de profondeur, interpolation bilinéaire, gestion des trous/occlusions et protection rigide des régions faciales lorsque la profondeur est incertaine.

### Étape 4 — Modéliser le sol et l’ancrage

Détecter ou faire sélectionner sol, ligne d’horizon et points de contact. Verrouiller pieds/roues/socle, synchroniser le sujet avec le plan, et traiter l’ombre de manière cohérente.

### Étape 5 — Protéger le décor structuré

Segmenter les plans de route/sol/mur/podium. Appliquer une transformation de plan cohérente et limiter le warping de profondeur sur ces zones. Utiliser un inpainting adapté, ou limiter le mouvement quand le décor caché ne peut pas être reconstitué fidèlement.

### Étape 6 — Définir une caméra virtuelle

Conserver neuf poses symétriques autour de la vue centrale originale, avec une baseline réglable. Déduire les déplacements relatifs de la profondeur, valider continuité, monotonicité, stabilité sujet/fond et fidélité de la vue centrale.

### Étape 7 — Isoler les modules secondaires

Faire de fonds A/B, objets de fond, actions, ExplodeView, texte, supports et PixVerse des post-traitements explicitement ordonnés, sans redéfinition silencieuse du moteur de base.

### Étape 8 — Ajouter des tests visuels

Créer des références pour portrait, personne en pied sur route, sujet assis, animal au sol, véhicule, objet sur podium et décor architectural. Mesurer stabilité du visage, continuité de contour, ancrage au sol, dérive sujet/fond, déformation des lignes et monotonie des neuf vues.

## Vérifications effectuées lors du diagnostic

• ✅ `node --check relief-engine-v31.js && node --check tiefling-dual-worker.js && node --check composition-advanced-v350.js && node --check custom-background-v338.js && node --check v311-monotonic-patch.js && node --check background-multiselect-engine.js && node --check action-preview-engine.js && node --check explodeview-machines-v380.js`

• ✅ `node --test tests/video-frame-extractor-progressive.test.mjs`

• ✅ `git status --short --branch`

• ✅ `git diff --check`

• ✅ `git diff --exit-code`
