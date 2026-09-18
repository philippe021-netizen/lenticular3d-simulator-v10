MicroPlayer V32 - contrat retour IA

Ordre obligatoire

1. Importer la photo.
2. Envoyer la photo au traitement IA.
3. Attendre le retour IA complet.
4. Valider le package retourne.
5. Composer la scene maitre a partir du fond reconstruit et des calques RGBA.
6. Controler la recomposition centrale.
7. Deverrouiller seulement alors le simulateur et la generation lenticulaire.

Regle : pas de package IA valide = pas de simulateur.

Package attendu

Le package microplayer-photo-relief-v1 doit contenir au minimum manifest.json, l original rectifie, background-master-local.png, les calques RGBA semantiques references par le manifeste et une profondeur par groupe.

L IA est responsable de la comprehension du document, de la reconstruction du fond et de la preparation des calques. MicroPlayer est responsable de la composition deterministe, du reglage Z/parallaxe, du controle qualite et des 9 vues.

Controle avant simulation

MicroPlayer recompose d abord la vue centrale avec background master + layers. Il compare cette composition a l original rectifie. Si le package est incomplet, les dimensions incoherentes ou la recomposition hors tolerance, la simulation reste verrouillee et l erreur est affichee.

Aucun texte, logo ou element graphique n est regenere par le moteur lenticulaire. Les calques recus sont deplaces comme des plans plats : pas d extrusion, pas d epaisseur ajoutee, pas d ombre artificielle, pas de warping global.

La vue centrale de production est la recomposition de la scene maitre. L original rectifie reste la reference QC et non une exception de rendu.

Etats UI

WAITING_AI -> RECEIVING_AI -> COMPOSING -> QC_FAILED ou READY -> SIMULATING -> RENDERED

Le panneau simulateur et les commandes de generation doivent etre absents ou desactives avant l etat READY.


PHOTO 3 PLANS OBLIGATOIRE

Avant toute simulation, le retour IA doit aussi fournir une photo de controle en perspective oblique montrant clairement trois niveaux de profondeur : plan avant, plan intermediaire et fond/carte. Les textes et logos restent des surfaces plates sans epaisseur, avec un vide visible entre les niveaux. Cette photo 3 plans sert de validation visuelle humaine de la scene maitre. Elle n est pas une des 9 vues lenticulaires et ne peut pas etre remplacee par la grille 01-09.

Le statut READY exige donc deux validations : scene maitre RGBA techniquement validee ET photo 3 plans de controle disponible. Sans les deux, aucune grille 9 vues ni simulateur.
