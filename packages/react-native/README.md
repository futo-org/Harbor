# @polycentric/react-native

Polycentric SDK for React Native applications.

## Install and Build

Install dependencies from the repo root:

```
yarn install
```

Install Ruby gems for CocoaPods:

```
cd example
bundle install
```

Install iOS pods:

```
cd ios
bundle exec pod install
cd ../..
```

Build the library:

```
yarn prepare
```

Typecheck:

```
yarn typecheck
```

## Run

Run the example app in the iOS simulator:

```
yarn example ios
```

Run the example app on an Android emulator:

```
yarn example android
```
