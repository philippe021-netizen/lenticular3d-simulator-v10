# JARVIS — État permanent MicroPlayer

Dernière mise à jour : 2026-09-18
Projet : MicroPlayer
Dépôt : philippe021-netizen/lenticular3d-simulator-v10
Branche active obligatoire : feature/card-v32-semantic-depth
Branches protégées : main et V31 — ne jamais modifier.

## Règle de reprise
À chaque fois que Philippe appelle « Jarvis » pour MicroPlayer :
1. Lire ce fichier AVANT toute modification.
2. Vérifier la branche réelle, les derniers commits et le dernier déploiement Vercel.
3. Reprendre à la section « PROCHAINE ACTION ».
4. Ne jamais considérer un commit comme validé uniquement parce qu'il compile.
5. Après chaque étape significative, mettre à jour ce fichier.
6. États autorisés : EN COURS / TESTÉ IPAD / VALIDÉ / REJETÉ.
7. Ne jamais écraser une version VALIDÉE sans conserver son commit de retour.

## Objectif V32 cartes de visite
Transformer une photo/image de carte de visite en scène 2.5D lenticulaire propre.
Comprendre d'abord le document (OCR + sémantique), puis créer environ 8–15 groupes cohérents.
Les textes/logos sont des plans plats : aucune extrusion/épaisseur artificielle.
Supprimer les éléments mobiles de la carte source, reconstruire un fond_master propre, puis recomposer les mêmes pixels RGBA originaux.
Production = 9 vues déterministes séparées.
Aperçu client IA = esthétique et totalement séparé de la production.

## Architecture décidée
source rectifiée
→ OCR / compréhension sémantique
→ groupes + masques
→ masque union de suppression
→ reconstruction fond_master
→ calques RGBA originaux
→ profondeur/parallaxe
→ 9 vues déterministes
→ QC
→ ZIP.

Règle absolue : ne jamais déplacer un texte/logo devant un fond qui contient encore ce même texte/logo.

## État actuel
Statut global : EN COURS — BLOQUÉ SUR L'APPEL IA / PIPELINE.
Dernier symptôme iPad signalé : « PRODUCTION BLOQUÉE — Load failed ».
Les tentatives précédentes de rendre le QC non bloquant n'ont pas encore produit un parcours iPad validé.

## Travail effectué récemment
- Reconstruction navigateur d'un fond maître à partir du masque de suppression.
- Ajout d'un remplissage edge-directed avec fallback.
- Export prévu de fond_master_final.png et mask-all-removal.png.
- QC : chevauchements, résidu fond, trous non reconstruits.
- Le QC de résidu a été rendu informatif plutôt que bloquant.
- L'échec réseau IA a été modifié pour tenter de conserver la production locale.
- Aucun de ces derniers changements ne doit être marqué VALIDÉ tant qu'un test iPad réel n'a pas réussi de bout en bout.

## Commits récents à connaître
1a1b472ddca783af99b3d76f22bfb9f447996ad7 — reconstruction fond propre.
e9d71aa25804ebbea00e7e064cd1144d09db8bac — correction QC + export fond_master/mask.
7ef6916ee6542b5d4df23414eeec617e5e0f1766 — QC diagnostic non bloquant.
de34bb8f87825a5bf5b6b83007f26dc067a75fd3 — suppression barrières QC IA/composition.
fff4df219e954294dfa528f49cca3f3438fb6911 — fallback après échec réseau IA.
État de ces commits : EN COURS / non validés iPad.

## Résultat ZIP de référence précédent
Ancien ZIP analysé : source 1053×1053, 5 groupes, 3 vues réellement exportées malgré manifest viewCount=9.
vue-02 était identique pixel pour pixel à source-carte.png.
Pas de fond_master dans cet ancien export.
Cause du dédoublement : déplacement de calques devant la carte originale non nettoyée.

## Ce qui est VALIDÉ conceptuellement
- Séparer production déterministe et démonstration client IA.
- Fond maître unique et immuable.
- Calques graphiques/textuels plats.
- Pixels des éléments acceptés verrouillés entre vues.
- Pas de 9 images IA indépendantes.
- 50 LPI pour profondeur/3D ; 60 LPI pour flip/motion.
- Pitch réel à calibrer, ne pas supposer que LPI nominal = pitch exact.

## Ce qui N'EST PAS encore validé techniquement
- Reconstruction visuellement propre du fond_master.
- Appel /api/card-layer-analyze fiable sur le déploiement iPad.
- Parcours complet sans blocage.
- 9 fichiers vue-01 à vue-09 réellement générés/exportés.
- Qualité lenticulaire finale sans dédoublement.
- Aperçu client IA final.

## PROCHAINE ACTION
Ne plus ajouter de patch à l'aveugle.
1. Vérifier le déploiement Vercel correspondant au dernier commit.
2. Inspecter logs/runtime de /api/card-layer-analyze et déterminer la cause exacte de « Load failed ».
3. Vérifier que l'iPad charge bien le nouveau déploiement et non un alias/cached deployment antérieur.
4. Corriger la cause réseau/runtime.
5. Tester le parcours complet.
6. Obtenir enfin un ZIP avec fond_master_final.png + mask-all-removal.png + 9 vues.
7. Analyser visuellement/pixellement le fond maître avant de poursuivre les réglages de profondeur.

## Discipline Jarvis
Après chaque session :
- inscrire le dernier commit ;
- inscrire le dernier déploiement testé ;
- noter exactement ce qui fonctionne ;
- noter exactement ce qui échoue ;
- marquer les essais rejetés pour ne pas les recommencer ;
- définir UNE prochaine action concrète.
