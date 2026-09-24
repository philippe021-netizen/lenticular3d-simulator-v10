# Validation PixVerse Motion Guide

Date : 2026-09-23
Branche : `feature/pixverse-v3-motion-guide-audit`
Base préservée : `origin/feature/pixverse-v2-controls` (`29d309c5`)

## Architecture validée

- catalogue d'actions JSON normalisé et extensible ;
- safe framing avant upload, calculé selon le cadrage et l'amplitude du geste ;
- routage automatique vers PixVerse Mimic pour les guides et sujets compatibles ;
- stockage local de la tâche PixVerse pour permettre sa récupération ;
- analyse de la fenêtre de mouvement utile et sélection de neuf états par progression visuelle ;
- stabilisation réelle des translations avec surcadre minimal, diagnostic VERT/ORANGE/ROUGE et blocage des exports ROUGES ;
- manifeste d'export `motion`, neuf vues exactes et 60 LPI, distinct du relief 50 LPI.

Les envois de guide sont mis en cache par empreinte SHA-256, les tâches en cours sont
reprises après rechargement, et le mode expert affiche les candidats réellement analysés
avec leur temps, progression, score de saut et motif de sélection/rejet.

## Mesures des vidéos d'audit

La commande reproductible est `scripts/audit-pixverse-fixtures.sh VIDEO...`.

| Vidéo | Rôle | Pic de coupure de scène | Diagnostic |
| --- | --- | ---: | --- |
| `MicroPlayer_guide_coeur_3s_FLUIDE.mp4` | guide B | 0,011581 | mouvement continu |
| `PixVerse_V5.6_Mimic_720P.mp4` | résultat B | 0,016446 | continuité conservée |
| `PixVerse_V6_Fusion_720P_image1__video1.mp4` | ancien essai Fusion | 0,847326 à 2,4 s | rupture et remplacement de scène |

Ces mesures justifient le retrait du routage guide → Omni/Fusion et l'emploi de
Mimic lorsque la capacité PixVerse et le type de sujet le permettent.

## Comparaison A / B / C

| Variante | État de validation | Conclusion |
| --- | --- | --- |
| A — PixVerse sans guide | aucune sortie strictement comparable fournie | aucune amélioration chiffrée B/A revendiquée |
| B — PixVerse avec guide Mimic | fixture disponible | pas de rupture de scène détectée ; identité à vérifier visuellement sur chaque génération |
| C — B après MicroPlayer | tests automatisés | neuf temps croissants, progression A → B, exclusion des retours et QC d'export |

La stabilité anatomique des mains, l'identité faciale et les vêtements restent des
contrôles nécessitant des métriques de vision ou une validation visuelle en mode expert.
Le moteur ne présente donc jamais ces dimensions comme validées lorsqu'elles n'ont pas
été mesurées.

## Cas du catalogue

| Action | Guide | Route actuelle | État |
| --- | --- | --- | --- |
| Cœur avec les mains | `heart-hands-3s.mp4` | Mimic automatique | référence prête |
| Petit salut | à fournir | Image-to-Video jusqu'au guide | configuration prête |
| Bisou de la main | à fournir | Image-to-Video jusqu'au guide | configuration prête |
| Objet tenu, mouvement simple | à fournir | Image-to-Video ; Mimic non forcé | configuration prête |

Pour le salut et le bisou, l'ajout d'un guide compatible dans le mode expert active
Mimic automatiquement. Sans guide, le repli reste Image-to-Video. L'objet reste en
Image-to-Video car PixVerse Mimic n'est pas activé automatiquement pour cette classe.

## Résultats automatisés

- suite ciblée PixVerse/MicroPlayer : **39/39 réussis** ;
- suite complète du dépôt : **81/86 réussis** ;
- cinq échecs historiques inchangés concernent exclusivement les contrats Carte V32/V33
  (interpolation du simulateur, cadence d'animation, manifeste carte, bouton relief et
  retrait du masque faible) ;
- syntaxe du module d'interface et du service worker validée ;
- page, catalogue et guide servis correctement par le serveur HTTP local.

Le navigateur cloud de vérification bloque les adresses locales ; la validation visuelle
iPad doit donc être réalisée sur une prévisualisation publiée, après autorisation de push.

## Smoke test externe autorisé

Un seul appel PixVerse Mimic 720p a été réalisé manuellement sur le cas de référence
« cœur avec les mains » :

- `video_id` : `426192990981568` ;
- durée : 3,000 s, H.264, 704 × 1280, 30 i/s ;
- coût réel : 36 crédits (`2116 → 2080`) ;
- fenêtre utile MicroPlayer : 0,050–2,850 s ;
- progression finale et pic : 0,07632 ;
- neuf temps retenus : 0,050 ; 0,334 ; 0,845 ; 1,595 ; 2,458 ; 2,663 ;
  2,701 ; 2,738 ; 2,850 s ;
- retour B → A détecté : non ;
- diagnostic automatique : VERT pour les métriques disponibles.

L'inspection visuelle confirme un cœur formé seulement dans les dernières vues, avec
visage, tête, cadrage et décor cohérents. Elle ne remplace pas un fournisseur de
landmarks visage/mains : en son absence, ces métriques anatomiques restent explicitement
indisponibles et ne doivent pas être présentées comme certifiées automatiquement.

Les tests locaux, les fixtures et la validation du contrat API ne lancent jamais de
génération payante.
