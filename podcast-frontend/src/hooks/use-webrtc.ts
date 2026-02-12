import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

export type SignalMessage = {
  type?: string;
  trackType?: string;
  track_type?: string;
  status?: string;
  recordingId?: string;
  recording_id?: string;
  processingStatus?: string;
  processing_status?: string;
  participantId?: string;
  participant_id?: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  startedAt?: string;
  started_at?: string;
  endedAt?: string;
  ended_at?: string;
  uploadedChunks?: number;
  uploaded_chunks?: number;
  totalChunks?: number;
  total_chunks?: number;
  processedAssetPath?: string;
  processed_asset_path?: string;
  processedAt?: string;
  processed_at?: string;
  progress_percentage?: number;
  [key: string]: unknown;
};

interface WebRTCConfig {
  sessionId: string;
  participantId: string;
  isHost: boolean;
  mediaPreferences?: {
    audioDeviceId?: string | null;
    videoDeviceId?: string | null;
    initialMicOn?: boolean;
    initialCameraOn?: boolean;
  };
  onSignalMessage?: (message: SignalMessage) => void;
}

interface MediaStreams {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  screenStream: MediaStream | null;
}

interface MediaControls {
  isMicOn: boolean;
  isCameraOn: boolean;
  isScreenSharing: boolean;
  canScreenShare: boolean;
  screenShareSupportMessage: string | null;
  toggleMic: () => void;
  toggleCamera: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
}

interface UseWebRTCResult {
  streams: MediaStreams;
  controls: MediaControls;
  isConnected: boolean;
  sendSignal: (payload: SignalMessage) => boolean;
}

export function useWebRTC(config: WebRTCConfig): UseWebRTCResult {
  const { sessionId, participantId, isHost, mediaPreferences, onSignalMessage } = config;

  const [streams, setStreams] = useState<MediaStreams>({
    localStream: null,
    remoteStream: null,
    screenStream: null,
  });

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [canScreenShare, setCanScreenShare] = useState(true);
  const [screenShareSupportMessage, setScreenShareSupportMessage] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const screenSenderRef = useRef<RTCRtpSender | null>(null);
  const remoteScreenStreamIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCleaningUpRef = useRef(false);
  const pendingCandidates = useRef<RTCIceCandidate[]>([]);
  const stopScreenShareRef = useRef<(() => void)>(() => {});
  const isMakingOfferRef = useRef(false);
  const isSettingRemoteAnswerPendingRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const isPolite = useMemo(() => !isHost, [isHost]);

  const evaluateScreenShareSupport = useCallback(() => {
    if (typeof window === 'undefined') {
      return { supported: true, message: null as string | null };
    }

    if (!window.isSecureContext) {
      return {
        supported: false,
        message: 'Screen sharing requires HTTPS on mobile browsers.',
      };
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      return {
        supported: false,
        message: 'This browser does not support screen sharing.',
      };
    }

    return { supported: true, message: null as string | null };
  }, []);

  // WebRTC configuration with STUN and Metered.ca TURN servers
  const rtcConfig: RTCConfiguration = useMemo(() => {
    const iceServers: RTCIceServer[] = [
      // Google STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ];

    // Get Metered.ca credentials from environment variables
    const meteredUsername = process.env.NEXT_PUBLIC_METERED_USERNAME;
    const meteredPassword = process.env.NEXT_PUBLIC_METERED_PASSWORD;

    if (meteredUsername && meteredPassword) {
      // Add Metered.ca TURN servers
      iceServers.push(
        {
          urls: 'turn:a.relay.metered.ca:80',
          username: meteredUsername,
          credential: meteredPassword,
        },
        {
          urls: 'turn:a.relay.metered.ca:80?transport=tcp',
          username: meteredUsername,
          credential: meteredPassword,
        },
        {
          urls: 'turn:a.relay.metered.ca:443',
          username: meteredUsername,
          credential: meteredPassword,
        },
        {
          urls: 'turns:a.relay.metered.ca:443?transport=tcp',
          username: meteredUsername,
          credential: meteredPassword,
        }
      );
      console.log('✅ Metered.ca TURN servers configured');
    } else {
      console.warn('⚠️ TURN server credentials not found - connections may fail across different networks');
    }

    return {
      iceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all', // Allow all ICE candidates (host, srflx, relay)
    };
  }, []);

  useEffect(() => {
    const next = evaluateScreenShareSupport();
    setCanScreenShare(next.supported);
    setScreenShareSupportMessage(next.message);
  }, [evaluateScreenShareSupport]);

  // Initialize local media stream
  const initializeLocalStream = useCallback(async () => {
    const shouldRequestAudio = mediaPreferences?.initialMicOn ?? true;
    const shouldRequestVideo = mediaPreferences?.initialCameraOn ?? true;

    if (!shouldRequestAudio && !shouldRequestVideo) {
      const emptyStream = new MediaStream();
      localStreamRef.current = emptyStream;
      setIsMicOn(false);
      setIsCameraOn(false);
      setStreams((prev) => ({ ...prev, localStream: emptyStream }));
      console.log('âœ“ Local stream initialized with all local media disabled');
      return emptyStream;
    }

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
    };

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
    };

    if (mediaPreferences?.audioDeviceId && shouldRequestAudio) {
      audioConstraints.deviceId = { exact: mediaPreferences.audioDeviceId };
    }

    if (mediaPreferences?.videoDeviceId && shouldRequestVideo) {
      videoConstraints.deviceId = { exact: mediaPreferences.videoDeviceId };
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: shouldRequestAudio ? audioConstraints : false,
          video: shouldRequestVideo ? videoConstraints : false,
        });
      } catch (preferredDeviceError) {
        if (!mediaPreferences?.audioDeviceId && !mediaPreferences?.videoDeviceId) {
          throw preferredDeviceError;
        }

        console.warn('Preferred media device not available. Falling back to browser defaults.', preferredDeviceError);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: shouldRequestAudio
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 48000,
              }
            : false,
          video: shouldRequestVideo
            ? {
                width: { ideal: 1920, max: 1920 },
                height: { ideal: 1080, max: 1080 },
                frameRate: { ideal: 30, max: 30 },
              }
            : false,
        });
      }

      localStreamRef.current = stream;
      const shouldEnableMic = shouldRequestAudio;
      const shouldEnableCamera = shouldRequestVideo;
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();

      audioTracks.forEach((track) => {
        track.enabled = shouldEnableMic;
      });
      videoTracks.forEach((track) => {
        track.enabled = shouldEnableCamera;
      });

      setIsMicOn(shouldEnableMic && audioTracks.length > 0);
      setIsCameraOn(shouldEnableCamera && videoTracks.length > 0);
      setStreams((prev) => ({ ...prev, localStream: stream }));
      console.log('✓ Local stream initialized:', {
        audio: stream.getAudioTracks().length,
        video: stream.getVideoTracks().length,
      });
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }, [
    mediaPreferences?.audioDeviceId,
    mediaPreferences?.initialCameraOn,
    mediaPreferences?.initialMicOn,
    mediaPreferences?.videoDeviceId,
  ]);

  // Toggle microphone
  const toggleMic = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  }, []);

  // Start screen sharing
  const startScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      return;
    }

    try {
      const support = evaluateScreenShareSupport();
      setCanScreenShare(support.supported);
      setScreenShareSupportMessage(support.message);

      if (!support.supported) {
        const err = new Error(support.message ?? 'Screen sharing is not available on this device.');
        (err as Error & { name?: string }).name = 'NotSupportedError';
        throw err;
      }

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      const [screenTrack] = screenStream.getVideoTracks();
      if (!screenTrack) {
        throw new Error('No video track found in screen share stream');
      }

      screenTrack.contentHint = 'detail';
      screenTrack.onended = () => {
        stopScreenShareRef.current();
      };

      localScreenStreamRef.current = screenStream;
      setStreams((prev) => ({ ...prev, screenStream }));
      setIsScreenSharing(true);

      if (peerConnection.current) {
        try {
          const sender = peerConnection.current.addTrack(screenTrack, screenStream);
          screenSenderRef.current = sender;
        } catch (error) {
          console.error('Error attaching screen share track:', error);
        }
      }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'screen-share-started',
            sessionId,
            participantId,
          })
        );
      }
    } catch (error) {
      console.error('Error starting screen share:', error);
      throw error;
    }
  }, [evaluateScreenShareSupport, isScreenSharing, participantId, sessionId]);

  // Stop screen sharing
  const stopScreenShare = useCallback(() => {
    const currentScreenStream = localScreenStreamRef.current;

    if (screenSenderRef.current && peerConnection.current) {
      try {
        peerConnection.current.removeTrack(screenSenderRef.current);
      } catch (error) {
        console.error('Error removing screen share sender:', error);
      }
      screenSenderRef.current = null;
    }

    if (currentScreenStream) {
      currentScreenStream.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
    }

    setStreams((prev) => {
      if (!prev.screenStream) {
        return prev;
      }
      return { ...prev, screenStream: null };
    });
    setIsScreenSharing(false);
    remoteScreenStreamIdRef.current = null;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'screen-share-stopped',
          sessionId,
          participantId,
        })
      );
    }
  }, [participantId, sessionId]);

  useEffect(() => {
    stopScreenShareRef.current = stopScreenShare;
  }, [stopScreenShare]);

  const sendSignal = useCallback(
    (payload: SignalMessage): boolean => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn('Attempted to send signal on closed socket', payload);
        return false;
      }

      try {
        wsRef.current.send(JSON.stringify(payload));
        return true;
      } catch (error) {
        console.error('Failed to send signal payload', error, payload);
        return false;
      }
    },
    [],
  );

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    // Close existing connection
    if (peerConnection.current) {
      console.log('🔄 Closing existing peer connection');
      peerConnection.current.close();
      peerConnection.current = null;
    }

    // Clear pending candidates
    pendingCandidates.current = [];

    const pc = new RTCPeerConnection(rtcConfig);

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log(`➕ Adding local ${track.kind} track`);
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 ICE candidate:', {
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address || 'hidden',
        });
        
        // Log if we get a relay candidate (TURN working)
        if (event.candidate.type === 'relay') {
          console.log('✅ TURN server working - got relay candidate');
        }
        
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'ice-candidate',
              sessionId,
              participantId,
              candidate: event.candidate.toJSON(),
            })
          );
        }
      } else {
        console.log('🧊 ICE gathering complete');
      }
    };

    // Handle ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log('🧊 ICE gathering state:', pc.iceGatheringState);
    };

    pc.onnegotiationneeded = async () => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        isMakingOfferRef.current = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({
          type: 'offer',
          sessionId,
          participantId,
          offer: pc.localDescription ?? offer,
        });
      } catch (error) {
        console.error('Error during negotiationneeded:', error);
      } finally {
        isMakingOfferRef.current = false;
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('📹 Received remote track:', event.track.kind);

      const [incomingStream] = event.streams ?? [];
      if (!incomingStream) {
        return;
      }

      const trackLabel = (event.track.label || '').toLowerCase();
      const looksLikeScreen = event.track.kind === 'video' && (trackLabel.includes('screen') || trackLabel.includes('window') || trackLabel.includes('display') || trackLabel.includes('share'));

      if (event.track.kind === 'video') {
        setStreams((prev) => {
          const hasRemoteStream = Boolean(prev.remoteStream);
          const remoteStreamChanged = hasRemoteStream && prev.remoteStream?.id !== incomingStream.id;
          const isKnownScreen = prev.screenStream?.id === incomingStream.id;
          const shouldTreatAsScreen = looksLikeScreen || (remoteStreamChanged && !isKnownScreen);

          if (shouldTreatAsScreen) {
            remoteScreenStreamIdRef.current = incomingStream.id;
            event.track.onended = () => {
              setStreams((current) => {
                if (current.screenStream && current.screenStream.id === incomingStream.id) {
                  return { ...current, screenStream: null };
                }
                return current;
              });
              remoteScreenStreamIdRef.current = null;
            };

            if (isKnownScreen) {
              return prev;
            }

            return { ...prev, screenStream: incomingStream };
          }

          if (prev.remoteStream && prev.remoteStream.id === incomingStream.id) {
            return prev;
          }

          return { ...prev, remoteStream: incomingStream };
        });
        return;
      }

      setStreams((prev) => {
        if (prev.remoteStream && prev.remoteStream.id === incomingStream.id) {
          return prev;
        }

        return { ...prev, remoteStream: incomingStream };
      });
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
      console.log('🔌 Connection state:', pc.connectionState);
      
      const connected = pc.connectionState === 'connected';
      setIsConnected(connected);
      
      if (connected) {
        console.log('✅ WebRTC peer connection established successfully!');
      }
      
      if (pc.connectionState === 'failed') {
        console.error('❌ Connection failed - likely firewall or NAT issue');
        // Attempt to restart ICE
        if (pc.restartIce) {
          console.log('🔄 Restarting ICE...');
          pc.restartIce();
        }
      }
      
      if (pc.connectionState === 'disconnected') {
        console.warn('⚠️ Connection disconnected');
      }
      
      if (pc.connectionState === 'closed') {
        console.log('🔒 Connection closed');
      }
    };

    // Handle ICE connection state
    pc.oniceconnectionstatechange = () => {
      console.log('🧊 ICE connection state:', pc.iceConnectionState);
      
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        console.log('✅ ICE connection established');
      }
      
      if (pc.iceConnectionState === 'failed') {
        console.error('❌ ICE connection failed - TURN server may be needed or unreachable');
      }
      
      if (pc.iceConnectionState === 'disconnected') {
        console.warn('⚠️ ICE disconnected');
      }
    };

    // Handle signaling state
    pc.onsignalingstatechange = () => {
      console.log('📡 Signaling state:', pc.signalingState);
    };

    peerConnection.current = pc;
    return pc;
  }, [sessionId, participantId, rtcConfig, sendSignal]);

  // Initialize WebSocket signaling
  useEffect(() => {
    let mounted = true;
    isCleaningUpRef.current = false;

    const connectWebSocket = () => {
      if (isCleaningUpRef.current || !mounted) return;

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001/ws';
      console.log('🔌 Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(`${wsUrl}/${sessionId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected to:', wsUrl);
        
        if (!mounted || isCleaningUpRef.current) {
          ws.close();
          return;
        }

        // Join the session
        ws.send(
          JSON.stringify({
            type: 'join',
            sessionId,
            participantId,
            isHost,
          })
        );
      };

      ws.onmessage = async (event) => {
        if (!mounted || isCleaningUpRef.current) return;

        const message = JSON.parse(event.data) as SignalMessage;
        console.log('📨 Received:', message.type);

        try {
          switch (message.type) {
            case 'participant-joined':
              console.log('👤 Participant joined');
              
              // Host creates offer when guest joins
              if (isHost && localStreamRef.current) {
                console.log('🎯 Host creating offer...');
                const pc = createPeerConnection();
                
                const offer = await pc.createOffer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: true,
                });
                
                await pc.setLocalDescription(offer);
                console.log('📤 Sending offer');

                sendSignal({
                  type: 'offer',
                  sessionId,
                  participantId,
                  offer: pc.localDescription ?? offer,
                });
              }
              onSignalMessage?.(message);
              break;

            case 'offer':
              console.log('📥 Received offer');
              
              {
                if (!message.offer) {
                  console.warn('Received offer without SDP payload');
                  break;
                }

                let pc = peerConnection.current;
                if (!pc) {
                  pc = createPeerConnection();
                }

                const offerCollision = isMakingOfferRef.current || isSettingRemoteAnswerPendingRef.current || pc.signalingState !== 'stable';
                ignoreOfferRef.current = !isPolite && offerCollision;
                if (ignoreOfferRef.current) {
                  console.log('⚠️ Ignoring offer due to collision');
                  break;
                }

                try {
                  await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);
                  console.log('📤 Sending answer');
                  sendSignal({
                    type: 'answer',
                    sessionId,
                    participantId,
                    answer: pc.localDescription ?? answer,
                  });
                } catch (error) {
                  console.error('Error handling remote offer:', error);
                  break;
                }

                // Add any pending ICE candidates buffered before remote description
                for (const candidate of pendingCandidates.current) {
                  await pc.addIceCandidate(candidate);
                  console.log('✓ Added pending ICE candidate');
                }
                pendingCandidates.current = [];
              }
              break;

            case 'answer':
              console.log('📥 Received answer');
              
              if (peerConnection.current) {
                if (!message.answer) {
                  console.warn('Received answer without SDP payload');
                  break;
                }

                try {
                  isSettingRemoteAnswerPendingRef.current = true;
                  await peerConnection.current.setRemoteDescription(
                    new RTCSessionDescription(message.answer)
                  );
                  console.log('✓ Applied remote answer');
                } catch (error) {
                  console.error('Error applying remote answer:', error);
                } finally {
                  isSettingRemoteAnswerPendingRef.current = false;
                }

                for (const candidate of pendingCandidates.current) {
                  await peerConnection.current.addIceCandidate(candidate);
                  console.log('✓ Added buffered ICE candidate');
                }
                pendingCandidates.current = [];
              }
              break;

            case 'ice-candidate':
              console.log('🧊 Received ICE candidate');
              if (ignoreOfferRef.current) {
                console.log('⚠️ Skipping ICE candidate while ignoring offer');
                break;
              }
              
              if (message.candidate) {
                const candidate = new RTCIceCandidate(message.candidate);
                
                if (peerConnection.current?.remoteDescription) {
                  try {
                    await peerConnection.current.addIceCandidate(candidate);
                    console.log('✓ Added ICE candidate');
                  } catch (err) {
                    console.error('❌ Error adding ICE candidate:', err);
                  }
                } else {
                  // Queue candidates if remote description not set yet
                  console.log('📦 Queuing ICE candidate');
                  pendingCandidates.current.push(candidate);
                }
              }
              break;

            case 'participant-left':
              console.log('👋 Remote participant disconnected');
              setStreams((prev) => ({ ...prev, remoteStream: null }));
              setIsConnected(false);

              if (peerConnection.current) {
                peerConnection.current.close();
                peerConnection.current = null;
              }
              onSignalMessage?.(message);
              break;

            case 'screen-share-started':
              console.log('🖥️ Remote screen share started');
              break;

            case 'screen-share-stopped':
              console.log('🖥️ Remote screen share stopped');
              remoteScreenStreamIdRef.current = null;
              setStreams((prev) => {
                if (!prev.screenStream) {
                  return prev;
                }
                return { ...prev, screenStream: null };
              });
              break;

            case 'recording-status':
            case 'recording-progress':
              onSignalMessage?.(message);
              break;

            default:
              onSignalMessage?.(message);
              console.log('ℹ️ Unhandled signaling message type:', message.type);
          }
        } catch (error) {
          console.error('❌ Error handling message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };

      ws.onclose = (event) => {
        console.log('❌ WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });

        // Auto-reconnect if not intentional close
        if (mounted && !isCleaningUpRef.current && event.code !== 1000) {
          console.log('🔄 Reconnecting in 3s...');
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mounted && !isCleaningUpRef.current) {
              connectWebSocket();
            }
          }, 3000);
        }
      };
    };

    // Initialize and connect
    const initAndConnect = async () => {
      try {
        await initializeLocalStream();
        
        if (mounted && !isCleaningUpRef.current) {
          // Small delay to ensure stream is ready
          await new Promise(resolve => setTimeout(resolve, 500));
          connectWebSocket();
        }
      } catch (error) {
        console.error('❌ Failed to initialize:', error);
      }
    };

    initAndConnect();

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up WebRTC');
      mounted = false;
      isCleaningUpRef.current = true;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          console.log(`🛑 Stopped ${track.kind} track`);
        });
      }

      setStreams((prev) => {
        prev.screenStream?.getTracks().forEach((track) => track.stop());
        return prev;
      });

      if (peerConnection.current) {
        peerConnection.current.close();
      }
    };
  }, [sessionId, participantId, isHost, onSignalMessage, createPeerConnection, initializeLocalStream, sendSignal, isPolite]);

  const controls: MediaControls = {
    isMicOn,
    isCameraOn,
    isScreenSharing,
    canScreenShare,
    screenShareSupportMessage,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
  };

  return {
    streams,
    controls,
    isConnected,
    sendSignal,
  };
}
