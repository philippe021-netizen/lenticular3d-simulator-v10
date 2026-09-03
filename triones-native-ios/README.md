# Triones Duo Native iOS

Application iPhone native en SwiftUI/CoreBluetooth pour piloter directement deux contrôleurs Triones BLE, sans Bluefy ni Web Bluetooth.

## Cible matérielle confirmée
- Triones-C804
- Triones-C7CE
- Préfixe de scan: `Triones-`
- Service historique: `FFD5`
- Caractéristique d'écriture historique: `FFD9`
- Fallback: première caractéristique BLE writable trouvée.

## Pourquoi cette version
Le scan nRF Connect voit les deux contrôleurs, alors que Bluefy/Web Bluetooth ne les expose pas. Cette app utilise CoreBluetooth directement.

## Installation
1. Sur un Mac avec Xcode, créer un projet **iOS App / SwiftUI** nommé `TrionesDuo`.
2. Copier les fichiers Swift de ce dossier dans le projet.
3. Dans `Info.plist`, ajouter :
   - `NSBluetoothAlwaysUsageDescription` = `Triones Duo utilise le Bluetooth pour piloter les deux phares.`
4. Sélectionner l'iPhone réel comme cible et lancer l'app.

Aucun App Store n'est nécessaire pour un test local signé avec un compte Apple dans Xcode.

## Fonctionnement
- Scan natif des périphériques dont le nom commence par `Triones-`.
- Association GAUCHE / DROIT par appui sur le périphérique trouvé.
- UUID mémorisés dans `UserDefaults`.
- Reconnexion des périphériques connus au démarrage.
- Commandes Triones : ON/OFF, couleur, flash/strobe et séquences alternées.
