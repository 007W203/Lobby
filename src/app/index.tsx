import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Image,
  NativeModules,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { io, Socket } from 'socket.io-client';
import InCallManager from 'react-native-incall-manager';

import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';

type PermissionState =
  | 'checking'
  | 'granted'
  | 'denied';

type PartyMember = {
  socketId: string;
  userId?: string | null;
  handle?: string;
  name?: string;
};

type NearbyVoiceUser = {
  socketId: string;
  userId?: string | null;
  handle?: string;
  name?: string;
  distanceMeters?: number;
  effectiveRangeMeters?: number;
};

type NearbyUser = {
  socketId: string;
  userId?: string | null;
  handle?: string;
  name?: string;
  proximityOpen?: boolean;
  distanceMeters?: number;
  effectiveRangeMeters?: number;
  theirRangeMeters?: number;
  voiceEligible?: boolean;
};

const {
  LobbyVoiceService,
} = NativeModules;

const SERVER_URL =
  'https://retailers-exhibits-pty-corporations.trycloudflare.com';

const STORAGE_USER_ID =
  '@lobby/userId';

const STORAGE_HANDLE =
  '@lobby/handle';

const STORAGE_PERSISTENT_MUTED_USER_IDS =
  '@lobby/persistentMutedUserIds';

const STORAGE_FAVORITE_USER_IDS =
  '@lobby/favoriteUserIds';

const STORAGE_PROXIMITY_RANGE =
  '@lobby/proximityRangeMeters';

const STORAGE_LAST_PARTY_CODE =
  '@lobby/lastPartyCode';

const STORAGE_MIC_ENABLED =
  '@lobby/micEnabled';

const PROXIMITY_RANGES = [
  { label: '10 m', value: 10 },
  { label: '25 m', value: 25 },
  { label: '50 m', value: 50 },
  { label: '100 m', value: 100 },
  { label: '250 m', value: 250 },
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '5 km TEST', value: 5000 },
];

// v0.5C7: resume recovery + Android speaker routing; retains C6 Metered TURN.
const RTC_CONFIGURATION = {
  iceServers: [
    {
      urls: 'stun:stun.relay.metered.ca:80',
    },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: '993681280d130dd441ba2b9c',
      credential: 'BkFNakSaaoAnPm/P',
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: '993681280d130dd441ba2b9c',
      credential: 'BkFNakSaaoAnPm/P',
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: '993681280d130dd441ba2b9c',
      credential: 'BkFNakSaaoAnPm/P',
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: '993681280d130dd441ba2b9c',
      credential: 'BkFNakSaaoAnPm/P',
    },
  ],
};

function generateLobbyUserId() {
  const time =
    Date.now().toString(36);

  const random =
    Math.random()
      .toString(36)
      .slice(2, 12);

  return `usr_${time}_${random}`;
}

const LOBBY_BACKGROUND_LOCATION_TASK =
  'lobby-background-location-v0.5D';

TaskManager.defineTask(
  LOBBY_BACKGROUND_LOCATION_TASK,
  async ({
    data,
    error,
  }) => {
    if (error) {
      console.log(
        '0.5D BACKGROUND LOCATION TASK ERROR:',
        error
      );

      return;
    }

    const locations =
      (data as any)
        ?.locations as
          Location.LocationObject[]
          | undefined;

    const location =
      locations?.[
        locations.length - 1
      ];

    if (!location) {
      return;
    }

    try {
      const userId =
        await AsyncStorage.getItem(
          STORAGE_USER_ID
        );

      if (!userId) {
        return;
      }

      const response =
        await fetch(
          `${SERVER_URL}/background-location`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                userId,

                latitude:
                  location
                    .coords
                    .latitude,

                longitude:
                  location
                    .coords
                    .longitude,
              }),
          }
        );

      console.log(
        '0.5D BACKGROUND LOCATION SENT:',
        response.status,
        location.coords.latitude.toFixed(
          6
        ),
        location.coords.longitude.toFixed(
          6
        )
      );
    } catch (taskError) {
      console.log(
        '0.5D BACKGROUND LOCATION SEND ERROR:',
        taskError
      );
    }
  }
);

export default function HomeScreen() {
  const [showLobbySplash, setShowLobbySplash] = useState(true);
  /*
    --------------------------------------------------
    IDENTITY
    --------------------------------------------------
  */

  const [
    identityReady,
    setIdentityReady,
  ] = useState(false);

  const [
    userId,
    setUserId,
  ] = useState('');

  const [
    handle,
    setHandle,
  ] = useState('Lobby User');

  const [
    handleDraft,
    setHandleDraft,
  ] = useState('Lobby User');

  const [
    identityMessage,
    setIdentityMessage,
  ] = useState('');

  /*
    --------------------------------------------------
    UI STATE
    --------------------------------------------------
  */

  const [
    proximityEnabled,
    setProximityEnabled,
  ] = useState(false);

  const [
    proximityRange,
    setProximityRange,
  ] = useState(100);

  const [
    micEnabled,
    setMicEnabled,
  ] = useState(false);

  const [
    micPermission,
    setMicPermission,
  ] =
    useState<PermissionState>(
      'checking'
    );

  const [
    locationPermission,
    setLocationPermission,
  ] =
    useState<PermissionState>(
      'checking'
    );

  const [
    coordinates,
    setCoordinates,
  ] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [
    serverConnected,
    setServerConnected,
  ] = useState(false);

  const [
    nearbyCount,
    setNearbyCount,
  ] = useState(0);

  const [
    nearbyUsers,
    setNearbyUsers,
  ] =
    useState<NearbyUser[]>([]);

  const [
    partyCode,
    setPartyCode,
  ] =
    useState<string | null>(
      null
    );

  const [
    partyMemberCount,
    setPartyMemberCount,
  ] = useState(0);

  const [
    partyMembers,
    setPartyMembers,
  ] =
    useState<PartyMember[]>([]);

  const [
    joinCode,
    setJoinCode,
  ] = useState('');

  const [
    partyMessage,
    setPartyMessage,
  ] = useState('');

  const [
    voiceConnected,
    setVoiceConnected,
  ] = useState(false);

  const [
    proximityVoiceConnected,
    setProximityVoiceConnected,
  ] = useState(false);

  const [
    voiceError,
    setVoiceError,
  ] = useState('');

  const [
    mutedPeerIds,
    setMutedPeerIds,
  ] = useState<Set<string>>(
    new Set()
  );

  const [
    persistentMutedUserIds,
    setPersistentMutedUserIds,
  ] = useState<Set<string>>(
    new Set()
  );

  const [
    favoriteUserIds,
    setFavoriteUserIds,
  ] = useState<Set<string>>(
    new Set()
  );

  const [
    speakingPeerIds,
    setSpeakingPeerIds,
  ] = useState<Set<string>>(
    new Set()
  );

  const [
    localSpeaking,
    setLocalSpeaking,
  ] = useState(false);

  const [
    editingHandle,
    setEditingHandle,
  ] = useState(false);

  /*
    --------------------------------------------------
    v0.5D FOREGROUND VOICE SERVICE
    --------------------------------------------------
  */

  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !LobbyVoiceService
    ) {
      return;
    }

    const voiceSessionActive =
      Boolean(partyCode) ||
      proximityEnabled;

    try {
      if (voiceSessionActive) {
        console.log(
          '0.5D: starting Android foreground voice service'
        );

        LobbyVoiceService.start();
      } else {
        console.log(
          '0.5D: stopping Android foreground voice service'
        );

        LobbyVoiceService.stop();
      }
    } catch (error) {
      console.log(
        '0.5D foreground voice service error:',
        error
      );
    }
  }, [
    partyCode,
    proximityEnabled,
  ]);

  /*
    --------------------------------------------------
    REFS
    --------------------------------------------------
  */

  const socketRef =
    useRef<Socket | null>(
      null
    );

  const localStreamRef =
    useRef<MediaStream | null>(
      null
    );

  const locationSubscriptionRef =
    useRef<
      Location.LocationSubscription | null
    >(null);

  const peerConnectionsRef =
    useRef<
      Map<
        string,
        RTCPeerConnection
      >
    >(new Map());

  const remoteAudioTracksRef =
    useRef<Map<string, any[]>>(
      new Map()
    );

  const mutedPeerIdsRef =
    useRef<Set<string>>(
      new Set()
    );

  const persistentMutedUserIdsRef =
    useRef<Set<string>>(
      new Set()
    );

  const favoriteUserIdsRef =
    useRef<Set<string>>(
      new Set()
    );

  const nearbyUsersRef =
    useRef<NearbyUser[]>([]);

  const speakingUntilRef =
    useRef<Map<string, number>>(
      new Map()
    );

  // v0.5C7.2: suppress transient inbound RTP audio levels while a
  // newly-created/rebuilt WebRTC peer settles after reconnect.
  const speakingIgnoreUntilRef =
    useRef<Map<string, number>>(
      new Map()
    );

  const localSpeakingUntilRef =
    useRef(0);

  const reconnectGenerationRef =
    useRef(0);

  // v0.5C7: distinguish a true fresh launch from a reconnect in the
  // same running app session, and track Android foreground resumes.
  const hasSocketConnectedOnceRef =
    useRef(false);

  const appStateRef =
    useRef(AppState.currentState);

  const resumeRecoveryInFlightRef =
    useRef(false);

  const peerRecoveryTimersRef =
    useRef<Map<string, ReturnType<typeof setTimeout>>>(
      new Map()
    );

  /*
    v0.5C4 negotiation guards.

    Party/proximity updates and recovery timers can arrive nearly
    simultaneously. These sets prevent duplicate offers/answers
    for the same peer while one negotiation is already in flight.
  */
  const offerInFlightRef =
    useRef<Set<string>>(
      new Set()
    );

  const incomingOfferInFlightRef =
    useRef<Set<string>>(
      new Set()
    );

  const localTrackPeerIdsRef =
    useRef<Set<string>>(
      new Set()
    );

  const proximityPeerIdsRef =
    useRef<Set<string>>(
      new Set()
    );

  const userIdRef =
    useRef('');

  const handleRef =
    useRef('Lobby User');

  const micEnabledRef =
    useRef(false);

  const proximityEnabledRef =
    useRef(false);

  const proximityRangeRef =
    useRef(100);

  const partyMembersRef =
    useRef<PartyMember[]>(
      []
    );

  const nearbyVoiceUsersRef =
    useRef<
      NearbyVoiceUser[]
    >([]);

  /*
    --------------------------------------------------
    KEEP REFS CURRENT
    --------------------------------------------------
  */

  useEffect(() => {
    userIdRef.current =
      userId;
  }, [userId]);

  useEffect(() => {
    handleRef.current =
      handle;
  }, [handle]);

  useEffect(() => {
    micEnabledRef.current =
      micEnabled;
  }, [micEnabled]);

  useEffect(() => {
    proximityEnabledRef.current =
      proximityEnabled;
  }, [proximityEnabled]);

  useEffect(() => {
    proximityRangeRef.current =
      proximityRange;
  }, [proximityRange]);

  useEffect(() => {
    partyMembersRef.current =
      partyMembers;
  }, [partyMembers]);

  /*
    --------------------------------------------------
    STARTUP
    --------------------------------------------------
  */

  useEffect(() => {
    initializeIdentity();
    requestPermissions();

    return () => {
      stopContinuousLocationTracking();

      closeAllPeerConnections();

      localStreamRef.current
        ?.getTracks()
        .forEach(
          (track) => {
            track.stop();
          }
        );

      localStreamRef.current =
        null;

      try {
        InCallManager.stop();
      } catch {}
    };
  }, []);

  /*
    --------------------------------------------------
    v0.5C7 ANDROID APP RESUME + AUDIO ROUTE
    --------------------------------------------------
  */

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      async (nextState) => {
        const previousState = appStateRef.current;
        appStateRef.current = nextState;

        const resumed =
          (previousState === 'background' ||
            previousState === 'inactive') &&
          nextState === 'active';

        if (!resumed) {
          return;
        }

        console.log(
          'APP RESUME: foreground detected; proximity=',
          proximityEnabledRef.current ? 'OPEN' : 'CLOSED',
          'mic=',
          micEnabledRef.current ? 'ON' : 'OFF'
        );

        await recoverVoiceAfterResume();
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  /*
    --------------------------------------------------
    PERSISTENT IDENTITY
    --------------------------------------------------
  */
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLobbySplash(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);


  async function initializeIdentity() {
    try {
      let storedUserId =
        await AsyncStorage.getItem(
          STORAGE_USER_ID
        );

      let storedHandle =
        await AsyncStorage.getItem(
          STORAGE_HANDLE
        );

      const storedPersistentMuted =
        await AsyncStorage.getItem(
          STORAGE_PERSISTENT_MUTED_USER_IDS
        );

      const storedFavorites =
        await AsyncStorage.getItem(
          STORAGE_FAVORITE_USER_IDS
        );

      const storedProximityRange =
        await AsyncStorage.getItem(
          STORAGE_PROXIMITY_RANGE
        );

      const storedMicEnabled =
        await AsyncStorage.getItem(
          STORAGE_MIC_ENABLED
        );

      const loadedPersistentMuted =
        new Set<string>(
          storedPersistentMuted
            ? JSON.parse(storedPersistentMuted)
            : []
        );

      const loadedFavorites =
        new Set<string>(
          storedFavorites
            ? JSON.parse(storedFavorites)
            : []
        );

      persistentMutedUserIdsRef.current =
        loadedPersistentMuted;
      favoriteUserIdsRef.current =
        loadedFavorites;
      setPersistentMutedUserIds(
        new Set(loadedPersistentMuted)
      );
      setFavoriteUserIds(
        new Set(loadedFavorites)
      );

      const parsedStoredRange =
        storedProximityRange
          ? Number(storedProximityRange)
          : 100;

      const validStoredRange =
        PROXIMITY_RANGES.some(
          (item) =>
            item.value === parsedStoredRange
        )
          ? parsedStoredRange
          : 100;

      proximityRangeRef.current =
        validStoredRange;

      setProximityRange(
        validStoredRange
      );

      /*
        Privacy rule:
        Proximity ALWAYS starts closed on a fresh launch.
        We remember the user's preferred range, never the OPEN state.
      */
      proximityEnabledRef.current =
        false;

      setProximityEnabled(false);

      // v0.5C2: mic preference persists; Proximity still never does.
      const restoredMicEnabled =
        storedMicEnabled === 'true';

      micEnabledRef.current =
        restoredMicEnabled;
      setMicEnabled(restoredMicEnabled);

      console.log(
        'Restored microphone preference:',
        restoredMicEnabled ? 'ON' : 'OFF'
      );

      if (!storedUserId) {
        storedUserId =
          generateLobbyUserId();

        await AsyncStorage.setItem(
          STORAGE_USER_ID,
          storedUserId
        );

        console.log(
          'Created permanent Lobby userId:',
          storedUserId
        );
      } else {
        console.log(
          'Loaded permanent Lobby userId:',
          storedUserId
        );
      }

      if (!storedHandle) {
        storedHandle =
          'Lobby User';

        await AsyncStorage.setItem(
          STORAGE_HANDLE,
          storedHandle
        );
      }

      userIdRef.current =
        storedUserId;

      handleRef.current =
        storedHandle;

      setUserId(
        storedUserId
      );

      setHandle(
        storedHandle
      );

      setHandleDraft(
        storedHandle
      );

      setIdentityReady(
        true
      );

      /*
        Socket may already be connected by
        the time AsyncStorage finishes.
      */

      if (
        socketRef.current?.connected
      ) {
        registerIdentity();
      }
    } catch (error) {
      console.log(
        'Identity initialization error:',
        error
      );

      setIdentityMessage(
        'Identity storage error'
      );
    }
  }

  function registerIdentity() {
    const currentUserId =
      userIdRef.current;

    const currentHandle =
      handleRef.current;

    if (
      !currentUserId ||
      !socketRef.current?.connected
    ) {
      return;
    }

    console.log(
      'Registering Lobby identity:',
      currentUserId,
      currentHandle
    );

    socketRef.current.emit(
      'identity-register',
      {
        userId:
          currentUserId,

        handle:
          currentHandle,
      }
    );
  }

  async function saveHandle() {
    let cleaned =
      handleDraft.trim();

    if (!cleaned) {
      cleaned =
        'Lobby User';
    }

    cleaned =
      cleaned.slice(
        0,
        32
      );

    try {
      await AsyncStorage.setItem(
        STORAGE_HANDLE,
        cleaned
      );

      handleRef.current =
        cleaned;

      setHandle(
        cleaned
      );

      setHandleDraft(
        cleaned
      );

      setEditingHandle(false);

      setIdentityMessage(
        'Handle saved'
      );

      registerIdentity();

      setTimeout(
        () => {
          setIdentityMessage(
            ''
          );
        },
        1500
      );
    } catch (error) {
      console.log(
        'Handle save error:',
        error
      );

      setIdentityMessage(
        'Could not save handle'
      );
    }
  }

  /*
    --------------------------------------------------
    SOCKET.IO
    --------------------------------------------------
  */

  useEffect(() => {
    const socket = io(
      SERVER_URL,
      {
        transports: [
          'websocket',
        ],
      }
    );

    socketRef.current =
      socket;

    socket.on(
      'connect',
      () => {
        console.log(
          'Connected to Lobby server:',
          socket.id
        );

        reconnectGenerationRef.current += 1;

        /*
          v0.5C:
          A new Socket.IO session must never reuse stale
          WebRTC peers from the previous socket lifecycle.
        */
        closeAllPeerConnections();

        setServerConnected(
          true
        );

        /*
          Register stable identity first.
        */

        registerIdentity();

        socket.emit(
          'proximity-range-update',
          proximityRangeRef.current
        );

        /*
          v0.5C7 privacy/reconnect rule:
          - First Socket.IO connection after a true app launch: Proximity OFF.
          - Later network/socket reconnect in the SAME running app session:
            restore the in-memory Proximity state the user already chose.
        */
        if (!hasSocketConnectedOnceRef.current) {
          hasSocketConnectedOnceRef.current = true;

          proximityEnabledRef.current = false;
          setProximityEnabled(false);

          socket.emit('proximity-toggle', false);

          console.log(
            'C7 PRIVACY: fresh launch - Proximity forced CLOSED'
          );
        } else {
          const restoreProximity =
            proximityEnabledRef.current;

          socket.emit(
            'proximity-toggle',
            restoreProximity
          );

          console.log(
            'C7 RECONNECT: restoring Proximity:',
            restoreProximity ? 'OPEN' : 'CLOSED'
          );

          if (restoreProximity) {
            void startContinuousLocationTracking();
          }
        }
      }
    );

    socket.on(
      'disconnect',
      () => {
        console.log(
          'Disconnected from Lobby server'
        );

        setServerConnected(
          false
        );

        setNearbyCount(0);
        setNearbyUsers([]);

        closeAllPeerConnections();
      }
    );

    socket.on(
      'connect_error',
      (error) => {
        console.log(
          'Lobby server connection error:',
          error.message
        );

        setServerConnected(
          false
        );
      }
    );

    /*
      ------------------------------------------------
      IDENTITY CONFIRMATION
      ------------------------------------------------
    */

    socket.on(
      'identity-registered',
      (data) => {
        console.log(
          'Identity confirmed by server:',
          data
        );

        setIdentityMessage(
          'Identity connected'
        );

        setTimeout(
          () => {
            setIdentityMessage(
              ''
            );
          },
          1200
        );
      }
    );

    socket.on(
      'identity-error',
      (data) => {
        console.log(
          'Identity error:',
          data
        );

        setIdentityMessage(
          data?.message ??
            'Identity error'
        );
      }
    );

    /*
      ------------------------------------------------
      NEARBY USERS
      ------------------------------------------------
    */

    socket.on(
      'nearby-users',
      async (data) => {
        const voiceUsers:
          NearbyVoiceUser[] =
          data.voiceUsers ??
          [];

        nearbyVoiceUsersRef.current =
          voiceUsers;

        const normalNearbyUsers:
          NearbyUser[] =
          (
            data.users ??
            []
          ).map(
            (
              user: NearbyUser
            ) => ({
              ...user,

              voiceEligible:
                voiceUsers.some(
                  (
                    voiceUser
                  ) =>
                    voiceUser.socketId ===
                    user.socketId
                ),
            })
          );

        const displayUsers = [
          ...normalNearbyUsers,
        ];

        for (
          const voiceUser
          of voiceUsers
        ) {
          const alreadyListed =
            displayUsers.some(
              (user) =>
                user.socketId ===
                voiceUser.socketId
            );

          if (
            !alreadyListed
          ) {
            displayUsers.push({
              ...voiceUser,
              voiceEligible:
                true,
            });
          }
        }

        nearbyUsersRef.current =
          displayUsers;

        for (const user of displayUsers) {
          if (
            user.userId &&
            persistentMutedUserIdsRef.current.has(user.userId)
          ) {
            setPeerMuted(user.socketId, true);
          }
        }

        setNearbyUsers(
          displayUsers
        );

        setNearbyCount(
          data.count ?? 0
        );

        console.log(
          'Nearby update:',
          data.count,
          'Proximity voice candidates:',
          voiceUsers.length,
          'Range:',
          data.myProximityRangeMeters
        );

        if (
          proximityEnabledRef.current
        ) {
          await syncProximityVoicePeers(
            voiceUsers
          );
        } else {
          closeAllProximityPeers();
        }
      }
    );

    /*
      ------------------------------------------------
      PARTY
      ------------------------------------------------
    */

    socket.on(
      'party-update',
      async (data) => {
        const members:
          PartyMember[] =
          data.members ??
          [];

        partyMembersRef.current =
          members;

        setPartyCode(
          data.code ??
            null
        );

        setPartyMemberCount(
          data.memberCount ??
            0
        );

        setPartyMembers(
          members
        );

        for (const member of members) {
          if (
            member.userId &&
            persistentMutedUserIdsRef.current.has(member.userId)
          ) {
            setPeerMuted(member.socketId, true);
          }
        }

        setPartyMessage('');

        if (data.code) {
          const currentPartySocketIds =
            new Set(
              members.map(
                (member) =>
                  member.socketId
              )
            );

          for (
            const existingSocketId
            of Array.from(
              peerConnectionsRef.current.keys()
            )
          ) {
            if (
              existingSocketId !==
                socketRef.current?.id &&
              !currentPartySocketIds.has(
                existingSocketId
              ) &&
              !proximityPeerIdsRef.current.has(
                existingSocketId
              )
            ) {
              closePeerConnection(
                existingSocketId
              );
            }
          }

          await connectToPartyMembers(
            members
          );

          for (
            const member
            of members
          ) {
            if (
              member.socketId !==
                socketRef.current?.id
            ) {
              schedulePeerRecovery(
                member.socketId
              );
            }
          }
        }
      }
    );

    socket.on(
      'party-restored',
      (data) => {
        /*
          v0.5C1:
          This is informational only.

          Stale WebRTC state is already cleared on the fresh
          Socket.IO 'connect' event BEFORE identity/party restore.
          Closing peers here was racing the party-update event
          and destroying the newly rebuilt Party connection.
        */
        console.log(
          'Party restored by server:',
          data?.code
        );
      }
    );

    socket.on(
      'party-error',
      (data) => {
        setPartyMessage(
          data.message ??
            'Party error'
        );
      }
    );

    /*
      ------------------------------------------------
      WEBRTC OFFER
      ------------------------------------------------
    */

    socket.on(
      'webrtc-offer',
      async ({
        from,
        offer,
      }) => {
        console.log(
          'Received WebRTC offer from:',
          from
        );

        if (
          incomingOfferInFlightRef.current.has(
            from
          )
        ) {
          console.log(
            'NEGOTIATION: duplicate incoming offer ignored:',
            from
          );
          return;
        }

        incomingOfferInFlightRef.current.add(
          from
        );

        try {
          const peer =
            await getOrCreatePeerConnection(
              from
            );

          /*
            A second offer for the same peer can arrive while the
            first one is already being answered. Do not apply it
            over a non-stable signaling state.
          */
          if (
            peer.signalingState !==
              'stable'
          ) {
            console.log(
              'NEGOTIATION: incoming offer ignored in state:',
              from,
              peer.signalingState
            );
            return;
          }

          await peer.setRemoteDescription(
            new RTCSessionDescription(
              offer
            )
          );

          const answer =
            await peer.createAnswer();

          await peer.setLocalDescription(
            answer
          );

          socket.emit(
            'webrtc-answer',
            {
              target:
                from,

              answer,
            }
          );
        } catch (error) {
          console.log(
            'Offer handling error:',
            error
          );

          setVoiceError(
            String(error)
          );
        } finally {
          incomingOfferInFlightRef.current.delete(
            from
          );
        }
      }
    );

    socket.on(
      'webrtc-answer',
      async ({
        from,
        answer,
      }) => {
        console.log(
          'Received WebRTC answer from:',
          from
        );

        try {
          const peer =
            peerConnectionsRef.current.get(
              from
            );

          if (!peer) {
            return;
          }

          await peer.setRemoteDescription(
            new RTCSessionDescription(
              answer
            )
          );
        } catch (error) {
          console.log(
            'Answer handling error:',
            error
          );

          setVoiceError(
            String(error)
          );
        }
      }
    );

    socket.on(
      'webrtc-ice-candidate',
      async ({
        from,
        candidate,
      }) => {
        try {
          const peer =
            peerConnectionsRef.current.get(
              from
            );

          if (
            !peer ||
            !candidate
          ) {
            return;
          }

          await peer.addIceCandidate(
            new RTCIceCandidate(
              candidate
            )
          );
        } catch (error) {
          console.log(
            'ICE candidate error:',
            error
          );
        }
      }
    );

    socket.on(
      'voice-peer-left',
      (
        socketId
      ) => {
        console.log(
          'Peer left - cancelling recovery:',
          socketId
        );

        clearPeerRecoveryTimer(
          socketId
        );

        closePeerConnection(
          socketId
        );
      }
    );

    return () => {
      socket.disconnect();
    };
  }, []);

  /*
    --------------------------------------------------
    LOCATION SEND
    --------------------------------------------------
  */

  useEffect(() => {
    if (
      !coordinates ||
      !socketRef.current
        ?.connected
    ) {
      return;
    }

    socketRef.current.emit(
      'location-update',
      coordinates
    );
  }, [coordinates]);

  /*
    --------------------------------------------------
    PERMISSIONS
    --------------------------------------------------
  */

  async function requestPermissions() {
    await requestMicrophonePermission();
    await requestLocationPermission();
  }

  async function requestMicrophonePermission() {
    if (
      Platform.OS !==
      'android'
    ) {
      setMicPermission(
        'granted'
      );

      return;
    }

    const result =
      await PermissionsAndroid.request(
        PermissionsAndroid
          .PERMISSIONS
          .RECORD_AUDIO
      );

    setMicPermission(
      result ===
        PermissionsAndroid
          .RESULTS
          .GRANTED
        ? 'granted'
        : 'denied'
    );
  }

  async function requestLocationPermission() {
    const {
      status,
    } =
      await Location.requestForegroundPermissionsAsync();

    if (
      status !==
      'granted'
    ) {
      setLocationPermission(
        'denied'
      );

      return;
    }

    setLocationPermission(
      'granted'
    );

    const position =
      await Location.getCurrentPositionAsync(
        {
          accuracy:
            Location.Accuracy
              .High,
        }
      );

    setCoordinates({
      latitude:
        position.coords
          .latitude,

      longitude:
        position.coords
          .longitude,
    });
  }

  /*
    --------------------------------------------------
    CONTINUOUS LOCATION
    --------------------------------------------------
  */

  async function startBackgroundLocationTracking() {
    if (
      Platform.OS !==
      'android'
    ) {
      return;
    }

    try {
      const foreground =
        await Location
          .getForegroundPermissionsAsync();

      if (
        foreground.status !==
        'granted'
      ) {
        console.log(
          '0.5D BACKGROUND LOCATION: foreground permission missing'
        );

        return;
      }

      let background =
        await Location
          .getBackgroundPermissionsAsync();

      if (
        background.status !==
        'granted'
      ) {
        console.log(
          '0.5D BACKGROUND LOCATION: requesting background permission'
        );

        background =
          await Location
            .requestBackgroundPermissionsAsync();
      }

      if (
        background.status !==
        'granted'
      ) {
        console.log(
          '0.5D BACKGROUND LOCATION: permission denied'
        );

        return;
      }

      const alreadyRunning =
        await Location
          .hasStartedLocationUpdatesAsync(
            LOBBY_BACKGROUND_LOCATION_TASK
          );

      if (
        alreadyRunning
      ) {
        return;
      }

      await Location
        .startLocationUpdatesAsync(
          LOBBY_BACKGROUND_LOCATION_TASK,
          {
            accuracy:
              Location.Accuracy.High,

            timeInterval:
              2000,

            distanceInterval:
              2,

            pausesUpdatesAutomatically:
              false,

            foregroundService: {
              notificationTitle:
                'Lobby proximity active',

              notificationBody:
                'Updating your position while Lobby is in the background',

              notificationColor:
                '#208AEF',

              /*
                Screen locking keeps the service alive.
                Removing/swiping Lobby away ends it.
              */
              killServiceOnDestroy:
                true,
            },
          }
        );

      console.log(
        '0.5D BACKGROUND LOCATION: STARTED'
      );
    } catch (error) {
      console.log(
        '0.5D BACKGROUND LOCATION START ERROR:',
        error
      );
    }
  }

  async function stopBackgroundLocationTracking() {
    if (
      Platform.OS !==
      'android'
    ) {
      return;
    }

    try {
      const running =
        await Location
          .hasStartedLocationUpdatesAsync(
            LOBBY_BACKGROUND_LOCATION_TASK
          );

      if (
        running
      ) {
        await Location
          .stopLocationUpdatesAsync(
            LOBBY_BACKGROUND_LOCATION_TASK
          );

        console.log(
          '0.5D BACKGROUND LOCATION: STOPPED'
        );
      }
    } catch (error) {
      console.log(
        '0.5D BACKGROUND LOCATION STOP ERROR:',
        error
      );
    }
  }

  async function startContinuousLocationTracking() {
    if (
      locationSubscriptionRef.current
    ) {
      return;
    }

    if (
      locationPermission !==
      'granted'
    ) {
      console.log(
        'Continuous location not started: permission not granted'
      );

      return;
    }

    console.log(
      'Starting continuous proximity location tracking'
    );

    try {
      locationSubscriptionRef.current =
        await Location.watchPositionAsync(
          {
            accuracy:
              Location
                .Accuracy
                .High,

            timeInterval:
              1000,

            distanceInterval:
              1,
          },

          (
            position
          ) => {
            const nextCoordinates =
              {
                latitude:
                  position
                    .coords
                    .latitude,

                longitude:
                  position
                    .coords
                    .longitude,
              };

            setCoordinates(
              nextCoordinates
            );

            console.log(
              'Proximity location update:',
              nextCoordinates.latitude.toFixed(
                6
              ),
              nextCoordinates.longitude.toFixed(
                6
              )
            );
          }
        );
    } catch (
      error
    ) {
      console.log(
        'Continuous location tracking error:',
        error
      );
    }
  }

  function stopContinuousLocationTracking() {
    if (
      !locationSubscriptionRef.current
    ) {
      return;
    }

    console.log(
      'Stopping continuous proximity location tracking'
    );

    locationSubscriptionRef.current.remove();

    locationSubscriptionRef.current =
      null;
  }

  /*
    --------------------------------------------------
    RANGE
    --------------------------------------------------
  */

  async function changeProximityRange(
    rangeMeters:
      number
  ) {
    proximityRangeRef.current =
      rangeMeters;

    setProximityRange(
      rangeMeters
    );

    try {
      await AsyncStorage.setItem(
        STORAGE_PROXIMITY_RANGE,
        String(rangeMeters)
      );
    } catch (error) {
      console.log(
        'Could not persist proximity range:',
        error
      );
    }

    console.log(
      'LOCAL RANGE:',
      rangeMeters,
      'meters'
    );

    socketRef.current?.emit(
      'proximity-range-update',
      rangeMeters
    );
  }

  function stepProximityRange(
    direction: -1 | 1
  ) {
    const currentIndex =
      PROXIMITY_RANGES.findIndex(
        (item) =>
          item.value === proximityRange
      );

    const safeIndex =
      currentIndex >= 0 ? currentIndex : 3;

    const nextIndex = Math.max(
      0,
      Math.min(
        PROXIMITY_RANGES.length - 1,
        safeIndex + direction
      )
    );

    changeProximityRange(
      PROXIMITY_RANGES[nextIndex].value
    );
  }

  /*
    --------------------------------------------------
    PERSISTENT MICROPHONE STREAM
    --------------------------------------------------
  */

  async function ensureLocalAudioStream() {
    if (
      localStreamRef.current
    ) {
      return localStreamRef.current;
    }

    console.log(
      'Creating persistent WebRTC microphone stream...'
    );

    const stream =
      await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

    const audioTracks =
      stream.getAudioTracks();

    console.log(
      'Persistent microphone stream ready. Audio tracks:',
      audioTracks.length
    );

    if (
      audioTracks.length ===
      0
    ) {
      throw new Error(
        'WebRTC returned no audio track.'
      );
    }

    /*
      v0.5C2: a newly-created stream inherits the
      restored/current microphone preference.
    */
    audioTracks.forEach(
      (
        track
      ) => {
        track.enabled =
          micEnabledRef.current;
      }
    );

    console.log(
      'MIC AUTHORITY: new local track state =',
      micEnabledRef.current
        ? 'ON'
        : 'OFF'
    );

    console.log(
      'Persistent microphone track initial state:',
      micEnabledRef.current ? 'ON' : 'OFF'
    );

    localStreamRef.current =
      stream;

    return stream;
  }

  async function turnMicrophoneOn() {
    try {
      setVoiceError('');

      if (
        micPermission !==
        'granted'
      ) {
        setVoiceError(
          'Microphone permission is not granted.'
        );

        return;
      }

      const stream =
        await ensureLocalAudioStream();

      micEnabledRef.current =
        true;

      stream
        .getAudioTracks()
        .forEach(
          (
            track
          ) => {
            track.enabled =
              true;
          }
        );

      /*
        v0.5C:
        Make sure every live peer still has our current
        local microphone track after app/network recovery.
      */
      const localAudioTrack =
        stream.getAudioTracks()[0];

      if (localAudioTrack) {
        for (
          const [
            socketId,
            peer
          ]
          of peerConnectionsRef.current.entries()
        ) {
          const senders =
            peer.getSenders?.() ?? [];

          for (
            const sender
            of senders
          ) {
            if (
              sender.track?.kind ===
              'audio'
            ) {
              sender.track.enabled =
                true;
            }
          }

          const hasAudioSender =
            senders.some(
              (sender: any) =>
                sender.track?.kind ===
                  'audio'
            );

          if (!hasAudioSender) {
            try {
              peer.addTrack(
                localAudioTrack,
                stream
              );

              console.log(
                'RECOVERY: reattached mic track to:',
                socketId
              );
            } catch (error) {
              console.log(
                'RECOVERY: mic track attach failed:',
                socketId,
                error
              );
            }
          }
        }
      }

      setMicEnabled(
        true
      );

      await AsyncStorage.setItem(
        STORAGE_MIC_ENABLED,
        'true'
      );

      console.log(
        'MIC ON - outbound audio enabled'
      );
    } catch (
      error
    ) {
      console.log(
        'Microphone ON error:',
        error
      );

      setVoiceError(
        String(error)
      );
    }
  }

  async function turnMicrophoneOff() {
    micEnabledRef.current =
      false;

    localStreamRef.current
      ?.getAudioTracks()
      .forEach(
        (
          track
        ) => {
          track.enabled =
            false;
        }
      );

    /*
      v0.5C5:
      Also force every active RTCRtpSender's audio track OFF.
      This prevents a stale/new peer from continuing to transmit
      after the local mic control says muted.
    */
    for (
      const [
        socketId,
        peer
      ]
      of peerConnectionsRef.current.entries()
    ) {
      const senders =
        peer.getSenders?.() ?? [];

      for (
        const sender
        of senders
      ) {
        if (
          sender.track?.kind ===
          'audio'
        ) {
          sender.track.enabled =
            false;

          console.log(
            'MIC AUTHORITY: sender disabled for:',
            socketId
          );
        }
      }
    }

    setMicEnabled(
      false
    );

    try {
      await AsyncStorage.setItem(
        STORAGE_MIC_ENABLED,
        'false'
      );
    } catch (error) {
      console.log(
        'Could not persist microphone OFF state:',
        error
      );
    }

    setVoiceError('');

    console.log(
      'MIC OFF - outbound audio disabled, receive remains active'
    );
  }

  function clearPeerRecoveryTimer(
    socketId: string
  ) {
    const timer =
      peerRecoveryTimersRef.current.get(
        socketId
      );

    if (timer) {
      clearTimeout(timer);
      peerRecoveryTimersRef.current.delete(
        socketId
      );
    }
  }

  function schedulePeerRecovery(
    socketId: string
  ) {
    clearPeerRecoveryTimer(
      socketId
    );

    const generation =
      reconnectGenerationRef.current;

    const timer = setTimeout(
      async () => {
        peerRecoveryTimersRef.current.delete(
          socketId
        );

        if (
          generation !==
          reconnectGenerationRef.current
        ) {
          return;
        }

        const peer =
          peerConnectionsRef.current.get(
            socketId
          );

        if (
          peer &&
          (
            peer.connectionState ===
              'connected' ||
            peer.connectionState ===
              'connecting'
          )
        ) {
          return;
        }

        console.log(
          'RECOVERY: rebuilding peer:',
          socketId
        );

        closePeerConnection(
          socketId
        );

        const mySocketId =
          socketRef.current?.id;

        if (
          mySocketId &&
          mySocketId < socketId
        ) {
          try {
            await createOfferForPeer(
              socketId
            );
          } catch (error) {
            console.log(
              'RECOVERY offer failed:',
              socketId,
              error
            );
          }
        }
      },
      2500
    );

    peerRecoveryTimersRef.current.set(
      socketId,
      timer
    );
  }

  /*
    --------------------------------------------------
    PEER CREATION
    --------------------------------------------------
  */

  async function getOrCreatePeerConnection(
    remoteSocketId:
      string
  ) {
    const existing =
      peerConnectionsRef.current.get(
        remoteSocketId
      );

    if (
      existing
    ) {
      if (
        existing.connectionState ===
          'failed' ||
        existing.connectionState ===
          'closed'
      ) {
        closePeerConnection(
          remoteSocketId
        );
      } else {
        return existing;
      }
    }

    console.log(
      'Creating WebRTC peer:',
      remoteSocketId
    );

    const stream =
      await ensureLocalAudioStream();

    const peer =
      new RTCPeerConnection(
        RTC_CONFIGURATION
      );

    peerConnectionsRef.current.set(
      remoteSocketId,
      peer
    );

    // v0.5C7.2: WebRTC can briefly report a non-zero inbound
    // audioLevel when a peer is attached/rebuilt even when nobody
    // is speaking. Ignore only the indicator during this settle window.
    speakingUntilRef.current.delete(
      remoteSocketId
    );
    speakingIgnoreUntilRef.current.set(
      remoteSocketId,
      Date.now() + 1000
    );

    stream
      .getAudioTracks()
      .forEach(
        (
          track
        ) => {
          /*
            v0.5C5:
            The UI/ref mic state is authoritative.
            A newly-created peer must never inherit a stale
            enabled track while Lobby says MIC OFF.
          */
          track.enabled =
            micEnabledRef.current;

          peer.addTrack(
            track,
            stream
          );
        }
      );

    localTrackPeerIdsRef.current.add(
      remoteSocketId
    );

    peer.addEventListener(
      'icecandidate',
      (
        event: any
      ) => {
        if (
          !event.candidate
        ) {
          return;
        }

        socketRef.current?.emit(
          'webrtc-ice-candidate',
          {
            target:
              remoteSocketId,

            candidate:
              event.candidate,
          }
        );
      }
    );

    peer.addEventListener(
      'connectionstatechange',
      () => {
        console.log(
          'Peer state:',
          remoteSocketId,
          peer.connectionState
        );

        if (
          peer.connectionState ===
          'connected'
        ) {
          clearPeerRecoveryTimer(
            remoteSocketId
          );
        } else if (
          peer.connectionState ===
            'failed' ||
          peer.connectionState ===
            'disconnected'
        ) {
          schedulePeerRecovery(
            remoteSocketId
          );
        } else if (
          peer.connectionState ===
            'closed'
        ) {
          /*
            v0.5C3:
            CLOSED means this peer was deliberately torn down
            (leave, disconnect cleanup, proximity close, stale socket).
            Do NOT resurrect it.
          */
          clearPeerRecoveryTimer(
            remoteSocketId
          );
        }

        updateVoiceStates();
      }
    );

    peer.addEventListener(
      'track',
      (event: any) => {
        console.log(
          'REMOTE AUDIO RECEIVED FROM:',
          remoteSocketId
        );

        activateLobbyAudioRoute();

        const remoteTrack =
          event.track;

        if (
          remoteTrack &&
          remoteTrack.kind === 'audio'
        ) {
          clearPeerRecoveryTimer(
            remoteSocketId
          );
          const existingTracks =
            remoteAudioTracksRef.current.get(
              remoteSocketId
            ) ?? [];

          if (
            !existingTracks.includes(
              remoteTrack
            )
          ) {
            existingTracks.push(
              remoteTrack
            );

            remoteAudioTracksRef.current.set(
              remoteSocketId,
              existingTracks
            );
          }

          remoteTrack.enabled =
            !mutedPeerIdsRef.current.has(
              remoteSocketId
            );
        }
      }
    );

    return peer;
  }

  /*
    --------------------------------------------------
    OFFER
    --------------------------------------------------
  */

  async function createOfferForPeer(
    remoteSocketId:
      string
  ) {
    if (
      offerInFlightRef.current.has(
        remoteSocketId
      )
    ) {
      console.log(
        'NEGOTIATION: duplicate outgoing offer suppressed:',
        remoteSocketId
      );
      return;
    }

    offerInFlightRef.current.add(
      remoteSocketId
    );

    try {
      const peer =
        await getOrCreatePeerConnection(
          remoteSocketId
        );

      if (
        peer.signalingState !==
          'stable'
      ) {
        console.log(
          'NEGOTIATION: outgoing offer skipped in state:',
          remoteSocketId,
          peer.signalingState
        );
        return;
      }

      const offer =
        await peer.createOffer(
          {
            offerToReceiveAudio:
              true,
          }
        );

      await peer.setLocalDescription(
        offer
      );

      console.log(
        'Sending WebRTC offer to:',
        remoteSocketId
      );

      socketRef.current?.emit(
        'webrtc-offer',
        {
          target:
            remoteSocketId,

          offer,
        }
      );
    } finally {
      /*
        Keep the lock until the offer is actually placed.
        The answer handler/next update can negotiate again later
        if the connection fails.
      */
      offerInFlightRef.current.delete(
        remoteSocketId
      );
    }
  }

  /*
    --------------------------------------------------
    PARTY CONNECTIONS
    --------------------------------------------------
  */

  async function connectToPartyMembers(
    members:
      PartyMember[]
  ) {
    const mySocketId =
      socketRef.current
        ?.id;

    if (
      !mySocketId
    ) {
      return;
    }

    for (
      const member
      of members
    ) {
      if (
        member.socketId ===
        mySocketId
      ) {
        continue;
      }

      if (
        mySocketId <
          member.socketId &&
        !peerConnectionsRef.current.has(
          member.socketId
        )
      ) {
        console.log(
          'Starting PARTY voice connection with:',
          member.socketId
        );

        await createOfferForPeer(
          member.socketId
        );
      }
    }
  }

  /*
    --------------------------------------------------
    PROXIMITY CONNECTIONS
    --------------------------------------------------
  */

  async function syncProximityVoicePeers(
    voiceUsers:
      NearbyVoiceUser[]
  ) {
    const mySocketId =
      socketRef.current
        ?.id;

    if (
      !mySocketId
    ) {
      return;
    }

    console.log(
      'Syncing proximity peers:',
      voiceUsers.map(
        (
          user
        ) =>
          user.socketId
      )
    );

    const desiredIds =
      new Set(
        voiceUsers.map(
          (
            user
          ) =>
            user.socketId
        )
      );

    for (
      const existingId
      of Array.from(
        proximityPeerIdsRef.current
      )
    ) {
      if (
        !desiredIds.has(
          existingId
        )
      ) {
        console.log(
          'Closing expired proximity peer:',
          existingId
        );

        closePeerConnection(
          existingId
        );
      }
    }

    for (
      const user
      of voiceUsers
    ) {
      const remoteSocketId =
        user.socketId;

      if (
        remoteSocketId ===
        mySocketId
      ) {
        continue;
      }

      const sameParty =
        partyMembersRef.current.some(
          (
            member
          ) =>
            member.socketId ===
            remoteSocketId
        );

      if (
        sameParty
      ) {
        continue;
      }

      proximityPeerIdsRef.current.add(
        remoteSocketId
      );

      if (
        mySocketId <
          remoteSocketId &&
        !peerConnectionsRef.current.has(
          remoteSocketId
        )
      ) {
        console.log(
          'Starting PROXIMITY voice connection with:',
          remoteSocketId,
          'distance:',
          user.distanceMeters,
          'effective range:',
          user.effectiveRangeMeters
        );

        await createOfferForPeer(
          remoteSocketId
        );
      }
    }

    for (
      const user
      of voiceUsers
    ) {
      if (
        user.socketId !==
          mySocketId
      ) {
        schedulePeerRecovery(
          user.socketId
        );
      }
    }

    updateVoiceStates();
  }

  /*
    --------------------------------------------------
    ACTIVE SPEAKER - v0.4B

    Poll inbound WebRTC audio stats. A short hold time keeps
    the indicator from flickering between syllables.
    --------------------------------------------------
  */

  useEffect(() => {
    let cancelled = false;

    const SPEAKING_THRESHOLD = 0.012;
    const SPEAKING_HOLD_MS = 700;

    const readAudioLevel = (report: any) => {
      let highest = 0;

      const inspect = (stat: any) => {
        if (!stat) return;

        const isInboundAudio =
          stat.type === 'inbound-rtp' &&
          (stat.kind === 'audio' ||
            stat.mediaType === 'audio');

        if (!isInboundAudio) return;

        const level = Number(stat.audioLevel);

        if (Number.isFinite(level)) {
          highest = Math.max(highest, level);
        }
      };

      if (report?.forEach) {
        report.forEach(inspect);
      } else if (Array.isArray(report)) {
        report.forEach(inspect);
      } else if (report && typeof report === 'object') {
        Object.values(report).forEach(inspect);
      }

      return highest;
    };

    const poll = async () => {
      const now = Date.now();

      await Promise.all(
        Array.from(
          peerConnectionsRef.current.entries()
        ).map(async ([socketId, peer]) => {
          try {
            const report = await peer.getStats();
            const level = readAudioLevel(report);

            const speakingIgnoreUntil =
              speakingIgnoreUntilRef.current.get(socketId) ?? 0;

            if (
              now >= speakingIgnoreUntil &&
              level >= SPEAKING_THRESHOLD
            ) {
              speakingUntilRef.current.set(
                socketId,
                now + SPEAKING_HOLD_MS
              );
            }

            if (micEnabledRef.current) {
              let outboundLevel = 0;

              const inspectOutbound = (stat: any) => {
                if (!stat) return;

                const isLocalAudioSource =
                  stat.type === 'media-source' &&
                  (stat.kind === 'audio' ||
                    stat.mediaType === 'audio');

                const isOutboundAudio =
                  stat.type === 'outbound-rtp' &&
                  (stat.kind === 'audio' ||
                    stat.mediaType === 'audio');

                if (
                  !isLocalAudioSource &&
                  !isOutboundAudio
                ) {
                  return;
                }

                const value = Number(
                  stat.audioLevel ??
                    stat.audioLevelValue
                );

                if (Number.isFinite(value)) {
                  outboundLevel = Math.max(
                    outboundLevel,
                    value
                  );
                }
              };

              if (report?.forEach) {
                report.forEach(inspectOutbound);
              } else if (Array.isArray(report)) {
                report.forEach(inspectOutbound);
              } else if (
                report &&
                typeof report === 'object'
              ) {
                Object.values(report).forEach(
                  inspectOutbound
                );
              }

              if (
                outboundLevel >= SPEAKING_THRESHOLD
              ) {
                localSpeakingUntilRef.current =
                  now + SPEAKING_HOLD_MS;
              }
            }
          } catch {
            // Some Android/WebRTC builds may briefly reject
            // stats while a peer is connecting or closing.
          }
        })
      );

      if (cancelled) return;

      const next = new Set<string>();

      speakingUntilRef.current.forEach(
        (until, socketId) => {
          if (until > Date.now()) {
            next.add(socketId);
          } else {
            speakingUntilRef.current.delete(socketId);
          }
        }
      );

      setSpeakingPeerIds(next);

      setLocalSpeaking(
        micEnabledRef.current &&
          localSpeakingUntilRef.current >
            Date.now()
      );
    };

    const timer = setInterval(poll, 200);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  /*
    --------------------------------------------------
    PERSONAL MUTE - v0.4A
    --------------------------------------------------
  */

  function setPeerMuted(
    socketId: string,
    shouldMute: boolean
  ) {
    const next = new Set(
      mutedPeerIdsRef.current
    );

    if (shouldMute) {
      next.add(socketId);
    } else {
      next.delete(socketId);
    }

    mutedPeerIdsRef.current =
      next;

    setMutedPeerIds(
      new Set(next)
    );

    const remoteTracks =
      remoteAudioTracksRef.current.get(
        socketId
      ) ?? [];

    remoteTracks.forEach(
      (track) => {
        track.enabled =
          !shouldMute;
      }
    );

    console.log(
      shouldMute
        ? 'PERSONAL MUTE ON:'
        : 'PERSONAL MUTE OFF:',
      socketId
    );
  }

  function togglePeerMute(
    socketId: string
  ) {
    const isMuted =
      mutedPeerIdsRef.current.has(
        socketId
      );

    setPeerMuted(
      socketId,
      !isMuted
    );
  }

  function socketIdsForUserId(
    targetUserId: string
  ) {
    const ids = new Set<string>();

    partyMembersRef.current.forEach((member) => {
      if (member.userId === targetUserId) {
        ids.add(member.socketId);
      }
    });

    nearbyUsersRef.current.forEach((user) => {
      if (user.userId === targetUserId) {
        ids.add(user.socketId);
      }
    });

    return Array.from(ids);
  }

  async function togglePersistentMute(
    targetUserId: string
  ) {
    const next = new Set(
      persistentMutedUserIdsRef.current
    );
    const shouldMute =
      !next.has(targetUserId);

    if (shouldMute) {
      next.add(targetUserId);
    } else {
      next.delete(targetUserId);
    }

    persistentMutedUserIdsRef.current = next;
    setPersistentMutedUserIds(new Set(next));

    await AsyncStorage.setItem(
      STORAGE_PERSISTENT_MUTED_USER_IDS,
      JSON.stringify(Array.from(next))
    );

    socketIdsForUserId(targetUserId).forEach(
      (socketId) => setPeerMuted(socketId, shouldMute)
    );

    console.log(
      shouldMute
        ? 'PERSISTENT MUTE ON:'
        : 'PERSISTENT MUTE OFF:',
      targetUserId
    );
  }

  async function toggleFavorite(
    targetUserId: string
  ) {
    const next = new Set(
      favoriteUserIdsRef.current
    );

    if (next.has(targetUserId)) {
      next.delete(targetUserId);
    } else {
      next.add(targetUserId);
    }

    favoriteUserIdsRef.current = next;
    setFavoriteUserIds(new Set(next));

    await AsyncStorage.setItem(
      STORAGE_FAVORITE_USER_IDS,
      JSON.stringify(Array.from(next))
    );
  }


  /*
    --------------------------------------------------
    COMPACT 3-STATE USER AUDIO CONTROL - v0.4D

    Normal -> session mute -> persistent mute -> normal
    --------------------------------------------------
  */

  async function cyclePeerAudioState(
    socketId: string,
    targetUserId?: string | null
  ) {
    const isPersistentMuted =
      !!targetUserId &&
      persistentMutedUserIdsRef.current.has(
        targetUserId
      );

    const isSessionMuted =
      mutedPeerIdsRef.current.has(
        socketId
      );

    /*
      Persistent mute -> normal.
    */
    if (
      isPersistentMuted &&
      targetUserId
    ) {
      await togglePersistentMute(
        targetUserId
      );

      return;
    }

    /*
      Session mute -> persistent mute.

      If no permanent userId is available,
      simply return to normal instead.
    */
    if (isSessionMuted) {
      if (targetUserId) {
        await togglePersistentMute(
          targetUserId
        );
      } else {
        setPeerMuted(
          socketId,
          false
        );
      }

      return;
    }

    /*
      Normal -> session mute.
    */
    setPeerMuted(
      socketId,
      true
    );
  }

  function audioStateIcon(
    isMuted: boolean,
    isPersistentMuted: boolean
  ) {
    if (isPersistentMuted) {
      return '\uD83D\uDEAB';
    }

    if (isMuted) {
      return '\uD83D\uDD07';
    }

    return '\uD83D\uDD0A';
  }

  /*
    --------------------------------------------------
    v0.5C7 RESUME RECOVERY
    --------------------------------------------------
  */

  function activateLobbyAudioRoute() {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      // Put Android in an active voice-call audio session and default
      // built-in playback to the loudspeaker instead of the earpiece.
      InCallManager.start({ media: 'audio' });
      InCallManager.setSpeakerphoneOn(true);

      console.log(
        'AUDIO ROUTE: Android voice session active; speakerphone requested'
      );
    } catch (error) {
      console.log(
        'AUDIO ROUTE error:',
        error
      );
    }
  }

  async function refreshLocationForResume() {
    try {
      const position =
        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

      const nextCoordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setCoordinates(nextCoordinates);

      socketRef.current?.emit(
        'location-update',
        nextCoordinates
      );

      socketRef.current?.emit(
        'proximity-range-update',
        proximityRangeRef.current
      );

      console.log(
        'APP RESUME: location/range refreshed'
      );
    } catch (error) {
      console.log(
        'APP RESUME: location refresh failed:',
        error
      );
    }
  }

  async function recoverVoiceAfterResume() {
    if (resumeRecoveryInFlightRef.current) {
      console.log(
        'APP RESUME: recovery already in flight'
      );
      return;
    }

    resumeRecoveryInFlightRef.current = true;

    try {
      activateLobbyAudioRoute();

      // Reassert the user's mic authority on the persistent local track.
      const stream = await ensureLocalAudioStream();
      stream.getAudioTracks().forEach((track) => {
        track.enabled = micEnabledRef.current;
      });

      console.log(
        'APP RESUME: microphone authority restored:',
        micEnabledRef.current ? 'ON' : 'OFF'
      );

      if (!socketRef.current?.connected) {
        console.log(
          'APP RESUME: socket not connected; Socket.IO reconnect will rebuild peers'
        );
        return;
      }

      if (proximityEnabledRef.current) {
        await startContinuousLocationTracking();
        await refreshLocationForResume();

        socketRef.current.emit(
          'proximity-toggle',
          true
        );

        /*
          Android can leave a WebRTC object reporting "connected" while
          its Proximity media path is stale after background/screen-off.
          Party peers are intentionally left alone.
        */
        const staleProximityIds = Array.from(
          proximityPeerIdsRef.current
        );

        console.log(
          'APP RESUME: rebuilding Proximity-only peers:',
          staleProximityIds
        );

        for (const socketId of staleProximityIds) {
          closePeerConnection(socketId);
        }

        // Give the close operations a moment to settle, then rebuild from
        // the latest server-approved proximity candidate list.
        await new Promise((resolve) =>
          setTimeout(resolve, 350)
        );

        await syncProximityVoicePeers(
          nearbyVoiceUsersRef.current
        );
      }

      // Party peers are not torn down on a normal foreground resume.
      // If one actually failed, the existing C6 recovery timer handles it.
      for (const member of partyMembersRef.current) {
        if (
          member.socketId !== socketRef.current?.id
        ) {
          schedulePeerRecovery(member.socketId);
        }
      }

      console.log(
        'APP RESUME: C7 voice recovery complete'
      );
    } catch (error) {
      console.log(
        'APP RESUME recovery error:',
        error
      );
      setVoiceError(String(error));
    } finally {
      resumeRecoveryInFlightRef.current = false;
    }
  }

  /*
    --------------------------------------------------
    CLOSE PEERS
    --------------------------------------------------
  */

  function closeAllProximityPeers() {
    for (
      const socketId
      of Array.from(
        proximityPeerIdsRef.current
      )
    ) {
      closePeerConnection(
        socketId
      );
    }

    proximityPeerIdsRef.current.clear();

    setProximityVoiceConnected(
      false
    );
  }

  function closePeerConnection(
    socketId:
      string
  ) {
    clearPeerRecoveryTimer(
      socketId
    );

    offerInFlightRef.current.delete(
      socketId
    );

    incomingOfferInFlightRef.current.delete(
      socketId
    );

    const peer =
      peerConnectionsRef.current.get(
        socketId
      );

    if (
      peer
    ) {
      peer.close();

      peerConnectionsRef.current.delete(
        socketId
      );
    }

    remoteAudioTracksRef.current.delete(
      socketId
    );

    // v0.5C7.2: never carry an old speaking indication across a
    // deliberate peer close/rebuild.
    speakingUntilRef.current.delete(
      socketId
    );
    speakingIgnoreUntilRef.current.delete(
      socketId
    );
    setSpeakingPeerIds(
      (current) => {
        if (!current.has(socketId)) return current;
        const next = new Set(current);
        next.delete(socketId);
        return next;
      }
    );

    localTrackPeerIdsRef.current.delete(
      socketId
    );

    proximityPeerIdsRef.current.delete(
      socketId
    );

    updateVoiceStates();
  }

  function closeAllPeerConnections() {
    for (
      const timer
      of peerRecoveryTimersRef.current.values()
    ) {
      clearTimeout(timer);
    }

    peerRecoveryTimersRef.current.clear();

    offerInFlightRef.current.clear();
    incomingOfferInFlightRef.current.clear();

    for (
      const peer
      of peerConnectionsRef.current.values()
    ) {
      peer.close();
    }

    peerConnectionsRef.current.clear();

    remoteAudioTracksRef.current.clear();

    localTrackPeerIdsRef.current.clear();

    proximityPeerIdsRef.current.clear();

    setVoiceConnected(
      false
    );

    setProximityVoiceConnected(
      false
    );
  }

  /*
    --------------------------------------------------
    VOICE STATUS
    --------------------------------------------------
  */

  function updateVoiceStates() {
    let anyConnected =
      false;

    let proximityConnected =
      false;

    for (
      const [
        socketId,
        peer,
      ]
      of peerConnectionsRef.current.entries()
    ) {
      if (
        peer.connectionState ===
        'connected'
      ) {
        anyConnected =
          true;

        if (
          proximityPeerIdsRef.current.has(
            socketId
          )
        ) {
          proximityConnected =
            true;
        }
      }
    }

    setVoiceConnected(
      anyConnected
    );

    setProximityVoiceConnected(
      proximityConnected
    );
  }

  /*
    --------------------------------------------------
    PROXIMITY
    --------------------------------------------------
  */

  const permissionsReady =
    micPermission ===
      'granted' &&
    locationPermission ===
      'granted';

  const systemReady =
    permissionsReady &&
    serverConnected &&
    identityReady;

  async function toggleProximity() {
    if (
      !systemReady
    ) {
      return;
    }

    const next =
      !proximityEnabledRef.current;

    proximityEnabledRef.current =
      next;

    setProximityEnabled(
      next
    );

    console.log(
      'LOCAL PROXIMITY:',
      next
        ? 'OPEN'
        : 'CLOSED',
      'range:',
      proximityRangeRef.current
    );

    socketRef.current?.emit(
      'proximity-toggle',
      next
    );

    if (
      next
    ) {
      activateLobbyAudioRoute();

      await startContinuousLocationTracking();

      await startBackgroundLocationTracking();
    } else {
      stopContinuousLocationTracking();

      await stopBackgroundLocationTracking();

      closeAllProximityPeers();
    }
  }

  /*
    --------------------------------------------------
    PARTY
    --------------------------------------------------
  */

  function createParty() {
    socketRef.current?.emit(
      'create-party'
    );
  }

  function joinParty() {
    const cleanedCode =
      joinCode
        .trim()
        .toUpperCase();

    if (
      !cleanedCode
    ) {
      setPartyMessage(
        'Enter a party code'
      );

      return;
    }

    socketRef.current?.emit(
      'join-party',
      cleanedCode
    );
  }

  function leaveParty() {
    socketRef.current?.emit(
      'leave-party'
    );

    setPartyCode(
      null
    );

    setPartyMemberCount(
      0
    );

    setPartyMembers(
      []
    );

    partyMembersRef.current =
      [];
  }

  /*
    --------------------------------------------------
    VOICE STATUS TEXT
    --------------------------------------------------
  */

  let voiceStatusText =
    'VOICE READY';

  if (
    proximityVoiceConnected
  ) {
    voiceStatusText =
      micEnabled
        ? 'PROXIMITY VOICE \u00B7 MIC ON'
        : 'PROXIMITY VOICE \u00B7 MIC MUTED';
  } else if (
    voiceConnected
  ) {
    voiceStatusText =
      micEnabled
        ? 'VOICE CONNECTED \u00B7 MIC ON'
        : 'VOICE CONNECTED \u00B7 MIC MUTED';
  } else if (
    micEnabled
  ) {
    voiceStatusText =
      'MICROPHONE LIVE';
  } else {
    voiceStatusText =
      'MICROPHONE MUTED';
  }

  /*
    --------------------------------------------------
    UI
    --------------------------------------------------
  */

  const selectedRange =
    PROXIMITY_RANGES.find(
      (item) => item.value === proximityRange
    )?.label ?? `${proximityRange} m`;

  const handleEstablished =
    handle.trim() !== '' &&
    handle !== 'Lobby User';


  if (showLobbySplash) {
    return (
      <View style={styles.lobbySplashContainer}>
        <StatusBar hidden />
        <Image
          source={require('../../assets/lobby-splash.png')}
          style={styles.lobbySplashImage}
          resizeMode="stretch"
        />
      </View>
    );
  }
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={styles.screen}>
        <View style={styles.cockpit}>
          <View style={styles.headerRow}>
            <Text style={styles.brand}>LOBBY</Text>

            <Pressable
              onPress={() => {
                setHandleDraft(handle);
                setEditingHandle(true);
              }}
              style={styles.identityInline}
              hitSlop={8}
            >
              <Text
                style={styles.identityInlineText}
                numberOfLines={1}
              >
                @{handle}
              </Text>
              <Ionicons
                name="pencil-outline"
                size={13}
                color="#68737E"
              />
              <View
                style={[
                  styles.onlineDot,
                  {
                    backgroundColor: systemReady
                      ? '#38D47A'
                      : '#E0A43A',
                  },
                ]}
              />
            </Pressable>
          </View>

          {(!handleEstablished || editingHandle) && (
            <View style={styles.setupRow}>
              <TextInput
                value={handleDraft}
                onChangeText={setHandleDraft}
                placeholder="CHOOSE HANDLE"
                placeholderTextColor="#59616B"
                maxLength={32}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.setupInput}
              />
              <Pressable
                onPress={saveHandle}
                style={styles.setupSaveButton}
              >
                <Text style={styles.setupSaveText}>
                  SAVE
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.controlDeck}>
            <View style={styles.controlCell}>
              <Text style={styles.controlLabel}>MIC</Text>
              <Pressable
                onPress={
                  micEnabled
                    ? turnMicrophoneOff
                    : turnMicrophoneOn
                }
                style={[
                  styles.micControl,
                  localSpeaking &&
                    styles.micControlSpeaking,
                  !micEnabled &&
                    styles.controlDisabled,
                ]}
              >
                <Ionicons
                  name={
                    micEnabled
                      ? 'mic'
                      : 'mic-off'
                  }
                  size={24}
                  color={
                    localSpeaking
                      ? '#FF6B6B'
                      : micEnabled
                        ? '#FFFFFF'
                        : '#7A838C'
                  }
                />
              </Pressable>
            </View>

            <View style={styles.controlCell}>
              <Text style={styles.controlLabel}>PROX</Text>
              <Pressable
                onPress={toggleProximity}
                disabled={!systemReady}
                style={[
                  styles.proxControl,
                  proximityEnabled &&
                    styles.proxControlOpen,
                  !systemReady &&
                    styles.controlDisabled,
                ]}
              >
                <Ionicons
                  name={
                    proximityEnabled
                      ? 'radio'
                      : 'radio-outline'
                  }
                  size={25}
                  color={
                    proximityEnabled
                      ? '#62A9FF'
                      : '#FFFFFF'
                  }
                />
              </Pressable>
            </View>

            <View
              style={[
                styles.controlCell,
                styles.rangeCell,
              ]}
            >
              <Text style={styles.controlLabel}>RANGE</Text>
              <View style={styles.rangeControl}>
                <Pressable
                  onPress={() => stepProximityRange(-1)}
                  style={styles.rangeStep}
                >
                  <Ionicons
                    name="remove"
                    size={22}
                    color="#FFFFFF"
                  />
                </Pressable>
                <Text style={styles.rangeValue}>
                  {selectedRange}
                </Text>
                <Pressable
                  onPress={() => stepProximityRange(1)}
                  style={styles.rangeStep}
                >
                  <Ionicons
                    name="add"
                    size={22}
                    color="#FFFFFF"
                  />
                </Pressable>
              </View>
            </View>
          </View>

          {!!voiceError && (
            <Text style={styles.errorCompact}>
              {voiceError}
            </Text>
          )}
        </View>

        <ScrollView
          style={styles.peopleScroll}
          contentContainerStyle={styles.peopleContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>PARTY</Text>
            {partyCode && (
              <Text style={styles.sectionMeta}>
                {partyCode} {'\u00B7'} {partyMemberCount}
              </Text>
            )}
          </View>

          {partyCode ? (
            <>
              {partyMembers.map((member) => {
                const isMe =
                  member.socketId === socketRef.current?.id;
                const isMuted =
                  mutedPeerIds.has(member.socketId);
                const isSpeaking =
                  speakingPeerIds.has(member.socketId);
                const isPersistentMuted =
                  !!member.userId &&
                  persistentMutedUserIds.has(member.userId);
                const isFavorite =
                  !!member.userId &&
                  favoriteUserIds.has(member.userId);

                return (
                  <View
                    key={member.socketId}
                    style={styles.compactUserRow}
                  >
                    <Text
                      style={styles.compactUserName}
                      numberOfLines={1}
                    >
                      @{member.handle ||
                        member.name ||
                        'Lobby User'}
                      {isMe ? ' (YOU)' : ''}
                    </Text>

                    {!isMe && (
                      <View style={styles.compactUserControls}>
                        {!!member.userId && (
                          <Pressable
                            onPress={() =>
                              toggleFavorite(member.userId!)
                            }
                            style={styles.compactIconButton}
                            hitSlop={8}
                          >
                            <Ionicons
                              name={
                                isFavorite
                                  ? 'star'
                                  : 'star-outline'
                              }
                              size={23}
                              color={
                                isFavorite
                                  ? '#FFFFFF'
                                  : '#7D8791'
                              }
                            />
                          </Pressable>
                        )}

                        <Pressable
                          onPress={() =>
                            cyclePeerAudioState(
                              member.socketId,
                              member.userId
                            )
                          }
                          style={[
                            styles.compactAudioButton,
                            isSpeaking &&
                              !isMuted &&
                              !isPersistentMuted &&
                              styles.compactAudioButtonSpeaking,
                            isMuted &&
                              !isPersistentMuted &&
                              styles.compactAudioButtonMuted,
                            isPersistentMuted &&
                              styles.compactAudioButtonPersistent,
                          ]}
                          hitSlop={8}
                        >
                          <Ionicons
                            name={
                              isPersistentMuted
                                ? 'ban'
                                : isMuted
                                  ? 'volume-mute'
                                  : 'volume-high'
                            }
                            size={22}
                            color={
                              isPersistentMuted
                                ? '#FF6B6B'
                                : isMuted
                                  ? '#7D8791'
                                  : '#FFFFFF'
                            }
                          />
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })}

              <Pressable
                onPress={leaveParty}
                style={styles.partyUtilityButton}
              >
                <Text style={styles.partyUtilityText}>
                  LEAVE PARTY
                </Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.partyJoinRow}>
              <Pressable
                onPress={createParty}
                style={styles.partyCreateButton}
              >
                <Text style={styles.partyCreateText}>
                  CREATE
                </Text>
              </Pressable>

              <TextInput
                value={joinCode}
                onChangeText={(text) =>
                  setJoinCode(text.toUpperCase())
                }
                placeholder="PARTY CODE"
                placeholderTextColor="#59616B"
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.partyCodeInput}
              />

              <Pressable
                onPress={joinParty}
                style={styles.partyJoinButton}
              >
                <Text style={styles.partyJoinText}>JOIN</Text>
              </Pressable>
            </View>
          )}

          {!!partyMessage && (
            <Text style={styles.errorCompact}>
              {partyMessage}
            </Text>
          )}

          <View
            style={[
              styles.sectionHeaderRow,
              styles.nearbyHeader,
            ]}
          >
            <Text style={styles.sectionTitle}>NEARBY</Text>
            <Text style={styles.sectionMeta}>
              {nearbyCount}
            </Text>
          </View>

          {nearbyUsers.length === 0 ? (
            <Text style={styles.emptyText}>
              {proximityEnabled
                ? 'No Lobby users in range.'
                : 'Proximity is closed.'}
            </Text>
          ) : (
            nearbyUsers.map((user) => {
              const isMuted =
                mutedPeerIds.has(user.socketId);
              const isSpeaking =
                speakingPeerIds.has(user.socketId);
              const isPersistentMuted =
                !!user.userId &&
                persistentMutedUserIds.has(user.userId);
              const isFavorite =
                !!user.userId &&
                favoriteUserIds.has(user.userId);

              const isPartyMember =
                partyMembers.some(
                  (member) =>
                    member.socketId === user.socketId ||
                    (!!user.userId &&
                      !!member.userId &&
                      member.userId === user.userId)
                );

              /*
                Nearby display state:
                - persistent mute always wins
                - explicit session mute stays muted
                - proximity closed visually mutes nearby audio
                - proximity open + otherwise eligible = audible
              */
              const nearbyDisplayMuted =
                !isPersistentMuted &&
                (isMuted || !proximityEnabled);

              const nearbyDisplaySpeaking =
                proximityEnabled &&
                isSpeaking &&
                !isMuted &&
                !isPersistentMuted;

              return (
                <View
                  key={user.socketId}
                  style={styles.compactUserRow}
                >
                  <Text
                    style={[
                      styles.compactUserName,
                      isPartyMember &&
                        styles.nearbyPartyMemberName,
                    ]}
                    numberOfLines={1}
                  >
                    @{user.handle ||
                      user.name ||
                      'Lobby User'}
                  </Text>

                  <View style={styles.compactUserControls}>
                    {!!user.userId && (
                      <Pressable
                        onPress={() =>
                          toggleFavorite(user.userId!)
                        }
                        style={styles.compactIconButton}
                        hitSlop={8}
                      >
                        <Ionicons
                          name={
                            isFavorite
                              ? 'star'
                              : 'star-outline'
                          }
                          size={23}
                          color={
                            isFavorite
                              ? '#FFFFFF'
                              : '#7D8791'
                          }
                        />
                      </Pressable>
                    )}

                    <Pressable
                      onPress={() =>
                        cyclePeerAudioState(
                          user.socketId,
                          user.userId
                        )
                      }
                      style={[
                        styles.compactAudioButton,
                        nearbyDisplaySpeaking &&
                          styles.compactAudioButtonSpeaking,
                        nearbyDisplayMuted &&
                          styles.compactAudioButtonMuted,
                        isPersistentMuted &&
                          styles.compactAudioButtonPersistent,
                      ]}
                      hitSlop={8}
                    >
                      <Ionicons
                        name={
                          isPersistentMuted
                            ? 'ban'
                            : nearbyDisplayMuted
                              ? 'volume-mute'
                              : 'volume-high'
                        }
                        size={22}
                        color={
                          isPersistentMuted
                            ? '#FF6B6B'
                            : nearbyDisplayMuted
                              ? '#7D8791'
                              : '#FFFFFF'
                        }
                      />
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.telemetryBar}>
          <Text style={styles.telemetryText}>
            {serverConnected ? '\u25CF ONLINE' : '\u25CB OFFLINE'}
          </Text>
          <Text style={styles.telemetryText}>
            PARTY {partyCode ? partyMemberCount : 0}
          </Text>
          <Text style={styles.telemetryText}>
            NEARBY {nearbyCount}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#07090C' },
  screen: { flex: 1, backgroundColor: '#07090C' },
  cockpit: {
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: '#242B33',
    backgroundColor: '#0B0F14',
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  brand: {
    color: '#FFFFFF', fontSize: 24, fontWeight: '900',
    letterSpacing: 2,
  },
  identityInline: {
    flexDirection: 'row', alignItems: 'center',
    gap: 7, maxWidth: '60%',
  },
  identityInlineText: {
    color: '#D9E0E7', fontSize: 14, fontWeight: '800',
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  setupRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  setupInput: {
    flex: 1, height: 40, borderRadius: 9, borderWidth: 1,
    borderColor: '#313A44', backgroundColor: '#11171D',
    color: '#FFFFFF', paddingHorizontal: 11, fontWeight: '700',
  },
  setupSaveButton: {
    minWidth: 70, height: 40, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E7EDF3',
  },
  setupSaveText: { color: '#07090C', fontWeight: '900', fontSize: 12 },
  controlDeck: {
    flexDirection: 'row', alignItems: 'stretch', gap: 8,
  },
  controlCell: { minWidth: 68, alignItems: 'center' },
  rangeCell: { flex: 1 },
  controlLabel: {
    color: '#77818C', fontSize: 10, fontWeight: '900',
    letterSpacing: 1, marginBottom: 5,
  },
  micControl: {
    width: 52, height: 44, borderRadius: 12, borderWidth: 1,
    borderColor: '#48535E', backgroundColor: '#161D24',
    alignItems: 'center', justifyContent: 'center',
  },
  micControlSpeaking: {
    borderColor: '#FF5D5D', borderWidth: 2,
    backgroundColor: '#3A1D1D',
  },
  micGlyph: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  proxControl: {
    width: 52, height: 44, borderRadius: 12, borderWidth: 1,
    borderColor: '#48535E', backgroundColor: '#161D24',
    alignItems: 'center', justifyContent: 'center',
  },
  proxControlOpen: {
    borderColor: '#62A9FF', borderWidth: 2,
    backgroundColor: '#13283C',
  },
  proxGlyph: { color: '#FFFFFF', fontSize: 25, lineHeight: 27 },
  controlDisabled: { opacity: 0.42 },
  rangeControl: {
    height: 44, width: '100%', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 12, borderWidth: 1, borderColor: '#313A44',
    backgroundColor: '#11171D', paddingHorizontal: 4,
  },
  rangeStep: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1C242D',
  },
  rangeStepText: {
    color: '#FFFFFF', fontSize: 22, fontWeight: '800', lineHeight: 24,
  },
  rangeValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  peopleScroll: { flex: 1 },
  peopleContent: {
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', minHeight: 28,
  },
  nearbyHeader: { marginTop: 14 },
  sectionTitle: {
    color: '#AAB4BE', fontSize: 11, fontWeight: '900',
    letterSpacing: 1.4,
  },
  sectionMeta: { color: '#68737E', fontSize: 11, fontWeight: '800' },
  compactUserRow: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 10,
    backgroundColor: '#0D1116', borderColor: '#242C34',
    borderWidth: 1, borderRadius: 11, paddingVertical: 5,
    paddingLeft: 12, paddingRight: 6, marginTop: 6,
  },
  compactUserName: {
    color: '#FFFFFF', fontSize: 15, fontWeight: '800', flex: 1,
  },
  nearbyPartyMemberName: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  },
  compactUserControls: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  compactIconButton: {
    width: 38, height: 38, alignItems: 'center',
    justifyContent: 'center', borderRadius: 10,
  },
  compactFavoriteIcon: {
    color: '#7D8791', fontSize: 27, lineHeight: 30,
  },
  compactFavoriteIconActive: { color: '#FFFFFF' },
  compactAudioButton: {
    width: 42, height: 38, alignItems: 'center',
    justifyContent: 'center', borderRadius: 10, borderWidth: 1,
    borderColor: '#39424D', backgroundColor: '#1C242D',
  },
  compactAudioButtonSpeaking: {
    borderColor: '#39D98A', backgroundColor: '#143224', borderWidth: 2,
  },
  compactAudioButtonMuted: {
    borderColor: '#59616B', backgroundColor: '#151A20',
  },
  compactAudioButtonPersistent: {
    borderColor: '#E25B5B', backgroundColor: '#3A2020', borderWidth: 2,
  },
  compactAudioIcon: { fontSize: 21, lineHeight: 24 },
  partyJoinRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6,
  },
  partyCreateButton: {
    height: 40, paddingHorizontal: 12, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E7EDF3',
  },
  partyCreateText: { color: '#07090C', fontSize: 11, fontWeight: '900' },
  partyCodeInput: {
    flex: 1, height: 40, borderRadius: 9, borderWidth: 1,
    borderColor: '#313A44', backgroundColor: '#11171D',
    color: '#FFFFFF', textAlign: 'center', fontWeight: '900',
    letterSpacing: 2,
  },
  partyJoinButton: {
    height: 40, paddingHorizontal: 14, borderRadius: 9,
    borderWidth: 1, borderColor: '#4A5662',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#171D24',
  },
  partyJoinText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  partyUtilityButton: {
    alignSelf: 'flex-end', marginTop: 7,
    paddingVertical: 7, paddingHorizontal: 10,
  },
  partyUtilityText: { color: '#78838E', fontSize: 10, fontWeight: '900' },
  emptyText: {
    color: '#59636E', fontSize: 12, marginTop: 8, marginBottom: 4,
  },
  telemetryBar: {
    minHeight: 34, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-around', paddingHorizontal: 12,
    borderTopWidth: 1, borderTopColor: '#242B33',
    backgroundColor: '#090C10',
  },
  telemetryText: {
    color: '#69747F', fontSize: 9, fontWeight: '900', letterSpacing: 0.6,
  },
  errorCompact: { color: '#FF7777', fontSize: 11, marginTop: 7 },

  lobbySplashContainer: {
    flex: 1,
    backgroundColor: '#05090D',
    overflow: 'hidden',
  },

  lobbySplashImage: {
    width: '100%',
    height: '100%',
  },
});









