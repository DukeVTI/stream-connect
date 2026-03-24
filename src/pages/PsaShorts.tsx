import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Zap, ThumbsUp, ThumbsDown, Eye, Share2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type Short = Database['public']['Tables']['psa_shorts']['Row'];

export default function PsaShorts() {
  const { channelId } = useParams<{ channelId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [shorts, setShorts] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelName, setChannelName] = useState('');

  useEffect(() => {
    if (channelId) loadShorts();
  }, [channelId]);

  const loadShorts = async () => {
    setLoading(true);
    const [shortsRes, channelRes] = await Promise.all([
      supabase.from('psa_shorts').select('*').eq('channel_id', channelId!).eq('status', 'published').order('created_at', { ascending: false }),
      supabase.from('channels').select('name').eq('id', channelId!).single(),
    ]);
    setShorts(shortsRes.data ?? []);
    setChannelName(channelRes.data?.name ?? '');
    setLoading(false);
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Zap className="h-5 w-5 text-amber-500" />
          <h1 className="text-xl font-bold">PSA Shorts</h1>
          {channelName && <span className="text-muted-foreground text-sm">— {channelName}</span>}
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : shorts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No PSA Shorts uploaded yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {shorts.map(short => (
              <Card key={short.id} className="overflow-hidden hover:border-primary/40 transition-colors cursor-pointer group">
                <div className="aspect-video bg-muted relative">
                  {short.thumbnail_url ? (
                    <img src={short.thumbnail_url} alt={short.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Zap className="h-8 w-8 text-amber-400" />
                    </div>
                  )}
                  {short.duration_seconds && (
                    <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                      {short.duration_seconds}s
                    </span>
                  )}
                </div>
                <CardContent className="pt-3 pb-4">
                  <h3 className="font-semibold text-sm truncate">{short.title}</h3>
                  <p className="text-xs text-muted-foreground italic truncate mt-0.5">"{short.caption}"</p>
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{short.view_count}</span>
                      {short.approve_disapprove_enabled && (
                        <>
                          <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3 text-green-500" />{short.approve_count}</span>
                          <span className="flex items-center gap-1"><ThumbsDown className="h-3 w-3 text-destructive" />{short.disapprove_count}</span>
                        </>
                      )}
                    </div>
                    <span>{formatDistanceToNow(new Date(short.created_at), { addSuffix: true })}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
