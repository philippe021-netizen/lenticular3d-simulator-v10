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
