import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface WebRTCConfig {
  sessionId: string;
  participantId: string;
  isHost: boolean;
  onSignalMessage?: (message: any) => void;
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
  toggleMic: () => void;
  toggleCamera: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
}

export function useWebRTC(config: WebRTCConfig) {
  const { sessionId, participantId, isHost, onSignalMessage } = config;

  const [streams, setStreams] = useState<MediaStreams>({
    localStream: null,
    remoteStream: null,
    screenStream: null,
  });

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCleaningUpRef = useRef(false);
  const pendingCandidates = useRef<RTCIceCandidate[]>([]);

  // WebRTC configuration with multiple STUN/TURN servers
  const rtcConfig: RTCConfiguration = useMemo(() => {
    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ];

    const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
    const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

    if (turnUrl) {
      const turnServer: RTCIceServer = { urls: turnUrl };
      if (turnUsername && turnCredential) {
        turnServer.username = turnUsername;
        turnServer.credential = turnCredential;
      }
      iceServers.push(turnServer);
      console.log('dY"O Using TURN server for ICE fallback');
    }

    return {
      iceServers,
      iceCandidatePoolSize: 10,
    };
  }, []);

  // Initialize local media stream
  const initializeLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        },
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
      });

      localStreamRef.current = stream;
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
  }, []);

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
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      // Handle when user stops sharing via browser UI
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      setStreams((prev) => ({ ...prev, screenStream }));
      setIsScreenSharing(true);

      // Replace video track in peer connection
      if (peerConnection.current) {
        const screenTrack = screenStream.getVideoTracks()[0];
        const senders = peerConnection.current.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video');

        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
          console.log('✓ Replaced video track with screen share');
        }
      }

      // Notify other participant
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
  }, [sessionId, participantId]);

  // Stop screen sharing
  const stopScreenShare = useCallback(() => {
    setStreams((prev) => {
      if (prev.screenStream) {
        prev.screenStream.getTracks().forEach((track) => track.stop());
      }
      return { ...prev, screenStream: null };
    });
    setIsScreenSharing(false);

    // Restore camera track
    if (peerConnection.current && localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      const senders = peerConnection.current.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === 'video');

      if (videoSender && videoTrack) {
        videoSender.replaceTrack(videoTrack);
        console.log('✓ Restored camera video track');
      }
    }

    // Notify other participant
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'screen-share-stopped',
          sessionId,
          participantId,
        })
      );
    }
  }, [sessionId, participantId]);

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
    console.log('✓ Created new peer connection');

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
        console.log('🧊 New ICE candidate:', event.candidate.type);
        
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

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('🎥 Received remote track:', event.track.kind);
      
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        console.log('📺 Remote stream tracks:', {
          audio: remoteStream.getAudioTracks().length,
          video: remoteStream.getVideoTracks().length,
        });
        
        setStreams((prev) => ({ ...prev, remoteStream }));
      }
    };

    // Handle connection state
    pc.onconnectionstatechange = () => {
      console.log('🔌 Connection state:', pc.connectionState);
      
      const connected = pc.connectionState === 'connected';
      setIsConnected(connected);
      
      if (pc.connectionState === 'failed') {
        console.error('❌ Connection failed');
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
      
      if (pc.iceConnectionState === 'failed') {
        console.error('❌ ICE connection failed');
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
  }, [sessionId, participantId, rtcConfig]);

  // Initialize WebSocket signaling
  useEffect(() => {
    let mounted = true;
    isCleaningUpRef.current = false;

    const connectWebSocket = () => {
      if (isCleaningUpRef.current || !mounted) return;

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001/ws';
      const ws = new WebSocket(`${wsUrl}/${sessionId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        
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

        const message = JSON.parse(event.data);
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

                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: 'offer',
                      sessionId,
                      participantId,
                      offer: pc.localDescription,
                    })
                  );
                }
              }
              break;

            case 'offer':
              console.log('📥 Received offer');
              
              if (!isHost && localStreamRef.current) {
                console.log('🎯 Guest creating answer...');
                const pc = createPeerConnection();
                
                await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                console.log('✓ Set remote description');
                
                // Add any pending ICE candidates
                for (const candidate of pendingCandidates.current) {
                  await pc.addIceCandidate(candidate);
                  console.log('✓ Added pending ICE candidate');
                }
                pendingCandidates.current = [];
                
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                console.log('📤 Sending answer');

                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(
                    JSON.stringify({
                      type: 'answer',
                      sessionId,
                      participantId,
                      answer: pc.localDescription,
                    })
                  );
                }
              }
              break;

            case 'answer':
              console.log('📥 Received answer');
              
              if (peerConnection.current) {
                await peerConnection.current.setRemoteDescription(
                  new RTCSessionDescription(message.answer)
                );
                console.log('✓ Set remote description');
                
                // Add any pending ICE candidates
                for (const candidate of pendingCandidates.current) {
                  await peerConnection.current.addIceCandidate(candidate);
                  console.log('✓ Added pending ICE candidate');
                }
                pendingCandidates.current = [];
              }
              break;

            case 'ice-candidate':
              console.log('🧊 Received ICE candidate');
              
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
              console.log('Remote participant disconnected');
              setStreams((prev) => ({ ...prev, remoteStream: null }));
              setIsConnected(false);

              if (peerConnection.current) {
                peerConnection.current.close();
                peerConnection.current = null;
              }
              break;

            case 'screen-share-started':
              console.log('Remote screen share started');
              break;

            case 'screen-share-stopped':
              console.log('Remote screen share stopped');
              break;

            case 'recording-status':
            case 'recording-progress':
              onSignalMessage?.(message);
              break;

            default:
              onSignalMessage?.(message);
              console.log('Unhandled signaling message type:', message.type);
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
  }, [sessionId, participantId, isHost, onSignalMessage, createPeerConnection, initializeLocalStream]);

  const controls: MediaControls = {
    isMicOn,
    isCameraOn,
    isScreenSharing,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
  };

  return {
    streams,
    controls,
    isConnected,
  };
}

