NDK_TOOLCHAIN="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"

export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER="$NDK_TOOLCHAIN/aarch64-linux-android30-clang"
export CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_LINKER="$NDK_TOOLCHAIN/armv7a-linux-androideabi30-clang"
export CARGO_TARGET_I686_LINUX_ANDROID_LINKER="$NDK_TOOLCHAIN/i686-linux-android30-clang"
export CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER="$NDK_TOOLCHAIN/x86_64-linux-android30-clang"

cd jni_bindings
cargo build --target aarch64-linux-android --release
cargo build --target armv7-linux-androideabi --release
cargo build --target i686-linux-android --release
cargo build --target x86_64-linux-android --release

rm -rf ../app/src/main/jniLibs/

mkdir ../app/src/main/jniLibs/

mkdir ../app/src/main/jniLibs/arm64-v8a/
cp target/aarch64-linux-android/release/libjni_bindings.so \
   ../app/src/main/jniLibs/arm64-v8a/
   
mkdir ../app/src/main/jniLibs/armeabi-v7a/
cp target/armv7-linux-androideabi/release/libjni_bindings.so \
   ../app/src/main/jniLibs/armeabi-v7a/

mkdir ../app/src/main/jniLibs/x86/
cp target/i686-linux-android/release/libjni_bindings.so \
   ../app/src/main/jniLibs/x86/
   
mkdir ../app/src/main/jniLibs/x86_64/
cp target/x86_64-linux-android/release/libjni_bindings.so \
   ../app/src/main/jniLibs/x86_64/
