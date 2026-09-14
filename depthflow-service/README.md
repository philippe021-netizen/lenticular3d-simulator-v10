# MicroPlayer — DepthFlow service prototype

Prototype isolé pour le test `depthflow-test.html`.

## Contrat

- `GET /health`
- `POST /render9`

Entrée JSON : `image` (data URL), `depth_strength`, `camera_amplitude`, `views=9`, `center_original=true`.
Sortie : tableau `views` contenant exactement 9 PNG encodés en data URL.

## Principe

Le moteur crée un passage caméra horizontal monotone gauche → droite avec DepthFlow, rendu à 9 fps pendant 1 seconde. Les 9 images sont extraites avec FFmpeg. La vue 05 est ensuite remplacée par l'image source normalisée pour garantir la règle MicroPlayer `vue 05 = original`.

## Déploiement

Le dossier est prévu pour un hébergeur Docker disposant d'OpenGL et idéalement d'un GPU. Build avec le `Dockerfile`, puis exposer le port 8000.

Dans Vercel, définir :

- `DEPTHFLOW_SERVICE_URL=https://<service>/render9`
- `DEPTHFLOW_SERVICE_TOKEN=<optionnel>`

Si un token est défini sur le service, utiliser la même valeur côté Vercel.

## Important

Ceci reste un prototype technique. Avant intégration au studio principal il faut valider :

1. ordre strict gauche → droite des 9 vues ;
2. vue 05 identique à l'original ;
3. absence de déformations gênantes sur visage, texte et contours fins ;
4. gain visuel réel face à Immersity ;
5. réglages d'amplitude adaptés au 50 LPI.

DepthFlow est distribué sous licence AGPL-3.0 : vérifier les obligations de licence avant usage commercial public.
