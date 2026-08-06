ARG RUST_IMAGE

FROM ${RUST_IMAGE}

# Android NDK. cargo-ndk only needs the llvm toolchain, so drop the
# standalone tools we never run.
RUN curl -L -o /tmp/ndk.zip "https://dl.google.com/android/repository/android-ndk-r27c-linux.zip" \
    && unzip -q /tmp/ndk.zip -d /opt \
    && mv /opt/android-ndk-* /opt/android-ndk \
    && rm /tmp/ndk.zip \
    && rm -rf /opt/android-ndk/simpleperf /opt/android-ndk/shader-tools

RUN cargo install cargo-ndk && rm -rf /usr/local/cargo/registry

ENV ANDROID_NDK_HOME=/opt/android-ndk
ENV PATH="/opt/android-ndk/toolchains/llvm/prebuilt/linux-x86_64/bin:${PATH}"
