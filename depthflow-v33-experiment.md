# DepthFlow V33 — profondeur continue (expérimental)

Base fonctionnelle : V32 / commit 3ba74d66.

## Première évolution

Conserver le moteur 4 plans comme référence A et introduire un moteur B de profondeur continue piloté par la depth map Depth Anything déjà calculée.

### Paramètres
- `zeroPlane`: profondeur de convergence, défaut = profondeur du sujet sélectionné (`seed.depth`).
- `continuousMix`: 0 = quatre plans rigides, 1 = profondeur continue, défaut test = 0.65.
- `depthGamma`: courbe de profondeur, défaut = 0.85.
- `maxParallax`: limite le déplacement pour éviter les halos/disocclusions.

### Règles non négociables
- Vue 05 reste la photo originale pixel pour pixel.
- Le sujet vert et les éléments « Solidaire du sujet » restent prioritaires.
- Les corrections Apple Pencil restent autoritaires.
- La profondeur continue ne doit pas lisser au travers du contour vert.
- L’ancien moteur reste disponible pour comparaison A/B.

### Formule cible
Pour chaque pixel hors sujet :
`z = clamp((D - zeroPlane) / depthSpan, -1, 1)`
`z = sign(z) * pow(abs(z), depthGamma)`
`continuousShift = shift * z * maxParallax`

Le déplacement final du fond devient un mélange :
`finalShift = mix(rigidLayerShift, continuousShift, continuousMix)`.

Pour le sujet, conserver le déplacement rigide actuel et seulement son micro-relief interne protégé par `edgeProtect`.

## Pourquoi cette étape
Le moteur V32 quantifie le fond en trois couleurs (`near/mid/far`) puis applique trois déplacements fixes. Cela crée une profondeur robuste mais en marches. La V33 doit conserver ces plans comme garde-fous tout en utilisant la vraie depth map pour les variations internes, sans modifier le détourage ni l'inpainting à ce stade.
