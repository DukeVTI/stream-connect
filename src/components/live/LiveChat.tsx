import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send } from 'lucide-react';

interface ChatMessage {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  display_name?: string;
}

interface LiveChatProps {
  sessionId: string;
}

export function LiveChat({ sessionId }: LiveChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
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
          const display_name = await resolveDisplayName(msg.user_id);
          setMessages((prev) => [...prev, { ...msg, display_name }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  useEffect(() => {
    // Auto-scroll
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!user || !input.trim() || sending) return;
    setSending(true);
    await supabase.from('live_messages').insert({
      session_id: sessionId,
      user_id: user.id,
      body: input.trim(),
    });
    setInput('');
    setSending(false);
  };

  return (
    <div className="flex flex-col h-full border border-border rounded-lg bg-card">
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold">Live Chat</h3>
      </div>

      <ScrollArea className="flex-1 p-3" ref={scrollRef as any}>
        <div className="space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="text-sm">
              <span className="font-medium text-primary">{msg.display_name}</span>{' '}
              <span className="text-foreground">{msg.body}</span>
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
            placeholder="Say something..."
            className="text-sm"
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <Button size="icon" variant="ghost" onClick={sendMessage} disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="p-3 border-t border-border text-center text-sm text-muted-foreground">
          Sign in to chat
        </div>
      )}
    </div>
  );
}
