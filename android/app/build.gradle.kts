plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.thereceiptclub.booth"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.thereceiptclub.booth"
        minSdk = 24
        targetSdk = 34
        versionCode = 103
        versionName = "1.0.3"

        // Remote booth UI — change before release or override via adb intent data
        buildConfigField(
            "String",
            "BOOTH_URL",
            "\"https://shoot-receipt-boot.onrender.com\"",
        )
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
}
