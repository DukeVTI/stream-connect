import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Send, Lock, Unlock, Pin, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  display_name?: string;
  is_pinned?: boolean;
}

interface LiveChatProps {
  sessionId: string;
  isPublisher?: boolean;
}

interface SessionData {
  chat_locked: boolean;
}

export function LiveChat({ sessionId, isPublisher = false }: LiveChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatLocked, setChatLocked] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockingUserId, setBlockingUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileCache = useRef<Record<string, string>>({});

  const resolveDisplayName = async (userId: string): Promise<string> => {
    if (profileCache.current[userId]) return profileCache.current[userId];
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', userId)
      .single();
    const name = data?.display_name || 'User';
    profileCache.current[userId] = name;
    return name;
  };

  // Load session and check if chat is locked
  useEffect(() => {
    const loadSessionData = async () => {
      const { data } = await supabase
        .from('live_sessions')
        .select('chat_locked')
        .eq('id', sessionId)
        .single();

      if (data) {
        setChatLocked(data.chat_locked);
      }
    };

    loadSessionData();

    // Subscribe to chat lock status changes
    const subscription = supabase
      .channel(`live_session_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          if (payload.new?.chat_locked !== undefined) {
            setChatLocked(payload.new.chat_locked);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId]);

  // Load blocked users if publisher
  useEffect(() => {
    if (!isPublisher) return;

    const loadBlockedUsers = async () => {
      const { data } = await supabase
        .from('live_blocked_users')
        .select('blocked_user_id')
        .eq('session_id', sessionId)
        .is('unblocked_at', null);

      if (data) {
        setBlockedUsers(new Set(data.map(b => b.blocked_user_id)));
      }
    };

    loadBlockedUsers();
  }, [sessionId, isPublisher]);

  useEffect(() => {
    // Load existing messages
    const load = async () => {
      const { data } = await supabase
        .from('live_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (data) {
        const withNames = await Promise.all(
          data.map(async (m) => ({
            ...m,
            display_name: await resolveDisplayName(m.user_id),
          }))
        );
        setMessages(withNames);
      }
    };
    load();

    // Subscribe to realtime
    const channel = supabase
      .channel(`live-chat-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_messages', filter: `session_id=eq.${sessionId}` },
        async (payload) => {
          const msg = payload.new as any;
          // Skip if user is blocked
          if (blockedUsers.has(msg.user_id)) return;

          const display_name = await resolveDisplayName(msg.user_id);
          setMessages((prev) => [...prev, { ...msg, display_name }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, blockedUsers]);

  useEffect(() => {
    // Auto-scroll
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!user || !input.trim() || sending || chatLocked) return;
    
    // Check if user is blocked
    if (blockedUsers.has(user.id)) {
      toast.error('You have been blocked from this chat');
      return;
    }

    setSending(true);
    const { error } = await supabase.from('live_messages').insert({
      session_id: sessionId,
      user_id: user.id,
      body: input.trim(),
    });
    
    if (error) {
      toast.error('Failed to send message');
    }
    
    setInput('');
    setSending(false);
  };

  const toggleChatLock = async () => {
    if (!isPublisher) return;

    setToggleLoading(true);
    try {
      const { error } = await supabase.rpc('toggle_chat_lock', {
        _session_id: sessionId,
        _locked: !chatLocked,
      });

      if (error) throw error;
      toast.success(chatLocked ? 'Chat unlocked' : 'Chat locked');
    } catch (error) {
      toast.error('Failed to toggle chat lock');
    } finally {
      setToggleLoading(false);
    }
  };

  const blockUser = async (userId: string, displayName: string) => {
    try {
      const { error } = await supabase.rpc('block_user_from_chat', {
        _session_id: sessionId,
        _blocked_user_id: userId,
        _reason: `Blocked by host`,
      });

      if (error) throw error;
      
      setBlockedUsers(prev => new Set([...prev, userId]));
      toast.success(`Blocked ${displayName} from chat`);
      setShowBlockDialog(false);
    } catch (error) {
      toast.error('Failed to block user');
    }
  };

  const unblockUser = async (userId: string, displayName: string) => {
    try {
      const { error } = await supabase.rpc('unblock_user_from_chat', {
        _session_id: sessionId,
        _blocked_user_id: userId,
      });

      if (error) throw error;

      setBlockedUsers(prev => {
        const updated = new Set(prev);
        updated.delete(userId);
        return updated;
      });
      toast.success(`Unblocked ${displayName}`);
    } catch (error) {
      toast.error('Failed to unblock user');
    }
  };

  return (
    <div className="flex flex-col h-full border border-border rounded-lg bg-card">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">Live Chat</h3>
        {isPublisher && (
          <Button
            onClick={toggleChatLock}
            size="sm"
            variant={chatLocked ? 'destructive' : 'ghost'}
            className="h-7 px-2 text-xs"
            disabled={toggleLoading}
          >
            {chatLocked ? (
              <>
                <Lock className="h-3 w-3 mr-1" />
                Locked
              </>
            ) : (
              <>
                <Unlock className="h-3 w-3 mr-1" />
                Unlock
              </>
            )}
          </Button>
        )}
      </div>

      {chatLocked && !isPublisher && (
        <div className="px-3 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive font-medium flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Chat is locked
        </div>
      )}

      <ScrollArea className="flex-1 p-3" ref={scrollRef as any}>
        <div className="space-y-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="text-sm group hover:bg-muted/30 p-1 rounded transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-primary">{msg.display_name}</span>{' '}
                  <span className="text-foreground break-words">{msg.body}</span>
                </div>
                {isPublisher && msg.user_id !== user?.id && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      onClick={() => {
                        setBlockingUserId(msg.user_id);
                        setShowBlockDialog(true);
                      }}
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      title="Block user"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-4">No messages yet</p>
          )}
        </div>
      </ScrollArea>

      {user ? (
        <div className="p-2 border-t border-border flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={chatLocked && !isPublisher ? 'Chat is locked...' : 'Say something...'}
            className="text-sm"
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            disabled={chatLocked && !isPublisher}
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={sendMessage}
            disabled={sending || !input.trim() || (chatLocked && !isPublisher)}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="p-3 border-t border-border text-center text-sm text-muted-foreground">
          Sign in to chat
        </div>
      )}

      {/* Block User Dialog */}
      <AlertDialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Block User from Chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This user will no longer be able to send messages in this chat. They can still watch the stream.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (blockingUserId) {
                  const userName = messages.find(m => m.user_id === blockingUserId)?.display_name || 'User';
                  blockUser(blockingUserId, userName);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Block
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
