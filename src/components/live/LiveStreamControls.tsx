import { Video, VideoOff, Mic, MicOff, Monitor, PhoneOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LiveStreamControlsProps {
  cameraEnabled: boolean;
  micEnabled: boolean;
  screenShareEnabled: boolean;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onToggleScreenShare: () => void;
  onEndStream: () => void;
}

export function LiveStreamControls({
  cameraEnabled,
  micEnabled,
  screenShareEnabled,
  onToggleCamera,
  onToggleMic,
  onToggleScreenShare,
  onEndStream,
}: LiveStreamControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3 py-3">
      <Button
        variant={cameraEnabled ? 'secondary' : 'destructive'}
        size="icon"
        onClick={onToggleCamera}
        title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
      >
        {cameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </Button>

      <Button
        variant={micEnabled ? 'secondary' : 'destructive'}
        size="icon"
        onClick={onToggleMic}
        title={micEnabled ? 'Mute mic' : 'Unmute mic'}
      >
        {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </Button>

      <Button
        variant={screenShareEnabled ? 'default' : 'secondary'}
        size="icon"
        onClick={onToggleScreenShare}
        title={screenShareEnabled ? 'Stop sharing' : 'Share screen'}
      >
        <Monitor className="h-4 w-4" />
      </Button>

      <Button variant="destructive" onClick={onEndStream} className="ml-4">
        <PhoneOff className="h-4 w-4 mr-2" /> End Stream
      </Button>
    </div>
  );
}
