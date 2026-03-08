import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { ContentCard } from '@/components/content/ContentCard';
import { Skeleton } from '@/components/ui/skeleton';

export default function Subscriptions() {
  const { user } = useAuth();
  const [content, setContent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadFeed();
    else setLoading(false);
  }, [user]);

  const loadFeed = async () => {
    if (!user) return;
    // Get subscribed channel IDs
    const { data: subs } = await supabase.from('subscriptions').select('channel_id').eq('user_id', user.id);
    if (!subs || subs.length === 0) { setContent([]); setLoading(false); return; }

    const channelIds = subs.map(s => s.channel_id);
    const { data } = await supabase
      .from('content')
      .select('id, title, thumbnail_url, content_type, view_count, created_at, channels(id, name, avatar_url)')
      .in('channel_id', channelIds)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(50);

    setContent((data as any) ?? []);
    setLoading(false);
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Space Grotesk' }}>Subscriptions</h1>

        {!user ? (
          <p className="text-center text-muted-foreground py-12">Sign in to see your subscriptions feed</p>
        ) : loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-video rounded-xl" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : content.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No content from your subscriptions yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {content.map((item) => (
              <ContentCard
                key={item.id}
                id={item.id}
                title={item.title}
                thumbnailUrl={item.thumbnail_url}
                contentType={item.content_type}
                viewCount={item.view_count}
                createdAt={item.created_at}
                channelName={item.channels?.name ?? 'Unknown'}
                channelAvatar={item.channels?.avatar_url ?? null}
                channelId={item.channels?.id ?? ''}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
