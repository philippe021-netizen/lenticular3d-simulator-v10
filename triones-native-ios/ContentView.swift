import SwiftUI

struct ContentView: View {
    @EnvironmentObject var ble: BluetoothManager
    @State private var speed: Double = 180
    @State private var pause: Double = 420
    @State private var intensity: Double = 255

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    statusCard
                    scanCard
                    mainCard
                    colorCard
                    effectsCard
                    logCard
                }
                .padding()
            }
            .navigationTitle("Triones Duo")
        }
    }

    private var statusCard: some View {
        GroupBox("Connexion") {
            VStack(alignment: .leading, spacing: 8) {
                HStack { Text("GAUCHE").bold(); Spacer(); Text(ble.leftName) }
                HStack { Text("DROIT").bold(); Spacer(); Text(ble.rightName) }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var scanCard: some View {
        GroupBox("Détection native BLE") {
            VStack(spacing: 10) {
                HStack {
                    Button("Scanner GAUCHE") { ble.scan(for: .left) }
                    Button("Scanner DROIT") { ble.scan(for: .right) }
                }
                .buttonStyle(.borderedProminent)

                if ble.scanning {
                    HStack { ProgressView(); Text("Recherche Triones-…") }
                }

                ForEach(ble.found) { d in
                    Button {
                        ble.select(d)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(d.name).bold()
                                Text(d.id.uuidString).font(.caption2).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(d.rssi) dBm")
                        }
                    }
                    .buttonStyle(.bordered)
                }

                HStack {
                    Button("Reconnecter") { ble.reconnectSaved() }
                    Button("Oublier") { ble.forget() }
                }
            }
        }
    }

    private var mainCard: some View {
        GroupBox("Commande principale") {
            VStack(spacing: 10) {
                Button("PROGRAMME COMPLET") {
                    ble.startMaster(speed: UInt64(speed), pause: UInt64(pause))
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                HStack {
                    Button("LES DEUX ON") { ble.white(intensity: UInt8(intensity)); ble.power(true) }
                    Button("STOP / OFF", role: .destructive) { ble.stopAll() }
                }
                .buttonStyle(.borderedProminent)

                slider("Vitesse", value: $speed, range: 70...650)
                slider("Intensité", value: $intensity, range: 20...255)
                slider("Pause", value: $pause, range: 100...1200)
            }
        }
    }

    private var colorCard: some View {
        GroupBox("Couleurs") {
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]) {
                Button("Blanc") { ble.white(intensity: UInt8(intensity)); ble.power(true) }
                Button("Rouge") { ble.rgb(255,0,0,intensity: UInt8(intensity)); ble.power(true) }
                Button("Vert") { ble.rgb(0,255,0,intensity: UInt8(intensity)); ble.power(true) }
                Button("Bleu") { ble.rgb(0,70,255,intensity: UInt8(intensity)); ble.power(true) }
                Button("Ambre") { ble.rgb(255,120,0,intensity: UInt8(intensity)); ble.power(true) }
                Button("Violet") { ble.rgb(160,0,255,intensity: UInt8(intensity)); ble.power(true) }
            }
            .buttonStyle(.bordered)
        }
    }

    private var effectsCard: some View {
        GroupBox("Modes contrôleur") {
            HStack {
                Button("Fondu") { ble.mode(37) }
                Button("Flash") { ble.mode(38) }
                Button("Strobe") { ble.mode(39) }
            }
            .buttonStyle(.bordered)
        }
    }

    private var logCard: some View {
        GroupBox("Journal") {
            Text(ble.log)
                .font(.caption.monospaced())
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
    }

    private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack { Text(title); Spacer(); Text("\(Int(value.wrappedValue))") }
            Slider(value: value, in: range)
        }
    }
}
