# LentiPrint Lab v11 — PixVerse → 9 vues

Flux automatisé 60 LPI :
1. Choix d'une photo et d'une action du catalogue configurable.
2. Chargement automatique de la vidéo guide lorsque l'action en possède une.
3. Safe framing local, puis upload de la photo et du guide avec la clé cachée dans Vercel.
4. Routage par capacité : PixVerse Mimic pour les sujets compatibles, sinon Image-to-Video.
5. Suivi persistant du `video_id` jusqu'à la réception du MP4.
6. Analyse du mouvement utile sur toute la durée, y compris les clips courts.
7. Sélection de neuf états visuellement réguliers suivant une seule progression A → B.
8. Recalage spatial, contrôle qualité VERT/ORANGE/ROUGE et export 60 LPI.

L'interface de référence est `happyholo-pixverse-actions-test.html`. Son mode expert
affiche la vidéo guide, le MP4 PixVerse, les images candidates, les neuf vues retenues
et le diagnostic qualité. Un résultat ROUGE bloque l'export automatique.

## Variable Vercel
`PIXVERSE_API_KEY` doit être présente dans Project Settings → Environment Variables.

## API PixVerse utilisée
- POST `/openapi/v2/image/upload`
- POST `/openapi/v2/media/upload`
- POST `/openapi/v2/video/img/generate`
- POST `/openapi/v2/video/mimic/generate`
- GET `/openapi/v2/video/result/{id}`

La clé PixVerse n'est jamais exposée dans le navigateur.

## ExplodeView machines — V3.25

Le Studio principal comprend désormais l'action générique `explodeview` pour motos,
voitures, outils, moteurs, montres et machines. Le flux local est volontairement
structuré autour des grosses pièces :

1. conserver la machine complète dans la première sélection ;
2. ajouter des sélections pour les grands sous-ensembles ;
3. valider les sélections puis choisir le mode Simple, Détaillé ou Technique ;
4. utiliser « Préparer et répartir automatiquement » ;
5. corriger au besoin l'ordre et la direction de chaque pièce ;
6. exporter les neuf vues monotoniques, de l'objet assemblé à la vue éclatée.

La simulation interpole les vues pour rester fluide, mais les fichiers d'impression
restent exactement `vue-01.png` à `vue-09.png`. Les exports ExplodeView utilisent
60 LPI par défaut.

## DepthFlow V42 — moteur multivue

`depthflow-v42-convergence.html` est le studio photo actif de la branche
`feature/integrate-depthflow-v27`. Il conserve une profondeur continue où 0 est
le lointain et 255 le proche, permet d'ancrer le plan zéro par un toucher sur le
sujet, et sépare le relief interne de la parallaxe totale. Une bande de
convergence douce stabilise les visages voisins autour du zéro tout en
redistribuant la profondeur vers le décor. L'ancrage explicite du sujet ou du
groupe est requis avant la première génération. Le rendu des vues utilise un
déplacement avant avec priorité aux pixels proches, puis remplit les zones
désoccluses à partir du fond voisin. La vue 05 est recopiée directement depuis
la photo source et contrôlée octet par octet après chaque génération.

Le chargement de Depth Anything V2, l'inférence WASM et le raffinement guidé
des contours s'exécutent dans `depthflow-v42-worker.js`. Le fil d'interface
reste ainsi disponible pendant le calcul sur iPad. Un repli compatible conserve
l'ancien calcul sur le fil principal si le navigateur refuse les Workers de
module ; le résultat 0–255 et le moteur des neuf vues restent identiques.

## MicroPlayer — Carte 3D Pro

`microplayer-business-card-depthflow.html` combine la reconnaissance des textes,
logos, QR, signatures, illustrations, objets et sujets avec le moteur DepthFlow.
Chaque élément possède un masque corrigeable au Pencil et une hauteur continue
0–255 indépendante. Les textes, logos et QR restent rigides, tandis qu'une photo
ou illustration peut conserver un micro-relief interne issu de DepthFlow. Les
préréglages Pro, Artistique, Découpe papier et QR prioritaire modifient réellement
les neuf vues. La vue 05 reste une copie stricte de la carte de travail.

Tests du cœur de rendu :

```bash
npm test
```
