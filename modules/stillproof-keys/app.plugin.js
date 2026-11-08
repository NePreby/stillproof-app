// Adds the App Attest entitlement, which DCAppAttestService needs (SPEC.md §8.1).
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withStillproofKeys(config) {
  return withEntitlementsPlist(config, (c) => {
    c.modResults['com.apple.developer.devicecheck.appattest-environment'] = 'production';
    return c;
  });
};
