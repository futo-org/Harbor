# Polycentric Kotlin Wrapper

Polycentric Kotlin SDK for android applications

## To build:

You will need java, android NDK, as well as all build tools required by the rs-core project.

The build process will expect to find an Android NDK installation at the directory indicated by $ANDROID_NDK_HOME.

Download the required targets, if you have not already:

```
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
rustup target add i686-linux-android
rustup target add x86_64-linux-android
```

Then run the build script:

```
./build.sh
```

## To run tests:

First build the project, then run:

```
./gradlew connectedDebugAndroidTest
```

Note that this will require a connected physical or virtual android device.