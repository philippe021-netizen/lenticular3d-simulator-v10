import SwiftUI

@main
struct TrionesDuoApp: App {
    @StateObject private var ble = BluetoothManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(ble)
        }
    }
}
