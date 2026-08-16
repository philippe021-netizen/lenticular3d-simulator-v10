# Lenticular 3D Simulator

Prototype web automatique : une photo est envoyée à **Stable Fast 3D**, qui reconstruit un véritable modèle 3D texturé (`.glb`). Le navigateur rend ensuite le même objet depuis une micro-orbite de caméra et exporte les vues dans un GIF. Il n'y a ni morphing 2D, ni cross-fade entre vues.

## Pourquoi c'est différent d'un faux effet 3D

- le sujet existe comme **maillage 3D** ;
- les vues gauche/centre/droite sont des rendus du même maillage ;
- le changement de perspective vient d'une **caméra 3D** ;
- la carte peut pivoter en même temps que l'angle de vue ;
- le GIF est construit frame par frame à partir de rendus 3D.

## Installation sur Vercel

1. Créer un projet Vercel à partir de ce dossier.
2. Dans **Settings → Environment Variables**, ajouter `STABILITY_API_KEY`.
3. Déployer.
4. Ouvrir le site, charger une photo et cliquer **Créer la simulation 3D**.

## Moteur et licence

Le prototype utilise l'endpoint officiel `POST /v2beta/3d/stable-fast-3d`. Stable Fast 3D fait partie des modèles 3D couverts par la Stability AI Community License pour les usages commerciaux admissibles selon les conditions en vigueur. Vérifier la licence avant mise en production.

## Limite importante

Une photo unique ne contient pas les zones cachées. Stable Fast 3D reconstruit donc une géométrie plausible. Les animaux très poilus, les sujets partiellement masqués ou les gros plans peuvent produire des erreurs. Pour une carte lenticulaire, garder une amplitude faible (en général ±4° à ±8°) donne un résultat plus crédible.


## V3
Le serveur accepte maintenant `STABILITY_API_KEY`, `CLE_API_STABILITE` et `CLÉ_API_STABILITÉ` afin de contourner les traductions automatiques de l'interface Vercel.
