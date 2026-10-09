# MicroPlayer · impression lenticulaire

## Prototype logiciel

Le module transforme neuf vues validées en un seul raster PNG interlacé. Il peut recevoir les images directement depuis Photo & relief, lire le ZIP déjà exporté, ou accepter neuf images chargées dans l’ordre. L’export 9 vues existant et le simulateur restent disponibles.

Le premier preset est une carte postale de 100 × 150 mm, en portrait ou paysage. Les vues gardent leurs proportions : un recadrage explicite, commun aux neuf images, est appliqué avant le calcul. Le réglage initial est 50 LPI nominal, 50 LPI calibré et 600 DPI.

## Calcul

Pour un raster de résolution \(D\) DPI et un pitch calibré \(L\) LPI, le pas théorique d’une lentille vaut :

\[
P = \frac{D}{L}\;\text{pixels par lentille}
\]

Le moteur ne force pas \(P\) à un entier. Pour chaque pixel de sortie sur l’axe perpendiculaire aux lentilles, il prend le centre du pixel, ajoute le décalage de phase \(o\), puis calcule :

\[
\phi = \operatorname{fract}\left(\frac{x + 0.5 + o}{P}\right), \qquad
i = \left\lfloor 9\phi \right\rfloor
\]

La vue \(i\), de 0 à 8, fournit la couleur de ce pixel. En orientation de lentilles horizontales, \(x\) est remplacé par la coordonnée verticale. L’option d’inversion transforme \(i\) en \(8-i\). Cette sélection pixel par pixel évite les arrondis cumulés quand le pas n’est pas entier.

Exemple à 600 DPI : 50 LPI donne 12 pixels par lentille; 49,73 LPI donne environ 12,064 pixels. La seconde valeur est conservée telle quelle dans le calcul.

## Taille et résolution

Le nombre de pixels est arrondi une seule fois à partir de la taille cible :

\[
N = \operatorname{round}\left(\frac{\text{mm} \times 600}{25.4}\right)
\]

Le preset portrait donne 2362 × 3543 pixels; paysage donne 3543 × 2362. Le ratio des rasters est exactement 2:3 ou 3:2. Comme des dimensions millimétriques exactes ne tombent pas toujours sur un nombre entier de pixels à une résolution entière, le PNG inclut un chunk \`pHYs\` à 600 DPI, arrondi à la précision normalisée pixels par mètre. Le PDF optionnel fixe la page exactement à 100 × 150 mm (ou 150 × 100 mm) et place l’image sur toute la page sans changer son ratio.

Le PDF place les pixels RGB du PNG dans un flux Flate sans perte; ses points de page sont calculés directement depuis les millimètres, sans compression JPEG ni redimensionnement après interlacement.

Dans le pilote Canon, imprimer à **100 % / taille réelle** et désactiver **Ajuster à la page**. Le PDF est le choix le plus direct pour conserver les dimensions physiques exactes.

## Mémoire et échantillonnage

Le rendu conserve neuf vues décodées à leur taille d’origine. Il prépare ensuite 32 lignes à la fois, applique le recadrage commun et l’interpolation Canvas 2D de qualité élevée vers la résolution de sortie, puis interlace ces lignes. Il n’alloue pas neuf canevas de 8,4 mégapixels. Le PNG est encodé une fois, reçoit son \`pHYs\`, puis le module le rouvre pour vérifier que les dimensions n’ont pas changé.

## Calibration physique

La planche couvre 49,5 à 50,5 LPI par pas de 0,1. Chaque bande contient neuf couleurs ordonnées interlacées à son pitch annoncé. Elle est un outil de mesure de départ, pas une valeur de calibration présumée.

La valeur réelle doit être choisie avec l’ensemble Canon PIXMA PRO-200S, papier photo, réglages du pilote et feuille PET 50 LPI. La page ne déduit pas une calibration définitive. Le profil local mémorise le format, l’orientation, les deux valeurs LPI, le DPI, les neuf vues, l’orientation des lentilles, la phase et l’inversion.

## Vérifications à faire sur matériel

Après réception du matériel : imprimer la planche en PDF à 100 %, superposer la feuille lenticulaire sans glissement, comparer les bandes en inclinant l’échantillon, puis entrer le pitch gagnant. Il faudra aussi vérifier l’ordre des vues et la phase, car ils dépendent de l’orientation réelle des lentilles et de l’alignement imprimante/support.
