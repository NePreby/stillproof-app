Pod::Spec.new do |s|
  s.name           = 'StillproofKeys'
  s.version        = '1.0.0'
  s.summary        = 'Stillproof claim key: Secure Enclave and App Attest'
  s.license        = 'Apache-2.0'
  s.author         = 'Stillproof'
  s.homepage       = 'https://github.com/stillproof-labs/stillproof-app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/stillproof-labs/stillproof-app.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CryptoKit', 'DeviceCheck', 'Security'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
