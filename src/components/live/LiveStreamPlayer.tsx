import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteTrackPublication,
  Participant,
  LocalTrack,
  LocalVideoTrack,
  LocalAudioTrack,
  createLocalTracks,
} from 'livekit-client';

interface LiveStreamPlayerProps {
  token: string;
  serverUrl: string;
  isPublisher: boolean;
  onViewerCountChange?: (count: number) => void;
  onDisconnected?: () => void;
  cameraEnabled: boolean;
  micEnabled: boolean;
  screenShareEnabled: boolean;
}

export function LiveStreamPlayer({
  token,
  serverUrl,
  isPublisher,
  onViewerCountChange,
  onDisconnected,
  cameraEnabled,
  micEnabled,
  screenShareEnabled,
}: LiveStreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localTracksRef = useRef<LocalTrack[]>([]);

  useEffect(() => {
    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _participant: Participant) => {
      if (track.kind === Track.Kind.Video && videoRef.current) {
        track.attach(videoRef.current);
      } else if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        document.body.appendChild(el);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach();
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      onViewerCountChange?.(room.numParticipants);
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      onViewerCountChange?.(room.numParticipants);
    });

    room.on(RoomEvent.Disconnected, () => {
      setConnected(false);
      onDisconnected?.();
    });

    const connect = async () => {
      try {
        await room.connect(serverUrl, token);
        setConnected(true);
        onViewerCountChange?.(room.numParticipants);

        if (isPublisher) {
          const tracks = await createLocalTracks({ audio: true, video: true });
          localTracksRef.current = tracks;
          for (const track of tracks) {
            await room.localParticipant.publishTrack(track);
            if (track.kind === Track.Kind.Video && videoRef.current) {
              track.attach(videoRef.current);
            }
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to connect');
      }
    };

    connect();

    return () => {
      localTracksRef.current.forEach((t) => t.stop());
      room.disconnect();
    };
  }, [token, serverUrl]);

  // Toggle camera
  useEffect(() => {
    if (!connected || !isPublisher) return;
    const room = roomRef.current;
    if (!room) return;
    const camTrack = localTracksRef.current.find(
      (t) => t.kind === Track.Kind.Video
    ) as LocalVideoTrack | undefined;
    if (camTrack) {
      if (cameraEnabled) camTrack.unmute();
      else camTrack.mute();
    }
  }, [cameraEnabled, connected, isPublisher]);

  // Toggle mic
  useEffect(() => {
    if (!connected || !isPublisher) return;
    const micTrack = localTracksRef.current.find(
      (t) => t.kind === Track.Kind.Audio
    ) as LocalAudioTrack | undefined;
    if (micTrack) {
      if (micEnabled) micTrack.unmute();
      else micTrack.mute();
    }
  }, [micEnabled, connected, isPublisher]);

  // Screen share toggle
  useEffect(() => {
    if (!connected || !isPublisher) return;
    const room = roomRef.current;
    if (!room) return;

    if (screenShareEnabled) {
      room.localParticipant.setScreenShareEnabled(true);
    } else {
      room.localParticipant.setScreenShareEnabled(false);
    }
  }, [screenShareEnabled, connected, isPublisher]);

  if (error) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
        <p className="text-destructive text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isPublisher}
        className="w-full h-full object-contain"
      />
      {!connected && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <p className="text-muted-foreground text-sm">Connecting...</p>
        </div>
      )}
    </div>
  );
}
