import { useEffect, useRef, useState, useCallback } from 'react';

interface WebRTCConfig {
  sessionId: string;
  participantId: string;
  isHost: boolean;
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
  const { sessionId, participantId, isHost } = config;

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

  // WebRTC configuration
  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // Initialize local media stream
  const initializeLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });

      setStreams((prev) => ({ ...prev, localStream: stream }));
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      throw error;
    }
  }, []);

  // Toggle microphone
  const toggleMic = useCallback(() => {
    if (streams.localStream) {
      const audioTrack = streams.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  }, [streams.localStream]);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    if (streams.localStream) {
      const videoTrack = streams.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  }, [streams.localStream]);

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

      // Add screen track to peer connection
      if (peerConnection.current) {
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnection.current
          .getSenders()
          .find((s) => s.track?.kind === 'video');

        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
      }

      // Notify other participant via WebSocket
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
    if (streams.screenStream) {
      streams.screenStream.getTracks().forEach((track) => track.stop());
      setStreams((prev) => ({ ...prev, screenStream: null }));
      setIsScreenSharing(false);

      // Restore camera track
      if (peerConnection.current && streams.localStream) {
        const videoTrack = streams.localStream.getVideoTracks()[0];
        const sender = peerConnection.current
          .getSenders()
          .find((s) => s.track?.kind === 'video');

        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
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
    }
  }, [streams.screenStream, streams.localStream, sessionId, participantId]);

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(rtcConfig);

    // Add local tracks to peer connection
    if (streams.localStream) {
      streams.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, streams.localStream!);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'ice-candidate',
            sessionId,
            participantId,
            candidate: event.candidate,
          })
        );
      }
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setStreams((prev) => ({ ...prev, remoteStream }));
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      setIsConnected(pc.connectionState === 'connected');
    };

    peerConnection.current = pc;
    return pc;
  }, [streams.localStream, sessionId, participantId]);

  // Initialize WebSocket signaling
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001/ws';
    const ws = new WebSocket(`${wsUrl}/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
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
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'participant-joined':
          // Other participant joined - initiate connection if host
          if (isHost) {
            const pc = createPeerConnection();
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            ws.send(
              JSON.stringify({
                type: 'offer',
                sessionId,
                participantId,
                offer,
              })
            );
          }
          break;

        case 'offer':
          // Received offer - create answer
          const pc = createPeerConnection();
          await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          ws.send(
            JSON.stringify({
              type: 'answer',
              sessionId,
              participantId,
              answer,
            })
          );
          break;

        case 'answer':
          // Received answer - set remote description
          if (peerConnection.current) {
            await peerConnection.current.setRemoteDescription(
              new RTCSessionDescription(message.answer)
            );
          }
          break;

        case 'ice-candidate':
          // Received ICE candidate
          if (peerConnection.current && message.candidate) {
            await peerConnection.current.addIceCandidate(
              new RTCIceCandidate(message.candidate)
            );
          }
          break;

        case 'participant-left':
          // Other participant left
          setStreams((prev) => ({ ...prev, remoteStream: null }));
          break;

        case 'screen-share-started':
          // Remote participant started screen sharing
          console.log('Remote screen share started');
          break;

        case 'screen-share-stopped':
          // Remote participant stopped screen sharing
          console.log('Remote screen share stopped');
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    return () => {
      ws.close();
    };
  }, [sessionId, participantId, isHost, createPeerConnection]);

  // Initialize local stream on mount
  useEffect(() => {
    initializeLocalStream();

    return () => {
      // Cleanup streams
      streams.localStream?.getTracks().forEach((track) => track.stop());
      streams.screenStream?.getTracks().forEach((track) => track.stop());
      peerConnection.current?.close();
    };
  }, [initializeLocalStream]);

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
