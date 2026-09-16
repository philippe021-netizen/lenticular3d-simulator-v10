# LentiPrint Lab v11 — PixVerse → 9 vues

Flux automatisé :
1. Upload d'une photo.
2. Envoi serveur à PixVerse (clé cachée dans Vercel).
3. Génération Image-to-Video V6, 720p, 5 s.
4. Suivi du `video_id` jusqu'à la vidéo terminée.
5. Analyse locale de 49 instants de la vidéo.
6. Sélection de 9 instants distincts avec garde-fou de couverture temporelle.
7. Détection des transitions trop proches.
8. Export `vue-01.png` à `vue-09.png` + `manifest.json` dans un ZIP.

## Variable Vercel
`PIXVERSE_API_KEY` doit être présente dans Project Settings → Environment Variables.

## API PixVerse utilisée
- POST `/openapi/v2/image/upload`
- POST `/openapi/v2/video/img/generate`
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

Tests du cœur de rendu :

```bash
npm test
```
