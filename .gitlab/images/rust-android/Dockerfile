ARG RUST_IMAGE

# The Android NDK is ~2.5GB unpacked and only the rn android build needs it,
# so it lives in its own image to keep the base rust image fast to pull.
FROM ${RUST_IMAGE}

RUN cargo install cargo-ndk && rm -rf /usr/local/cargo/registry

# Android NDK
RUN curl -L -o /tmp/ndk.zip "https://dl.google.com/android/repository/android-ndk-r27c-linux.zip" \
    && unzip -q /tmp/ndk.zip -d /opt \
    && mv /opt/android-ndk-* /opt/android-ndk \
    && rm /tmp/ndk.zip

ENV ANDROID_NDK_HOME=/opt/android-ndk
ENV PATH="/opt/android-ndk/toolchains/llvm/prebuilt/linux-x86_64/bin:${PATH}"
