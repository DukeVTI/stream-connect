import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Circle, Pause, Play, Square, Download } from 'lucide-react';
import { toast } from 'sonner';

interface RecordingControlsProps {
  sessionId: string;
  roomName: string;
  channelId: string;
  isPublisher: boolean;
}

interface Recording {
  id: string;
  status: 'pending' | 'recording' | 'processing' | 'completed' | 'failed' | 'paused';
  started_at: string;
  paused_at: string | null;
  recording_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
}

export function RecordingControls({
  sessionId,
  roomName,
  channelId,
  isPublisher,
}: RecordingControlsProps) {
  const { user } = useAuth();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  // Load initial recording state
  useEffect(() => {
    if (sessionId && isPublisher) {
      loadRecording();
    }
  }, [sessionId, isPublisher]);

  // Timer for recording duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && recording?.status === 'recording') {
      interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, recording?.status]);

  const loadRecording = async () => {
    try {
      const { data, error } = await supabase
        .from('recordings')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "no rows found"
        console.error('Error loading recording:', error);
        return;
      }

      if (data) {
        setRecording(data);
        if (data.status === 'recording' || data.status === 'paused') {
          setIsRecording(true);
          // Calculate duration
          if (data.started_at) {
            const start = new Date(data.started_at).getTime();
            const now = new Date().getTime();
            setRecordingDuration(Math.floor((now - start) / 1000));
          }
        }
      }
    } catch (error) {
      console.error('Failed to load recording:', error);
    }
  };

  const startRecording = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('livekit-egress', {
        body: {
          action: 'start',
          sessionId,
          roomName,
          channelId,
        },
      });

      if (error || !data?.success) {
        toast.error('Failed to start recording');
        return;
      }

      setRecording({
        id: data.recordingId,
        status: 'recording',
        started_at: new Date().toISOString(),
        paused_at: null,
        recording_url: null,
        thumbnail_url: null,
        duration_seconds: null,
        file_size_bytes: null,
      });

      setIsRecording(true);
      setRecordingDuration(0);
      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording');
    } finally {
      setLoading(false);
    }
  };

  const pauseRecording = async () => {
    if (!recording) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('livekit-egress', {
        body: {
          action: 'pause',
          recordingId: recording.id,
        },
      });

      if (error || !data?.success) {
        toast.error('Failed to pause recording');
        return;
      }

      setRecording({
        ...recording,
        status: 'paused',
        paused_at: new Date().toISOString(),
      });

      toast.success('Recording paused');
    } catch (error) {
      console.error('Error pausing recording:', error);
      toast.error('Failed to pause recording');
    } finally {
      setLoading(false);
    }
  };

  const resumeRecording = async () => {
    if (!recording) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('livekit-egress', {
        body: {
          action: 'resume',
          recordingId: recording.id,
        },
      });

      if (error || !data?.success) {
        toast.error('Failed to resume recording');
        return;
      }

      setRecording({
        ...recording,
        status: 'recording',
      });

      toast.success('Recording resumed');
    } catch (error) {
      console.error('Error resuming recording:', error);
      toast.error('Failed to resume recording');
    } finally {
      setLoading(false);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('livekit-egress', {
        body: {
          action: 'stop',
          recordingId: recording.id,
          recordingUrl: `https://${Deno.env.get('AWS_S3_BUCKET')}.s3.${Deno.env.get('AWS_REGION')}.amazonaws.com/recordings/${roomName}/${sessionId}.mp4`,
          durationSeconds: recordingDuration,
        },
      });

      if (error || !data?.success) {
        toast.error('Failed to stop recording');
        return;
      }

      setIsRecording(false);
      await loadRecording();
      toast.success('Recording stopped and saved');
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast.error('Failed to stop recording');
    } finally {
      setLoading(false);
    }
  };

  const downloadRecording = () => {
    if (recording?.recording_url) {
      window.open(recording.recording_url, '_blank');
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  };

  if (!isPublisher) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Circle className="h-4 w-4" />
              Recording
            </CardTitle>
            <CardDescription className="text-xs">
              {recording?.status === 'recording' && 'Recording in progress'}
              {recording?.status === 'paused' && 'Recording paused'}
              {recording?.status === 'completed' && 'Recording complete'}
              {recording?.status === 'processing' && 'Processing...'}
              {recording?.status === 'failed' && 'Recording failed'}
              {!recording && 'Not recording'}
            </CardDescription>
          </div>
          {recording?.status === 'recording' && (
            <div className="flex items-center gap-1 text-red-600">
              <Circle className="h-2 w-2 fill-red-600 animate-pulse" />
              <span className="text-xs font-medium">{formatDuration(recordingDuration)}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status Badge */}
        {recording && (
          <div className="flex items-center gap-2 mb-3">
            <Badge
              variant={
                recording.status === 'recording'
                  ? 'default'
                  : recording.status === 'paused'
                    ? 'secondary'
                    : recording.status === 'completed'
                      ? 'outline'
                      : 'destructive'
              }
            >
              {recording.status === 'recording' && (
                <>
                  <Circle className="h-2 w-2 mr-1 fill-current animate-pulse" />
                  Live
                </>
              )}
              {recording.status === 'paused' && 'Paused'}
              {recording.status === 'completed' && 'Completed'}
              {recording.status === 'processing' && 'Processing'}
              {recording.status === 'failed' && 'Failed'}
            </Badge>
            {recording.duration_seconds && (
              <span className="text-xs text-muted-foreground">
                {formatDuration(recording.duration_seconds)}
              </span>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="space-y-2">
          {!recording ? (
            <Button
              onClick={startRecording}
              className="w-full"
              variant="default"
              size="sm"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Circle className="h-3 w-3 mr-2 fill-current" />
                  Start Recording
                </>
              )}
            </Button>
          ) : recording.status === 'recording' ? (
            <div className="flex gap-2">
              <Button
                onClick={pauseRecording}
                className="flex-1"
                variant="outline"
                size="sm"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
              </Button>
              <Button
                onClick={stopRecording}
                className="flex-1"
                variant="destructive"
                size="sm"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
              </Button>
            </div>
          ) : recording.status === 'paused' ? (
            <div className="flex gap-2">
              <Button
                onClick={resumeRecording}
                className="flex-1"
                variant="default"
                size="sm"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
              </Button>
              <Button
                onClick={stopRecording}
                className="flex-1"
                variant="destructive"
                size="sm"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
              </Button>
            </div>
          ) : recording.status === 'completed' ? (
            <Button
              onClick={downloadRecording}
              className="w-full"
              variant="outline"
              size="sm"
              disabled={!recording.recording_url}
            >
              <Download className="h-3 w-3 mr-2" />
              Download Recording
            </Button>
          ) : null}
        </div>

        {/* Recording Info */}
        {recording && recording.status === 'completed' && (
          <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
            {recording.duration_seconds && (
              <p>Duration: {formatDuration(recording.duration_seconds)}</p>
            )}
            {recording.file_size_bytes && (
              <p>Size: {formatFileSize(recording.file_size_bytes)}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
