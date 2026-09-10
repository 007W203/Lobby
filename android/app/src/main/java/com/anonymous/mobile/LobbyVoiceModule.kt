package com.anonymous.mobile

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LobbyVoiceModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String =
        "LobbyVoiceService"

    @ReactMethod
    fun start() {
        val context =
            reactApplicationContext

        val intent =
            Intent(
                context,
                LobbyVoiceService::class.java
            ).apply {
                action =
                    LobbyVoiceService.ACTION_START
            }

        if (
            Build.VERSION.SDK_INT >=
                Build.VERSION_CODES.O
        ) {
            context.startForegroundService(
                intent
            )
        } else {
            context.startService(
                intent
            )
        }
    }

    @ReactMethod
    fun stop() {
        val context =
            reactApplicationContext

        val intent =
            Intent(
                context,
                LobbyVoiceService::class.java
            ).apply {
                action =
                    LobbyVoiceService.ACTION_STOP
            }

        context.startService(
            intent
        )
    }
}
