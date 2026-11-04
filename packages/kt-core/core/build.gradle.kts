import org.gradle.api.tasks.Exec

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.ktlint)
    id("maven-publish")
}

group = "org.futo"
// Release CI passes -PktCoreVersion=<tag minus v>; default stays 0.0.0.
version = (findProperty("ktCoreVersion") as? String) ?: "0.0.0"

// ── Paths ──────────────────────────────────────────────────────────────
// Repo root is two levels up from packages/kt-core.
val repoRoot = rootProject.projectDir.parentFile.parentFile
val uniffiOutDir =
    layout.buildDirectory
        .dir("generated/uniffi")
        .get()
        .asFile
val jniLibsDir = File(projectDir, "src/main/jniLibs")
val skipRust = (findProperty("skipRust") as? String) == "true"

tasks.register("checkNativeLibs") {
    group = "verification"
    description = "Fails when skipRust=true but rs-core artifacts is missing."
    doLast {
        val abis = listOf("arm64-v8a", "armeabi-v7a", "x86", "x86_64")
        val missing =
            abis.filter { abi ->
                !File(jniLibsDir, "$abi/libpolycentric_core.so").exists()
            }
        if (skipRust && missing.isNotEmpty()) {
            throw GradleException(
                "skipRust=true but libpolycentric_core.so is missing for: $missing. " +
                    "This build would produce an AAR that crashes with UnsatisfiedLinkError. " +
                    "Populate src/main/jniLibs/<abi>/ or build with Rust enabled.",
            )
        }
    }
}

tasks.named("preBuild") {
    dependsOn("checkNativeLibs")
}

android {
    namespace = "org.futo.polycentric.core"
    compileSdk = 35

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    sourceSets {
        getByName("main") {
            kotlin.srcDir(uniffiOutDir)
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        // JNA ships per-ABI dispatch libs; keep first occurrence.
        jniLibs.pickFirsts += listOf("**/libjnidispatch.so")
        // rs-common also builds as a cdylib and cargo-ndk copies it, but
        // its code is statically linked into libpolycentric_core.so
        // (readelf -d shows no NEEDED entry for it) — don't ship it.
        jniLibs.excludes += listOf("**/libpolycentric_common.so")
    }

    publishing {
        singleVariant("release")
    }
}

// The pre-commit hook (lint-staged) passes the staged files via
// -PktlintStagedFiles so only Kotlin that is actually being committed gets
// formatted; without the property every hand-written source is covered.
val stagedKtFiles =
    (findProperty("ktlintStagedFiles") as? String)
        ?.split(',')
        ?.filter { it.isNotEmpty() }
        ?.map { File(it).canonicalPath }
        ?.toSet()

// ── ktlint (format/lint check) ─────────────────────────────────────────
ktlint {
    // uniffi emits unformatted generated Kotlin (--no-format); lint
    // hand-written sources only.
    filter {
        if (stagedKtFiles != null) {
            exclude { element -> element.file.canonicalPath !in stagedKtFiles }
        }
        exclude { element -> element.file.path.contains("generated") }
    }
}

// ── Rust: cross-compile rs-core for Android ────────────────────────────
// Requires: rustup targets (aarch64/armv7/i686/x86_64-linux-android),
// cargo-ndk (`cargo install cargo-ndk`), and $ANDROID_NDK_HOME.
val cargoNdkBuild =
    tasks.register<Exec>("cargoNdkBuild") {
        group = "rust"
        description = "Cross-compile rs-core (cdylib) for all Android ABIs via cargo-ndk"
        workingDir = repoRoot
        commandLine(
            "cargo",
            "ndk",
            "-t",
            "arm64-v8a",
            "-t",
            "armeabi-v7a",
            "-t",
            "x86",
            "-t",
            "x86_64",
            "-o",
            jniLibsDir.absolutePath,
            "build",
            "--release",
            "-p",
            "polycentric-core",
        )
        inputs.dir(File(repoRoot, "packages/rs-core/src"))
        inputs.dir(File(repoRoot, "packages/rs-common/src"))
        outputs.dir(jniLibsDir)
    }

// ── Rust: host build + Kotlin binding generation ───────────────────────
// uniffi-bindgen reads exported symbols from a HOST cdylib (any target
// works; host is fastest), then emits Kotlin into build/generated/uniffi.
// Package/name mapping comes from the uniffi.toml in each crate's root
// (rs-core and rs-common). Don't pass --config: it replaces every crate's
// config, putting both crates in one package with clashing declarations.
val cargoHostBuild =
    tasks.register<Exec>("cargoHostBuild") {
        group = "rust"
        description = "Build rs-core for the host so uniffi-bindgen can read its metadata"
        workingDir = repoRoot
        commandLine("cargo", "build", "--release", "-p", "polycentric-core")
    }

val uniffiGenerate =
    tasks.register<Exec>("uniffiGenerate") {
        group = "rust"
        description = "Generate Kotlin bindings for rs-core with uniffi-bindgen"
        dependsOn(cargoHostBuild)
        workingDir = repoRoot
        // Linux host library name; use libpolycentric_core.dylib on macOS.
        val hostLib = File(repoRoot, "target/release/libpolycentric_core.so")
        commandLine(
            "cargo",
            "run",
            "--release",
            "--manifest-path",
            File(repoRoot, "tools/uniffi-bindgen/Cargo.toml").absolutePath,
            "--",
            "generate",
            "--library",
            hostLib.absolutePath,
            "--language",
            "kotlin",
            "--out-dir",
            uniffiOutDir.absolutePath,
            "--no-format",
        )
        // Regenerate when the host cdylib (rs-core's exported FFI) changes;
        // without this input the task is wrongly cached and stale bindings persist.
        inputs.file(hostLib)
        outputs.dir(uniffiOutDir)
    }

// ktlint's source set includes the generated directory (filtered out
// above), so order it after generation when both run in one build.
tasks.withType<org.jlleitschuh.gradle.ktlint.tasks.BaseKtLintCheckTask>().configureEach {
    mustRunAfter(uniffiGenerate)
}

if (!skipRust) {
    tasks.named("preBuild") {
        dependsOn(cargoNdkBuild, uniffiGenerate)
    }
}

dependencies {
    // Flow and StateFlow are part of the public API.
    api(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.android)
    // uniffi Kotlin runtime dependency:
    implementation(libs.jna) { artifact { type = "aar" } }

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    // The host JVM build of JNA (with its desktop dispatch library) for unit
    // tests, which load the host-built rs-core.
    testImplementation(libs.jna)
}

// Unit tests run the wrapper against the real rs-core, built for the host by
// cargoHostBuild.
tasks.withType<Test>().configureEach {
    systemProperty("jna.library.path", File(repoRoot, "target/release").absolutePath)
    if (!skipRust) dependsOn(cargoHostBuild)
}

// ── Publishing ─────────────────────────────────────────────────────────
// Publishes the release AAR to the Forgejo Maven registry for tagged
// commits.
afterEvaluate {
    publishing {
        publications {
            register<MavenPublication>("release") {
                from(components["release"])
                groupId = "org.futo"
                artifactId = "polycentric-core"
            }
        }
        if (System.getenv("HARBOR_CI_TOKEN") != null) {
            val owner = System.getenv("GITHUB_REPOSITORY")!!.substringBefore('/')
            val serverUrl = System.getenv("GITHUB_SERVER_URL")!!
            repositories {
                maven {
                    name = "Forgejo"
                    url = uri("$serverUrl/api/packages/$owner/maven")
                    credentials(HttpHeaderCredentials::class) {
                        name = "Authorization"
                        value = "token ${System.getenv("HARBOR_CI_TOKEN")}"
                    }
                    authentication {
                        create<HttpHeaderAuthentication>("header")
                    }
                }
            }
        }
    }
}
