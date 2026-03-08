import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ContentCard } from '@/components/content/ContentCard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { LiveBadge } from '@/components/live/LiveBadge';
import { Radio, Users } from 'lucide-react';
import type { ContentWithChannel } from '@/types/database';

const FILTERS = ['All', 'Video', 'Audio', 'Trending'] as const;

export default function Home() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [content, setContent] = useState<ContentWithChannel[]>([]);
  const [liveChannels, setLiveChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<typeof FILTERS[number]>('All');
  const searchQuery = searchParams.get('q') || '';

  useEffect(() => {
    loadContent();
    loadLiveChannels();
  }, [filter, searchQuery]);

  const loadLiveChannels = async () => {
    const { data } = await supabase
      .from('live_sessions')
      .select('id, title, viewer_count, channels(id, name, avatar_url)')
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(10);
    setLiveChannels(data ?? []);
  };

  const loadContent = async () => {
    setLoading(true);
    let query = supabase
      .from('content')
      .select('id, title, thumbnail_url, content_type, view_count, created_at, channel_id, creator_id, like_count, status, category, description, duration, file_url, updated_at, channels(id, name, avatar_url)')
      .eq('status', 'published');

    if (filter === 'Video') query = query.eq('content_type', 'video');
    if (filter === 'Audio') query = query.eq('content_type', 'audio');
    if (filter === 'Trending') query = query.order('view_count', { ascending: false });
    if (searchQuery) query = query.ilike('title', `%${searchQuery}%`);

    query = query.order('created_at', { ascending: false }).limit(50);

    const { data, error } = await query;
    if (error) {
      console.error('Failed to load content:', error);
    }
    setContent((data as ContentWithChannel[]) ?? []);
    setLoading(false);
  };

  return (
    <MainLayout>
      <div className="px-4 py-6 max-w-7xl mx-auto">
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'secondary'}
              size="sm"
              className="rounded-lg shrink-0"
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>

        {/* Live Now Section */}
        {liveChannels.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Radio className="h-4 w-4 text-destructive" />
              <h2 className="text-lg font-semibold">Live Now</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {liveChannels.map((session) => (
                <Card
                  key={session.id}
                  className="cursor-pointer hover:border-destructive/50 transition-colors"
                  onClick={() => navigate(`/live/${session.id}`)}
                >
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive font-bold shrink-0">
                        {session.channels?.name?.charAt(0) ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <LiveBadge />
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="h-3 w-3" /> {session.viewer_count}
                          </span>
                        </div>
                        <p className="text-sm font-medium truncate">{session.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{session.channels?.name}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {searchQuery && (
          <p className="text-muted-foreground mb-4">
            Results for "<span className="text-foreground font-medium">{searchQuery}</span>"
          </p>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-video rounded-xl" />
                <div className="flex gap-3">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : content.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-xl font-semibold mb-2">No content yet</h2>
            <p className="text-muted-foreground">Be the first to upload something!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {content.map((item) => (
              <ContentCard
                key={item.id}
                id={item.id}
                title={item.title}
                thumbnailUrl={item.thumbnail_url}
                contentType={item.content_type as 'video' | 'audio'}
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
