import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing. Locally: android/key.properties (git-ignored). In CI the
// same four values come from ORVIA_KEYSTORE_* environment variables. With
// neither, release builds fall back to the debug key so `flutter run
// --release` still works, but those APKs must never be distributed.
val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
val hasLocalKeystore = keystorePropertiesFile.exists()
if (hasLocalKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}
val hasCiKeystore = System.getenv("ORVIA_KEYSTORE_PATH") != null
val canSignRelease = hasLocalKeystore || hasCiKeystore

android {
    namespace = "com.scalyft.orvia"
    // permission_handler requires 37; the Flutter default is lower.
    compileSdk = maxOf(flutter.compileSdkVersion, 37)
    ndkVersion = flutter.ndkVersion

    buildFeatures {
        // The dev flavor sets its launcher label with resValue.
        resValues = true
        aidl = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications needs core library desugaring.
        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "com.scalyft.orvia"
        // sendUssdRequest needs API 26, so older devices could not set up
        // forwarding in-app. Flutter's default floor (24+) is raised to 26.
        minSdk = maxOf(flutter.minSdkVersion, 26)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (canSignRelease) {
            create("release") {
                storeFile = if (hasLocalKeystore) rootProject.file(keystoreProperties["storeFile"] as String)
                    else file(System.getenv("ORVIA_KEYSTORE_PATH")!!)
                storePassword = if (hasLocalKeystore) keystoreProperties["storePassword"] as String
                    else System.getenv("ORVIA_KEYSTORE_PASSWORD")
                keyAlias = if (hasLocalKeystore) keystoreProperties["keyAlias"] as String
                    else System.getenv("ORVIA_KEY_ALIAS")
                keyPassword = if (hasLocalKeystore) keystoreProperties["keyPassword"] as String
                    else System.getenv("ORVIA_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (canSignRelease) signingConfigs.getByName("release")
                else signingConfigs.getByName("debug")
            // R8 shrinks and obfuscates the Kotlin side. The Dart side is
            // obfuscated at build time with --obfuscate --split-debug-info.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // "prod" is the public app. "dev" installs beside it (own application id
    // and label) so a test build never replaces the real one.
    flavorDimensions += "env"
    productFlavors {
        create("prod") {
            dimension = "env"
            resValue("string", "app_name", "Orvia")
        }
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "Orvia Dev")
        }
        // The owner's personal build: the full app plus the on-phone call agent
        // (Shizuku + Gemini Live). Separate id and installer, never published.
        create("assistant") {
            dimension = "env"
            applicationIdSuffix = ".assistant"
            resValue("string", "app_name", "Orvia Assistant")
        }
    }

    // prod and dev share a no-op hook; assistant registers the agent channel.
    sourceSets {
        getByName("prod").java.srcDir("src/standard/kotlin")
        getByName("dev").java.srcDir("src/standard/kotlin")
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

// A CI build must never produce a release signed with the debug key: such an
// APK cannot be updated by a properly signed one later.
tasks.matching { it.name.matches(Regex("(assemble|bundle)\\w*Release")) }.configureEach {
    doFirst {
        if (!canSignRelease && System.getenv("CI") != null) {
            throw GradleException("Release signing is not configured. Set the ORVIA_KEYSTORE_* variables.")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    "assistantImplementation"("dev.rikka.shizuku:api:13.1.5")
    "assistantImplementation"("dev.rikka.shizuku:provider:13.1.5")
    "assistantImplementation"("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
}

flutter {
    source = "../.."
}
