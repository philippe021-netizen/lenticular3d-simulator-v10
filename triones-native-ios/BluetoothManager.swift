import Foundation
import CoreBluetooth

final class BluetoothManager: NSObject, ObservableObject {
    enum Side: String { case left, right }

    struct FoundDevice: Identifiable, Equatable {
        let id: UUID
        let name: String
        let rssi: Int
    }

    @Published var bluetoothReady = false
    @Published var scanning = false
    @Published var found: [FoundDevice] = []
    @Published var leftName = "Non connecté"
    @Published var rightName = "Non connecté"
    @Published var log = "Prêt."

    private var central: CBCentralManager!
    private var peripherals: [UUID: CBPeripheral] = [:]
    private var writeChars: [UUID: CBCharacteristic] = [:]
    private var sideByPeripheral: [UUID: Side] = [:]
    private var pendingSide: Side?
    private var sequenceTask: Task<Void, Never>?

    private let preferredService16: Set<String> = ["FFD5", "FFE5", "FFD0", "FFE0", "FFF0", "FFB0", "FFA0"]
    private let preferredWrite16: Set<String> = ["FFD9", "FFE9", "FF01", "FFF3"]

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func scan(for side: Side) {
        guard bluetoothReady else { addLog("Bluetooth indisponible"); return }
        pendingSide = side
        found.removeAll()
        scanning = true
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        addLog("Scan natif Triones pour \(side.rawValue)…")
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            if self.scanning { self.stopScan() }
        }
    }

    func stopScan() {
        central.stopScan()
        scanning = false
    }

    func select(_ device: FoundDevice) {
        guard let p = peripherals[device.id], let side = pendingSide else { return }
        stopScan()
        sideByPeripheral[p.identifier] = side
        UserDefaults.standard.set(p.identifier.uuidString, forKey: "triones.\(side.rawValue).uuid")
        UserDefaults.standard.set(device.name, forKey: "triones.\(side.rawValue).name")
        central.connect(p)
        setStatus(side, "Connexion…")
    }

    func reconnectSaved() {
        guard bluetoothReady else { return }
        for side in [Side.left, .right] {
            guard let s = UserDefaults.standard.string(forKey: "triones.\(side.rawValue).uuid"),
                  let id = UUID(uuidString: s) else { continue }
            let ps = central.retrievePeripherals(withIdentifiers: [id])
            if let p = ps.first {
                peripherals[p.identifier] = p
                sideByPeripheral[p.identifier] = side
                central.connect(p)
                setStatus(side, "Reconnexion…")
            }
        }
    }

    func forget() {
        sequenceTask?.cancel()
        for side in [Side.left, .right] {
            UserDefaults.standard.removeObject(forKey: "triones.\(side.rawValue).uuid")
            UserDefaults.standard.removeObject(forKey: "triones.\(side.rawValue).name")
        }
        leftName = "Non connecté"
        rightName = "Non connecté"
        addLog("Associations effacées")
    }

    func power(_ on: Bool, side: Side? = nil) {
        send([0xCC, on ? 0x23 : 0x24, 0x33], side: side)
    }

    func rgb(_ r: UInt8, _ g: UInt8, _ b: UInt8, intensity: UInt8 = 255, side: Side? = nil) {
        let k = Double(intensity) / 255.0
        send([0x56, UInt8(Double(r)*k), UInt8(Double(g)*k), UInt8(Double(b)*k), 0x00, 0xF0, 0xAA], side: side)
    }

    func white(intensity: UInt8 = 255, side: Side? = nil) {
        send([0x56, 0x00, 0x00, 0x00, intensity, 0x0F, 0xAA], side: side)
    }

    func mode(_ value: UInt8) { send([0xBB, value, 0x25, 0x44], side: nil) }

    func stopAll() {
        sequenceTask?.cancel()
        sequenceTask = nil
        power(false)
        addLog("STOP")
    }

    func startMaster(speed: UInt64 = 180, pause: UInt64 = 420) {
        sequenceTask?.cancel()
        sequenceTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.pingPong(speed)
                await self.doubleGD(speed, pause)
                await self.triple(speed, pause)
                await self.heartbeat(speed, pause)
                await self.chase(speed, pause)
                await self.burst(speed, pause)
            }
        }
        addLog("PROGRAMME COMPLET démarré")
    }

    private func pingPong(_ s: UInt64) async {
        await pulse(.left, ms: s); await wait(max(30, s/4)); await pulse(.right, ms: s); await wait(max(30, s/4))
    }
    private func doubleGD(_ s: UInt64, _ p: UInt64) async {
        for _ in 0..<2 { await pulse(.left, ms: max(45,s*65/100)); await wait(max(30,s*35/100)) }
        await wait(s/2)
        for _ in 0..<2 { await pulse(.right, ms: max(45,s*65/100)); await wait(max(30,s*35/100)) }
        await wait(p)
    }
    private func triple(_ s: UInt64, _ p: UInt64) async {
        for side in [Side.left,.right,.left] { await pulse(side, ms: max(45,s*55/100)); await wait(max(30,s/4)) }
        for side in [Side.right,.left,.right] { await pulse(side, ms: max(45,s*55/100)); await wait(max(30,s/4)) }
        await wait(p)
    }
    private func heartbeat(_ s: UInt64, _ p: UInt64) async {
        for _ in 0..<2 { await pulse(.left, ms: max(45,s*45/100)); await wait(max(30,s*22/100)) }
        for _ in 0..<2 { await pulse(.right, ms: max(45,s*45/100)); await wait(max(30,s*22/100)) }
        await wait(p)
    }
    private func chase(_ s: UInt64, _ p: UInt64) async {
        await pulse(.left, ms: max(45,s*60/100)); await wait(max(30,s*15/100)); await pulse(.right, ms: max(45,s*60/100)); await wait(p)
    }
    private func burst(_ s: UInt64, _ p: UInt64) async {
        for i in 0..<5 { await pulse(i % 2 == 0 ? .left : .right, ms: max(45,s*35/100)); await wait(max(35,s*18/100)) }
        await wait(p)
    }

    private func pulse(_ side: Side, ms: UInt64) async {
        if Task.isCancelled { return }
        white(side: side)
        power(true, side: side)
        await wait(ms)
        power(false, side: side)
    }

    private func wait(_ ms: UInt64) async { try? await Task.sleep(nanoseconds: ms * 1_000_000) }

    private func send(_ bytes: [UInt8], side: Side?) {
        let targets = writeChars.compactMap { (id, ch) -> (CBPeripheral, CBCharacteristic)? in
            guard let p = peripherals[id], p.state == .connected else { return nil }
            if let side, sideByPeripheral[id] != side { return nil }
            return (p,ch)
        }
        for (p,ch) in targets {
            let type: CBCharacteristicWriteType = ch.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
            p.writeValue(Data(bytes), for: ch, type: type)
        }
    }

    private func setStatus(_ side: Side, _ text: String) {
        if side == .left { leftName = text } else { rightName = text }
    }

    private func addLog(_ s: String) { log = "\(Date().formatted(date: .omitted, time: .standard)) — \(s)\n" + log }

    private func uuid16(_ uuid: CBUUID) -> String { uuid.uuidString.uppercased() }
}

extension BluetoothManager: CBCentralManagerDelegate, CBPeripheralDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        bluetoothReady = central.state == .poweredOn
        if bluetoothReady { reconnectSaved() }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? ""
        guard name.lowercased().hasPrefix("triones-") else { return }
        peripherals[peripheral.identifier] = peripheral
        let item = FoundDevice(id: peripheral.identifier, name: name, rssi: RSSI.intValue)
        if let i = found.firstIndex(where: {$0.id == item.id}) { found[i] = item } else { found.append(item) }
        found.sort { $0.rssi > $1.rssi }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices(nil)
        addLog("Connecté à \(peripheral.name ?? peripheral.identifier.uuidString)")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        writeChars.removeValue(forKey: peripheral.identifier)
        if let side = sideByPeripheral[peripheral.identifier] { setStatus(side, "Déconnecté") }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        peripheral.services?.forEach { peripheral.discoverCharacteristics(nil, for: $0) }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let chars = service.characteristics else { return }
        let writable = chars.filter { $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse) }
        let preferred = writable.first { preferredWrite16.contains(uuid16($0.uuid)) }
        if let ch = preferred ?? writable.first {
            writeChars[peripheral.identifier] = ch
            if let side = sideByPeripheral[peripheral.identifier] {
                setStatus(side, peripheral.name ?? "Triones")
                addLog("\(side.rawValue): \(peripheral.name ?? "Triones") prêt — \(ch.uuid.uuidString)")
            }
        }
    }
}
