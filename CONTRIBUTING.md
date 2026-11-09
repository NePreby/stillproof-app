# Contributing

`stillproof-app` is the Stillproof capture app: it signs a photo's SHA-256 on
the phone, submits the claim to an anchoring service and checks receipts. It
takes part in the [Stellar Wave](https://www.drips.network/wave/stellar)
program; Wave issues are labeled with their complexity. The ground rules for
every Stillproof repository are in the
[organization guide](https://github.com/stillproof-labs/.github/blob/main/CONTRIBUTING.md).

## Setup

```sh
git clone https://github.com/stillproof-labs/stillproof-app && cd stillproof-app
npm ci
npx jest
```

Node 24. Jest runs offline: the protocol tests use recorded vectors and
fixtures, and network calls are mocked.

The camera, secure storage and the `stillproof-keys` module are native, so run
the app in a development build, not Expo Go:

```sh
npx expo run:android   # or: npx expo run:ios (macOS only)
```

That needs the Android SDK or Xcode. To talk to a local
[stillproof-anchor](https://github.com/stillproof-labs/stillproof-anchor), see
the README's Running section (`EXPO_PUBLIC_ANCHOR_URL`, testnet only).

## Before you open a PR

```sh
npx tsc --noEmit
npx expo lint
npx jest --ci
npx expo-doctor
```

CI also builds a debug APK on Linux (after unit-testing the keys module on the
JVM) and an iOS simulator build on macOS. If you change native code in
`modules/stillproof-keys/` or `app.json`, check that `npx expo prebuild`
still works.

## Protocol vectors

`src/protocol/__fixtures__/vectors.json` must stay byte-identical to
[stillproof](https://github.com/stillproof-labs/stillproof)'s
`testdata/vectors.json`. Don't edit it here. A change to claims, receipts or
the tree lands in `SPEC.md` and the Go code first, then the new file is copied
over and the TypeScript in `src/protocol/` must reproduce it exactly. The C2PA
fixtures in `src/protocol/__fixtures__/c2pa/` come from the Go `embed` package;
`gen.go.txt` says how they were made.

## UI changes

The app follows
[DESIGN.md](https://github.com/stillproof-labs/stillproof/blob/main/docs/DESIGN.md).
A PR that changes what a screen looks like includes screenshots, in both
darkroom (dark) and print (light) when colours are involved.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org): `feat(capture): …`,
`fix(verify): …`, `docs: …`, `test: …`.
