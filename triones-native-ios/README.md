# Triones Duo Native iOS

Application iPhone native en SwiftUI/CoreBluetooth pour piloter directement deux contrôleurs Triones BLE, sans Bluefy ni Web Bluetooth.

## Cible matérielle confirmée
- Triones-C804
- Triones-C7CE
- Préfixe de scan : `Triones-`
- Service historique : `FFD5`
- Caractéristique d'écriture historique : `FFD9`
- Fallback : première caractéristique BLE writable trouvée.

## Pourquoi cette version
nRF Connect voit les deux contrôleurs alors que Bluefy/Web Bluetooth ne les expose pas. Cette app utilise CoreBluetooth directement.

## Projet Xcode prêt à ouvrir
Le dossier contient maintenant :
- `TrionesDuo.xcodeproj`
- `TrionesDuoApp.swift`
- `ContentView.swift`
- `BluetoothManager.swift`
- `Info.plist`

Il n'est plus nécessaire de recréer un projet à la main.

## Installation sur l'iPhone
1. Sur un Mac, cloner ou télécharger le dépôt GitHub.
2. Ouvrir `triones-native-ios/TrionesDuo.xcodeproj` dans Xcode.
3. Brancher l'iPhone au Mac et lui faire confiance si iOS le demande.
4. Dans Xcode, sélectionner le projet **TrionesDuo** puis la cible **Triones Duo**.
5. Dans **Signing & Capabilities**, choisir ton compte Apple dans **Team**. Xcode peut modifier automatiquement l'identifiant de signature si nécessaire.
6. Choisir ton iPhone comme destination d'exécution.
7. Appuyer sur ▶︎ **Run**.
8. Au premier lancement sur l'iPhone, accepter l'autorisation Bluetooth.

Pour un test local, un compte Apple gratuit dans Xcode suffit généralement. Avec un compte gratuit, la signature de développement peut expirer et nécessiter une réinstallation périodique.

## Premier test
1. Mettre le contact de la moto et alimenter les deux contrôleurs.
2. Ouvrir **Triones Duo**.
3. Appuyer sur **Scanner GAUCHE** et sélectionner le premier contrôleur voulu.
4. Appuyer sur **Scanner DROIT** et sélectionner l'autre.
5. Vérifier **LES DEUX ON**, **STOP / OFF**, puis **PROGRAMME COMPLET**.

L'association gauche/droite est mémorisée dans `UserDefaults`, et l'app tente ensuite une reconnexion automatique.

## Fonctionnement
- Scan CoreBluetooth natif des périphériques dont le nom commence par `Triones-`.
- Association GAUCHE / DROIT par sélection du périphérique trouvé.
- UUID mémorisés dans `UserDefaults`.
- Reconnexion des périphériques connus au démarrage.
- Commandes Triones : ON/OFF, blanc, RGB, modes flash/strobe et séquences alternées.
