# Validation PixVerse V3 — test cœur Mimic 720p

Date : 2026-09-24  
Branche : `feature/pixverse-v3-motion-guide`  
Déploiement testé : `dpl_9Wmgn2dYRdSXSqtfpwXwfEtdYRyz`  
Commit testé : `581053f0f0dea5a2b8e1cbaeeb40d9b5fa1c792f`

## Jeu d'essai

- Photo : portrait recadré depuis le fixture d'audit `IMG_5495.jpeg`, 720 × 1280.
- Vidéo guide : `MicroPlayer_guide_coeur_3s_FLUIDE.mp4`, 3,000 s.
- Action : `coeur_mains_v2`.
- Mode : PixVerse Mimic / Motion Control.
- Qualité : 720p.
- Nombre d'appels payants : 1.

## Résultat PixVerse

- `video_id` : `426192990981568`
- Sortie : H.264, 704 × 1280, 30 fps, 3,000 s.
- Crédits avant : 2 116.
- Crédits après : 2 080.
- Coût réel : 36 crédits.
- Pic de score de changement de scène FFmpeg : 0,099547 à 2,700 s.
- Aucun nouvel essai automatique n'a été déclenché.

## Résultat MicroPlayer

QC automatique : **VERT**

- 9 vues produites.
- Fenêtre utile : 0,050–2,850 s.
- Progression finale : 0,07632.
- Pic de progression : 0,07632.
- Retour B→A détecté : non.
- Temps retenus : 0,050 ; 0,334 ; 0,845 ; 1,595 ; 2,458 ; 2,663 ; 2,701 ; 2,738 ; 2,850 s.

Inspection visuelle :

- identité et visage cohérents sur les 9 vues ;
- tête quasi fixe ;
- décor et cadrage stables ;
- mouvement concentré sur les bras et les mains ;
- cœur absent au départ et complet dans les dernières vues ;
- aucune substitution par le sujet de la vidéo guide ;
- aucune coupure de tête ou de mains.

## Conclusion

Le chemin déployé Photo → Mimic → MP4 → analyse MicroPlayer → 9 vues → simulateur lenticulaire fonctionne de bout en bout sur le cas de référence cœur avec les mains. La sélection par progression visuelle évite l'échantillonnage temporel uniforme et conserve une séquence A→B sans retour.
