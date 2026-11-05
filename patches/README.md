# Patches

## `@bsky.app/react-native-uitextview@2.7.1`

Drops `#import "RCTBridge.h"` from `RNUITextViewManager.mm`: the quoted import doesn't resolve against the prebuilt React Native core (`RCT_USE_PREBUILT_RNCORE`) used since the Expo 58 upgrade. `<React/RCTUIManager.h>` already imports the bridge. Not fixed upstream as of 2.7.1.

## `@rn-primitives/hooks@1.5.2`

Makes `useAccessibilityFocus` a no-op on web, where it calls `findNodeHandle`, which react-native-web throws on. Not fixed upstream as of 1.5.2.

## `react-native-safe-area-context@5.10.1`

Backport of upstream [#776](https://github.com/AppAndFlow/react-native-safe-area-context/pull/776), released in 5.11.0. Since 5.9.0 the web provider measures its own rect, so with window scrolling the scroll offset became extra top inset. On iOS Safari the address bar resizes the window while scrolling, so the layout kept jumping. Remove once Expo pins 5.11.0 or later.

## `uniffi-bindgen-react-native@0.31.0-6`

Frees `RustBuffer` arguments of callbacks (Rust calling JS) after the JS call, in the JSI C++ template `CallbackFunction.cpp`. Since 0.31.0-3 (upstream #394) `Bridging<RustBuffer>::toJs` gives JS a non-owning view instead of a copy, and only return values got a matching free, so every callback argument leaked: each `QueryObserver.next` emission (whole feed result) stayed in native memory forever. The wasm and NAPI runtimes copy and free, so only JSI is affected. After editing the patch, regenerate the bindings (`ubrn:android` or `ubrn:ios` in `packages/react-native`). Not fixed upstream as of 0.31.0-6.
