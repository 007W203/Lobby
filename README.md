# Lobby

## Real-World Proximity Voice

Lobby is an experimental Android communications app that brings video-game-style proximity voice into the physical world.

Instead of joining a conventional voice room, users can become available to people physically near them. Lobby combines geographic distance, selectable proximity ranges, background location, and real-time voice.

> **Status:** Working Android prototype. Not yet production-ready.

## What It Demonstrates

- GPS-based proximity detection
- Configurable proximity radius
- Background location updates
- Proximity entry and exit handling
- Hysteresis to reduce GPS boundary chatter
- WebRTC peer-to-peer voice
- Persistent microphone track management
- Mute and privacy controls
- Android foreground microphone service
- Background execution support
- Reconnect and resume handling
- Party creation and membership infrastructure
- Testing across multiple physical Android devices

## Why Lobby?

Most communication apps organize people around contacts, rooms, servers, or phone numbers.

Lobby explores a different model:

**What if the communication channel were the physical space around you?**

Potential applications include motorcycles, skiing and snowboarding, motorsports, vehicle convoys, events, outdoor recreation, and temporary real-world groups.

## Architecture

Lobby combines a React Native/Expo application with native Android components, background geolocation, a signaling backend, and WebRTC peer-to-peer audio.

**Lobby Server**
- Identity and presence
- Location updates
- Proximity relationships
- WebRTC signaling
- Party state

**Android Client**
- React Native / Expo UI and application state
- Background GPS
- Proximity logic
- WebRTC audio
- Native Kotlin foreground voice service

When nearby users become eligible for communication, signaling coordinates the peers while WebRTC carries real-time audio.

## Native Android Integration

Custom Kotlin components support persistent voice behavior:

- LobbyVoiceModule.kt
- LobbyVoicePackage.kt
- LobbyVoiceService.kt
- MainActivity.kt
- MainApplication.kt

The native layer bridges React Native with Android foreground-service behavior needed for long-running voice sessions.

## Technology

- TypeScript
- React Native
- Expo
- Expo Router
- Kotlin
- Android foreground services
- WebRTC
- Background geolocation
- Node.js backend/signaling

## Physical-Device Testing

The prototype has been tested across three physical Android phones, including:

- Locked-device operation
- Background location
- Walking out of proximity range
- Re-entering proximity range
- Voice send and receive
- Disconnect and reconnect behavior

## Engineering Approach

Lobby has been developed through rapid prototype-build-test-debug cycles using physical devices.

AI-assisted engineering tools are used for code generation, debugging, architecture exploration, log analysis, and rapid iteration. Suggested implementations are validated through builds, runtime behavior, device logs, and physical-device testing.

## Current Limitations

Lobby is an engineering prototype rather than a production service. Remaining work includes authentication and account recovery, persistent backend storage, production hosting, TURN/NAT traversal hardening, security hardening, battery optimization, broader Android compatibility testing, iOS support, scalable Party management, and deployment infrastructure.

## Roadmap

- Expanded Party communication
- Bluetooth and headset controls
- Production identity and authentication
- iOS support
- Offline/local communication research
- AR-assisted interaction
- AI-assisted communication features

## License

See LICENSE.
