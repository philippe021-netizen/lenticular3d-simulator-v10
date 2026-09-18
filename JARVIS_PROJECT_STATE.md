# JARVIS — État officiel MicroPlayer

Dernière mise à jour initiale : 2026-09-18
Dépôt : philippe021-netizen/lenticular3d-simulator-v10
Branche active cartes : feature/card-v32-semantic-depth
HEAD observé à l'initialisation : e1cef51ecf

## Règle de vérité
Ce fichier est le registre de reprise de MicroPlayer. Avant toute intervention importante, lire ce fichier puis vérifier l'état réel GitHub/Vercel. Ne jamais confondre « développé », « testé » et « validé par Philippe ».

États autorisés :
IDÉE → À TESTER → TESTÉ → VALIDÉ PHILIPPE → VERROUILLÉ → REMPLACÉ
BLOQUÉ peut être ajouté à toute étape non validée.

Une validation doit idéalement référencer le commit, le test/rendu et la date. Une phase VALIDÉE/VERROUILLÉE ne doit pas être réécrite par une expérimentation sans branche ou sauvegarde dédiée.

## Contraintes permanentes
- Ne jamais modifier main sans instruction explicite.
- Pour V32 cartes, ne jamais modifier V31.
- Production lenticulaire et aperçu esthétique client sont deux sorties distinctes.
- Production : préserver les pixels/textes/logos réels ; aucune régénération IA du contenu de carte.
- Aperçu client : peut être esthétique mais ne devient jamais la source de production.
- Cibles lenticulaires : 50 LPI profondeur/3D et 60 LPI flip/motion ; calibrer le pitch réel pour chaque combinaison feuille/imprimante/média/mode.
- iPad est une plateforme cible majeure.
- Une nouveauté issue de la veille est un CANDIDAT, jamais une validation automatique.

## État V32 cartes au 2026-09-18
Statut global : EN DÉVELOPPEMENT / À TESTER SUR IPAD.

Décisions/implémentations récentes observées dans GitHub :
- 43f7223daf — interdiction de régénération IA des textes/logos.
- 1d5399e9a9 — aperçu trois plans composé à partir des pixels originaux.
- df64adf51b — validation de la scène maître pixels originaux + aperçu couches planes obliques.
- 33d08ef0b5 — séparation vues de production / aperçu client + masques exclusifs.
- a83472d9e3 — exposition des échecs QC maître et verrouillage des deux branches de sortie.
- e1cef51ecf — correction Safari de résolution de variable pour masque exclusif.

Ces commits prouvent l'implémentation, PAS la validation visuelle par Philippe.

## Dernier problème utilisateur connu
La production V32 a rencontré « Can't find variable: best ». Le commit e1cef51ecf annonce une correction Safari liée à la résolution de variable. À vérifier réellement sur iPad avant de considérer le blocage résolu.

## Prochaine reprise
1. Vérifier que le HEAD de feature/card-v32-semantic-depth est toujours celui attendu.
2. Vérifier le dernier déploiement Vercel associé.
3. Tester sur iPad le chemin qui provoquait « Can't find variable: best ».
4. Contrôler séparément :
   - sortie PRODUCTION : aucune duplication, dimensions/disposition originales, textes/logos intacts ;
   - APERÇU CLIENT : profondeur visuellement convaincante sans épaissir textes/logos.
5. Ne passer une étape en VALIDÉ PHILIPPE qu'après validation explicite.

## Routage Jarvis
CHAT : analyse, décision, recherche, diagnostic ciblé, validation avec Philippe.
OUTILS/AGENT : inspection GitHub/Vercel, correction ciblée, tests techniques.
WORK : chantier autonome multi-fichiers, régression complexe, tests + déploiement + itérations.
AUTOMATISATION : veille récurrente technologies/prix/opportunités.

## Commandes conversationnelles attendues
« Jarvis, où en est MicroPlayer ? » → lire ce registre + vérifier GitHub/Vercel et résumer état, blocage, prochaine action.
« Jarvis, reprends MicroPlayer » → même préflight, puis choisir Chat/Outils/Work selon l'ampleur.
« Jarvis, valide cette étape » → enregistrer la validation explicite avec commit/date/preuve.
« Jarvis, qu'est-ce qui a changé ? » → comparer le registre au dépôt/déploiement actuel.
