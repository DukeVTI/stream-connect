import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { ContentCard } from '@/components/content/ContentCard';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { Channel as ChannelType, ContentWithChannel } from '@/types/database';

export default function Channel() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [channel, setChannel] = useState<ChannelType | null>(null);
  const [content, setContent] = useState<ContentWithChannel[]>([]);
  const [subscribed, setSubscribed] = useState(false);
  const [subCount, setSubCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [subLoading, setSubLoading] = useState(false);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    if (id) loadChannel();
  }, [id, user]);

  const loadChannel = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('channels').select('*').eq('id', id!).single();
    if (error || !data) {
      setLoading(false);
      return;
    }
    setChannel(data);
    setSubCount(data.subscriber_count);

    const promises: Promise<void>[] = [loadContent()];
    if (user) {
      promises.push(
        supabase.from('subscriptions').select('id').eq('channel_id', id!).eq('user_id', user.id).maybeSingle()
          .then(({ data: subData }) => { setSubscribed(!!subData); })
      );
    }
    await Promise.all(promises);
    setLoading(false);
  };

  const loadContent = async () => {
    const { data } = await supabase
      .from('content')
      .select('*, channels(id, name, avatar_url)')
      .eq('channel_id', id!)
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    setContent((data as ContentWithChannel[]) ?? []);
  };

  const handleSubscribe = useCallback(async () => {
    if (!user) return toast.error('Sign in to subscribe');
    if (subLoading) return;
    setSubLoading(true);
    try {
      if (subscribed) {
        await supabase.from('subscriptions').delete().eq('channel_id', id!).eq('user_id', user.id);
        setSubscribed(false);
        setSubCount(c => c - 1);
      } else {
        await supabase.from('subscriptions').insert({ channel_id: id!, user_id: user.id });
        setSubscribed(true);
        setSubCount(c => c + 1);
      }
    } catch {
      toast.error('Action failed');
    } finally {
      setSubLoading(false);
    }
  }, [user, subscribed, id, subLoading]);

  const filtered = tab === 'all' ? content : content.filter(c => c.content_type === tab);

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-8 w-48" />
        </div>
      </MainLayout>
    );
  }

  if (!channel) {
    return <MainLayout><div className="text-center py-20 text-muted-foreground">Channel not found</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="h-40 bg-gradient-to-r from-primary/30 to-primary/10">
        {channel.banner_url && <img src={channel.banner_url} className="w-full h-full object-cover" alt="" />}
      </div>

      <div className="max-w-6xl mx-auto px-4 -mt-8">
        <div className="flex items-end gap-4 mb-6">
          <Avatar className="h-20 w-20 border-4 border-background">
            <AvatarImage src={channel.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl">{channel.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 pb-1">
            <h1 className="text-2xl font-bold">{channel.name}</h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> {subCount} subscribers
            </p>
          </div>
          {user?.id !== channel.owner_id && (
            <Button
              variant={subscribed ? 'secondary' : 'default'}
              className="rounded-full"
              onClick={handleSubscribe}
              disabled={subLoading}
            >
              {subscribed ? 'Subscribed' : 'Subscribe'}
            </Button>
          )}
        </div>

        {channel.description && <p className="text-sm text-muted-foreground mb-6">{channel.description}</p>}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="video">Videos</TabsTrigger>
            <TabsTrigger value="audio">Audio</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-6">
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-12">No content yet</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filtered.map((item) => (
                  <ContentCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    thumbnailUrl={item.thumbnail_url}
                    contentType={item.content_type as 'video' | 'audio'}
                    viewCount={item.view_count}
                    createdAt={item.created_at}
                    channelName={item.channels?.name ?? channel.name}
                    channelAvatar={item.channels?.avatar_url ?? channel.avatar_url}
                    channelId={channel.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
