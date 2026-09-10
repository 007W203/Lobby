package com.anonymous.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class LobbyVoiceService : Service() {

    companion object {
        const val CHANNEL_ID = "lobby_voice"
        const val NOTIFICATION_ID = 5701
        const val ACTION_START = "com.anonymous.mobile.START_VOICE"
        const val ACTION_STOP = "com.anonymous.mobile.STOP_VOICE"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int
    ): Int {

        if (intent?.action == ACTION_STOP) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = buildNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            )
        } else {
            startForeground(
                NOTIFICATION_ID,
                notification
            )
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager =
                getSystemService(
                    NotificationManager::class.java
                )

            val channel = NotificationChannel(
                CHANNEL_ID,
                "Lobby Voice",
                NotificationManager.IMPORTANCE_LOW
            )

            channel.description =
                "Keeps Lobby voice active while your phone is locked"

            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {

        val launchIntent =
            packageManager.getLaunchIntentForPackage(
                packageName
            )

        val pendingIntent =
            PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_IMMUTABLE or
                    PendingIntent.FLAG_UPDATE_CURRENT
            )

        return NotificationCompat.Builder(
            this,
            CHANNEL_ID
        )
            .setContentTitle("Lobby voice active")
            .setContentText(
                "Party or Proximity voice is running"
            )
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setCategory(
                NotificationCompat.CATEGORY_SERVICE
            )
            .setPriority(
                NotificationCompat.PRIORITY_LOW
            )
            .build()
    }
}
