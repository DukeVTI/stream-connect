import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';

interface LiveCallQueueProps {
  sessionId: string;
  isPublisher: boolean;
  onCallAccepted?: () => void;
}

interface QueueEntry {
  id: string;
  user_id: string;
  display_name: string;
  status: 'waiting' | 'accepted' | 'rejected' | 'ended';
  position_in_queue: number;
  requested_at: string;
}

export function LiveCallQueue({ sessionId, isPublisher, onCallAccepted }: LiveCallQueueProps) {
  const { user, profile } = useAuth();
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [userQueueEntry, setUserQueueEntry] = useState<QueueEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [joiningQueue, setJoiningQueue] = useState(false);
  const [acceptingCall, setAcceptingCall] = useState<string | null>(null);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  useEffect(() => {
    loadQueue();
    
    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`live_call_queue:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_call_queue', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          loadQueue();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId, user?.id]);

  const loadQueue = async () => {
    try {
      const { data, error } = await supabase
        .from('live_call_queue')
        .select('*')
        .eq('session_id', sessionId)
        .order('position_in_queue', { ascending: true });

      if (error) throw error;

      setQueue(data || []);

      // Check if current user is in queue
      if (user) {
        const userEntry = data?.find(entry => entry.user_id === user.id && entry.status !== 'rejected');
        setUserQueueEntry(userEntry || null);
      }
    } catch (error) {
      console.error('Failed to load queue:', error);
    }
  };

  const joinQueue = async () => {
    if (!user || !profile) return;

    setJoiningQueue(true);
    try {
      const { error } = await supabase.from('live_call_queue').insert({
        session_id: sessionId,
        user_id: user.id,
        display_name: profile.display_name || profile.email || 'Anonymous',
      });

      if (error) {
        if (error.message.includes('unique')) {
          toast.error('You are already in the queue');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Added to call queue!');
        await loadQueue();
      }
    } catch (error) {
      toast.error('Failed to join queue');
    } finally {
      setJoiningQueue(false);
    }
  };

  const leaveQueue = async () => {
    if (!userQueueEntry) return;

    try {
      const { error } = await supabase
        .from('live_call_queue')
        .delete()
        .eq('id', userQueueEntry.id);

      if (error) throw error;

      toast.success('Left the queue');
      setUserQueueEntry(null);
      await loadQueue();
    } catch (error) {
      toast.error('Failed to leave queue');
    }
  };

  const acceptCall = async (queueId: string) => {
    setAcceptingCall(queueId);
    try {
      const { error } = await supabase.rpc('accept_call_from_queue', {
        _queue_id: queueId,
        _session_id: sessionId,
      });

      if (error) throw error;

      toast.success('Call accepted');
      setShowAcceptDialog(false);
      await loadQueue();
      onCallAccepted?.();
    } catch (error) {
      toast.error('Failed to accept call');
    } finally {
      setAcceptingCall(null);
    }
  };

  const rejectCall = async (queueId: string) => {
    try {
      const { error } = await supabase.rpc('reject_call_from_queue', {
        _queue_id: queueId,
        _session_id: sessionId,
      });

      if (error) throw error;

      toast.success('Call rejected');
      await loadQueue();
    } catch (error) {
      toast.error('Failed to reject call');
    }
  };

  const waitingQueue = queue.filter(entry => entry.status === 'waiting');
  const acceptedCall = queue.find(entry => entry.status === 'accepted');

  // Audience view - show if user is in queue
  if (!isPublisher && userQueueEntry) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            You're in the Queue
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Queue Position</span>
              <Badge variant="default" className="text-lg px-3 py-1">
                #{userQueueEntry.position_in_queue}
              </Badge>
            </div>
            {waitingQueue.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {waitingQueue.length - userQueueEntry.position_in_queue} people ahead of you
              </p>
            )}
          </div>

          {userQueueEntry.status === 'accepted' && (
            <div className="p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
              ✓ Your call has been accepted! Preparing video stream...
            </div>
          )}

          {userQueueEntry.status === 'rejected' && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              Your call request was declined
            </div>
          )}

          <Button onClick={leaveQueue} variant="outline" className="w-full text-xs" disabled={userQueueEntry.status === 'accepted'}>
            Leave Queue
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Audience view - show button to join queue
  if (!isPublisher && !userQueueEntry) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Join the Call
          </CardTitle>
          <CardDescription className="text-xs">Chat with the host during the livestream</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={joinQueue}
            className="w-full"
            disabled={joiningQueue}
            variant="default"
          >
            {joiningQueue ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Joining...
              </>
            ) : (
              'Join Call Queue'
            )}
          </Button>
          {waitingQueue.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {waitingQueue.length} people in queue
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Host view - show queue management
  if (isPublisher) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Call Queue ({waitingQueue.length})
          </CardTitle>
          {acceptedCall && (
            <div className="text-xs text-green-600 font-medium mt-1">
              ✓ Call in progress: {acceptedCall.display_name}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {waitingQueue.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No one waiting to join</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {waitingQueue.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-2 bg-muted/50 rounded border border-border/50 text-sm">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{entry.display_name}</p>
                    <p className="text-xs text-muted-foreground">#{entry.position_in_queue}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      onClick={() => {
                        setSelectedCallId(entry.id);
                        setShowAcceptDialog(true);
                      }}
                      size="sm"
                      variant="default"
                      disabled={acceptingCall === entry.id}
                      className="text-xs h-7"
                    >
                      {acceptingCall === entry.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        'Accept'
                      )}
                    </Button>
                    <Button
                      onClick={() => rejectCall(entry.id)}
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      disabled={acceptingCall === entry.id}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}
