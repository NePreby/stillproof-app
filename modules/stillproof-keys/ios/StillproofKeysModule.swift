import CryptoKit
import DeviceCheck
import ExpoModulesCore
import Foundation
import Security

private let service = "io.github.stillprooflabs.keys"
private let keyAccount = "stillproof-claim"
private let attestAccount = "stillproof-claim.attestation"

/// The claim key in the Secure Enclave, bound to the app by App Attest (SPEC.md §8.1).
public class StillproofKeysModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StillproofKeys")

    // Replaces any existing key. Returns {publicKey, level}.
    AsyncFunction("generateKey") { () async throws -> [String: String] in
      guard SecureEnclave.isAvailable else { throw KeysError("Secure Enclave unavailable") }
      try deleteItem(keyAccount)
      try deleteItem(attestAccount)
      let key = try SecureEnclave.P256.Signing.PrivateKey()
      try storeItem(keyAccount, key.dataRepresentation)
      let pub = key.publicKey.x963Representation

      // App Attest binds the key to this app: clientDataHash = SHA-256(65 key bytes).
      // If App Attest is unsupported or fails, the key stays without an attestation.
      let attest = DCAppAttestService.shared
      if attest.isSupported {
        do {
          // keyId is already base64, as DCAppAttestService returns it.
          let keyId = try await attest.generateKey()
          let object = try await attest.attestKey(keyId, clientDataHash: Data(SHA256.hash(data: pub)))
          let record = try JSONSerialization.data(withJSONObject: [
            "kind": "apple-app-attest", "key_id": keyId, "object": object.base64EncodedString(),
          ])
          try storeItem(attestAccount, record)
        } catch {
          try? deleteItem(attestAccount)
        }
      }
      return ["publicKey": hex(pub), "level": "secure-enclave"]
    }

    // {publicKey, level} of the stored key, or null.
    AsyncFunction("loadKey") { () throws -> [String: String]? in
      guard let key = try loadKey() else { return nil }
      return ["publicKey": hex(key.publicKey.x963Representation), "level": "secure-enclave"]
    }

    // SEC1 uncompressed public key, 65 bytes, lowercase hex.
    AsyncFunction("publicKey") { () throws -> String in
      guard let key = try loadKey() else { throw KeysError("no key") }
      return hex(key.publicKey.x963Representation)
    }

    // SPEC §8.1 apple-app-attest: {kind, key_id, object}.
    AsyncFunction("attestation") { () throws -> [String: String] in
      guard let data = try readItem(attestAccount),
        let record = try JSONSerialization.jsonObject(with: data) as? [String: String]
      else { throw KeysError("no attestation") }
      return record
    }

    // ECDSA P-256 over SHA-256(message bytes, hex). Returns r‖s with low s, hex (SPEC §2).
    AsyncFunction("sign") { (messageHex: String) throws -> String in
      guard let key = try loadKey() else { throw KeysError("no key") }
      guard let message = unhex(messageHex) else { throw KeysError("bad hex") }
      return hex(lowS(try key.signature(for: message).rawRepresentation))
    }

    AsyncFunction("deleteKey") { () throws in
      try deleteItem(keyAccount)
      try deleteItem(attestAccount)
    }
  }
}

private struct KeysError: LocalizedError {
  let errorDescription: String?
  init(_ message: String) { errorDescription = message }
}

// P-256 order n and n >> 1, big-endian.
private let order: [UInt8] = unhex("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")!.map { $0 }
private let halfOrder: [UInt8] = unhex("7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8")!.map { $0 }

/// r‖s with s > n/2 replaced by n − s.
private func lowS(_ raw: Data) -> Data {
  let bytes = [UInt8](raw)
  precondition(bytes.count == 64, "P-256 raw signature is 64 bytes")
  let r = Array(bytes[0..<32])
  var s = Array(bytes[32..<64])
  if s.lexicographicallyPrecedes(halfOrder) || s == halfOrder { return raw }
  var borrow = 0
  for i in stride(from: 31, through: 0, by: -1) {
    var d = Int(order[i]) - Int(s[i]) - borrow
    borrow = d < 0 ? 1 : 0
    if d < 0 { d += 256 }
    s[i] = UInt8(d)
  }
  return Data(r + s)
}

private func loadKey() throws -> SecureEnclave.P256.Signing.PrivateKey? {
  guard let data = try readItem(keyAccount) else { return nil }
  return try SecureEnclave.P256.Signing.PrivateKey(dataRepresentation: data)
}

private func query(_ account: String) -> [String: Any] {
  [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
}

private func storeItem(_ account: String, _ data: Data) throws {
  var q = query(account)
  q[kSecValueData as String] = data
  q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
  let status = SecItemAdd(q as CFDictionary, nil)
  guard status == errSecSuccess else { throw KeysError("keychain add failed: \(status)") }
}

private func readItem(_ account: String) throws -> Data? {
  var q = query(account)
  q[kSecReturnData as String] = true
  q[kSecMatchLimit as String] = kSecMatchLimitOne
  var out: CFTypeRef?
  let status = SecItemCopyMatching(q as CFDictionary, &out)
  if status == errSecItemNotFound { return nil }
  guard status == errSecSuccess else { throw KeysError("keychain read failed: \(status)") }
  return out as? Data
}

private func deleteItem(_ account: String) throws {
  let status = SecItemDelete(query(account) as CFDictionary)
  guard status == errSecSuccess || status == errSecItemNotFound else {
    throw KeysError("keychain delete failed: \(status)")
  }
}

private func hex<D: DataProtocol>(_ d: D) -> String {
  d.map { String(format: "%02x", $0) }.joined()
}

private func unhex(_ s: String) -> Data? {
  guard s.count % 2 == 0 else { return nil }
  var out = Data(capacity: s.count / 2)
  var i = s.startIndex
  while i < s.endIndex {
    let j = s.index(i, offsetBy: 2)
    guard let b = UInt8(s[i..<j], radix: 16) else { return nil }
    out.append(b)
    i = j
  }
  return out
}
