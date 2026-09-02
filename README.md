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
