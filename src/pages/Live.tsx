import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { LiveStreamPlayer } from '@/components/live/LiveStreamPlayer';
import { LiveStreamControls } from '@/components/live/LiveStreamControls';
import { LiveChat } from '@/components/live/LiveChat';
import { LiveCallQueue } from '@/components/live/LiveCallQueue';
import { LiveBadge } from '@/components/live/LiveBadge';
import { SimulcastManager } from '@/components/live/SimulcastManager';
import { RecordingControls } from '@/components/live/RecordingControls';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface SessionData {
  id: string;
  channel_id: string;
  creator_id: string;
  title: string;
  status: string;
  livekit_room_name: string;
  viewer_count: number;
  channels?: { name: string; avatar_url: string | null } | null;
}

export default function Live() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string>('');
  const [viewerCount, setViewerCount] = useState(0);

  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);

  const isPublisher = user?.id === session?.creator_id;

  useEffect(() => {
    if (sessionId) loadSession();
  }, [sessionId, user]);

  const loadSession = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('live_sessions')
      .select('*, channels(name, avatar_url)')
      .eq('id', sessionId!)
      .single();

    if (error || !data) {
      toast.error('Stream not found');
      navigate('/');
      return;
    }

    setSession(data as SessionData);
    setViewerCount(data.viewer_count);

    if (data.status === 'ended') {
      setLoading(false);
      return;
    }

    // Get LiveKit token
    if (user) {
      const isCreator = user.id === data.creator_id;
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('livekit-token', {
        body: {
          roomName: data.livekit_room_name,
          sessionId: data.id,
          isPublisher: isCreator,
        },
      });

      if (tokenError || !tokenData?.token) {
        toast.error('Failed to join stream');
      } else {
        setToken(tokenData.token);
        setServerUrl(tokenData.url);
      }
    }

    setLoading(false);
  };

  const endStream = async () => {
    if (!session || !isPublisher) return;
    await Promise.all([
      supabase.from('live_sessions').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', session.id),
      supabase.from('channels').update({ is_live: false }).eq('id', session.channel_id),
    ]);
    toast.success('Stream ended');
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="aspect-video rounded-xl" />
          <Skeleton className="h-8 w-64" />
        </div>
      </MainLayout>
    );
  }

  if (!session) return null;

  const isEnded = session.status === 'ended';

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Video area */}
          <div className="lg:col-span-2 space-y-3">
            {isEnded ? (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground">This stream has ended</p>
              </div>
            ) : token && serverUrl ? (
              <LiveStreamPlayer
                token={token}
                serverUrl={serverUrl}
                isPublisher={isPublisher}
                onViewerCountChange={setViewerCount}
                onDisconnected={() => {}}
                cameraEnabled={cameraEnabled}
                micEnabled={micEnabled}
                screenShareEnabled={screenShareEnabled}
              />
            ) : (
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                <p className="text-muted-foreground text-sm">
                  {user ? 'Unable to connect to stream' : 'Sign in to watch the stream'}
                </p>
              </div>
            )}

            {isPublisher && !isEnded && (
              <LiveStreamControls
                cameraEnabled={cameraEnabled}
                micEnabled={micEnabled}
                screenShareEnabled={screenShareEnabled}
                onToggleCamera={() => setCameraEnabled((v) => !v)}
                onToggleMic={() => setMicEnabled((v) => !v)}
                onToggleScreenShare={() => setScreenShareEnabled((v) => !v)}
                onEndStream={endStream}
              />
            )}

            {/* Stream info */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{session.title}</h1>
                  {!isEnded && <LiveBadge size="md" />}
                </div>
                <p className="text-sm text-muted-foreground">
                  {session.channels?.name ?? 'Unknown Channel'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                <Users className="h-4 w-4" />
                {viewerCount}
              </div>
            </div>
          </div>

          {/* Chat and Call Queue */}
          <div className="lg:col-span-1 space-y-4 h-[calc(100vh-12rem)]">
            {isPublisher && (
              <>
                <RecordingControls
                  sessionId={session.id}
                  roomName={session.livekit_room_name}
                  channelId={session.channel_id}
                  isPublisher={isPublisher}
                />
                <SimulcastManager sessionId={session.id} isPublisher={isPublisher} />
                <LiveCallQueue sessionId={session.id} isPublisher={isPublisher} />
              </>
            )}
            {!isPublisher && (
              <LiveCallQueue sessionId={session.id} isPublisher={isPublisher} />
            )}
            <div className="flex-1 overflow-hidden">
              <LiveChat sessionId={session.id} isPublisher={isPublisher} />
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
