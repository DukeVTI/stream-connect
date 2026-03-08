import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ThumbsUp, MessageSquare, Eye, Share2, Headphones } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { ContentWithFullChannel, CommentWithProfile } from '@/types/database';

export default function Watch() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [content, setContent] = useState<ContentWithFullChannel | null>(null);
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadContent();
  }, [id]);

  const loadContent = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('content')
      .select('*, channels(id, name, avatar_url, subscriber_count, owner_id)')
      .eq('id', id!)
      .single();

    if (error || !data) {
      setLoading(false);
      return;
    }

    setContent(data as ContentWithFullChannel);
    setLikeCount(data.like_count);

    // Atomic view increment
    await supabase.rpc('increment_view_count', { _content_id: id! });

    // Parallel: load comments + check user state
    const promises: Promise<void>[] = [loadComments()];
    if (user && data.channels) {
      promises.push(checkUserState(data.channels.id));
    }
    await Promise.all(promises);
    setLoading(false);
  };

  const checkUserState = async (channelId: string) => {
    if (!user) return;
    const [likeRes, subRes] = await Promise.all([
      supabase.from('likes').select('id').eq('content_id', id!).eq('user_id', user.id).maybeSingle(),
      supabase.from('subscriptions').select('id').eq('channel_id', channelId).eq('user_id', user.id).maybeSingle(),
    ]);
    setLiked(!!likeRes.data);
    setSubscribed(!!subRes.data);
  };

  const loadComments = async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles!comments_user_id_fkey(display_name, avatar_url)')
      .eq('content_id', id!)
      .order('created_at', { ascending: false });
    if (error) {
      toast.error('Failed to load comments');
      return;
    }
    setComments((data as unknown as CommentWithProfile[]) ?? []);
  };

  const handleLike = useCallback(async () => {
    if (!user) return toast.error('Sign in to like');
    if (actionLoading) return;
    setActionLoading('like');
    try {
      if (liked) {
        await supabase.from('likes').delete().eq('content_id', id!).eq('user_id', user.id);
        await supabase.rpc('decrement_like_count', { _content_id: id! });
        setLiked(false);
        setLikeCount((c) => Math.max(c - 1, 0));
      } else {
        await supabase.from('likes').insert({ content_id: id!, user_id: user.id });
        await supabase.rpc('increment_like_count', { _content_id: id! });
        setLiked(true);
        setLikeCount((c) => c + 1);
      }
    } catch {
      toast.error('Action failed');
    } finally {
      setActionLoading(null);
    }
  }, [user, liked, id, actionLoading]);

  const handleComment = useCallback(async () => {
    if (!user) return toast.error('Sign in to comment');
    if (!commentText.trim() || actionLoading) return;
    setActionLoading('comment');
    const { error } = await supabase.from('comments').insert({ content_id: id!, user_id: user.id, body: commentText.trim() });
    if (error) {
      toast.error('Failed to post comment');
    } else {
      setCommentText('');
      loadComments();
      toast.success('Comment added');
    }
    setActionLoading(null);
  }, [user, commentText, id, actionLoading]);

  const handleSubscribe = useCallback(async () => {
    if (!user) return toast.error('Sign in to subscribe');
    if (!content?.channels || actionLoading) return;
    setActionLoading('subscribe');
    try {
      if (subscribed) {
        await supabase.from('subscriptions').delete().eq('channel_id', content.channels.id).eq('user_id', user.id);
        setSubscribed(false);
        toast.success('Unsubscribed');
      } else {
        await supabase.from('subscriptions').insert({ channel_id: content.channels.id, user_id: user.id });
        setSubscribed(true);
        toast.success('Subscribed!');
      }
    } catch {
      toast.error('Action failed');
    } finally {
      setActionLoading(null);
    }
  }, [user, content, subscribed, actionLoading]);

  if (loading) {
    return (
      <MainLayout>
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="aspect-video rounded-xl" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </MainLayout>
    );
  }

  if (!content) {
    return (
      <MainLayout>
        <div className="text-center py-20">
          <h2 className="text-xl font-semibold">Content not found</h2>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Player */}
        <div className="aspect-video bg-muted rounded-xl overflow-hidden mb-4">
          {content.content_type === 'video' && content.file_url ? (
            <video src={content.file_url} controls className="w-full h-full" />
          ) : content.content_type === 'audio' && content.file_url ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-primary/20 to-background">
              <Headphones className="h-20 w-20 text-primary" />
              <audio src={content.file_url} controls className="w-full max-w-md" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              No media file
            </div>
          )}
        </div>

        {/* Title & Actions */}
        <h1 className="text-xl font-bold mb-2">{content.title}</h1>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Link to={`/channel/${content.channels?.id}`}>
              <Avatar className="h-10 w-10">
                <AvatarImage src={content.channels?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">{content.channels?.name?.charAt(0)}</AvatarFallback>
              </Avatar>
            </Link>
            <div>
              <Link to={`/channel/${content.channels?.id}`} className="font-medium text-sm hover:text-primary">{content.channels?.name}</Link>
              <p className="text-xs text-muted-foreground">{content.channels?.subscriber_count} subscribers</p>
            </div>
            {user?.id !== content.channels?.owner_id && (
              <Button
                variant={subscribed ? 'secondary' : 'default'}
                size="sm"
                className="rounded-full ml-2"
                onClick={handleSubscribe}
                disabled={actionLoading === 'subscribe'}
              >
                {subscribed ? 'Subscribed' : 'Subscribe'}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={liked ? 'default' : 'secondary'}
              size="sm"
              className="rounded-full"
              onClick={handleLike}
              disabled={actionLoading === 'like'}
            >
              <ThumbsUp className="h-4 w-4 mr-1" /> {likeCount}
            </Button>
            <Button variant="secondary" size="sm" className="rounded-full" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!'); }}>
              <Share2 className="h-4 w-4 mr-1" /> Share
            </Button>
          </div>
        </div>

        {/* Description */}
        {content.description && (
          <div className="bg-secondary rounded-xl p-4 mb-6">
            <div className="flex gap-3 text-sm text-muted-foreground mb-2">
              <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{(content.view_count + 1).toLocaleString()} views</span>
              <span>{formatDistanceToNow(new Date(content.created_at), { addSuffix: true })}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{content.description}</p>
          </div>
        )}

        {/* Comments */}
        <div className="space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> {comments.length} Comments
          </h2>

          {user && (
            <div className="flex gap-3">
              <Textarea
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="min-h-[80px]"
              />
              <Button onClick={handleComment} disabled={!commentText.trim() || actionLoading === 'comment'} className="self-end">
                {actionLoading === 'comment' ? 'Posting...' : 'Post'}
              </Button>
            </div>
          )}

          <div className="space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={comment.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-muted text-xs">{comment.profiles?.display_name?.charAt(0) ?? '?'}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">{comment.profiles?.display_name ?? 'User'}</span>
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
                  </div>
                  <p className="text-sm">{comment.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
