import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ThumbsUp, ThumbsDown, MessageSquare, Eye, Share2, Headphones, Flag, Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CHANNEL_CATEGORIES } from '@/lib/constants';
import { toast } from 'sonner';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import type { Database } from '@/integrations/supabase/types';

type ContentRow = Database['public']['Tables']['content']['Row'];
type CommentRow = Database['public']['Tables']['comments']['Row'];

interface ContentWithChannel extends ContentRow {
  channels: {
    id: string;
    name: string;
    avatar_url: string | null;
    subscriber_count: number;
    owner_id: string;
    verification_badge?: 'none' | 'green' | 'blue';
  } | null;
}

interface CommentWithProfile extends CommentRow {
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

export default function Watch() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [content, setContent] = useState<ContentWithChannel | null>(null);
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [userVote, setUserVote] = useState<'approve' | 'disapprove' | null>(null);
  const [approveCount, setApproveCount] = useState(0);
  const [disapproveCount, setDisapproveCount] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    caption: '',
    description: '',
    category: '',
    status: '',
    approve_disapprove_enabled: true
  });
  const [savingEdit, setSavingEdit] = useState(false);

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

    if (error || !data) { setLoading(false); return; }

    setContent(data as ContentWithChannel);
    setApproveCount(data.approve_count ?? 0);
    setDisapproveCount(data.disapprove_count ?? 0);

    await supabase.rpc('increment_view_count', { _content_id: id! });

    const promises: Promise<void>[] = [loadComments()];
    if (user && data.channels) promises.push(checkUserState(data.channels.id));
    await Promise.all(promises);
    setLoading(false);
  };

  const checkUserState = async (channelId: string) => {
    if (!user) return;
    const [voteRes, subRes] = await Promise.all([
      supabase.from('content_approvals').select('vote').eq('content_id', id!).eq('user_id', user.id).maybeSingle(),
      supabase.from('subscriptions').select('id').eq('channel_id', channelId).eq('user_id', user.id).maybeSingle(),
    ]);
    setUserVote((voteRes.data?.vote as 'approve' | 'disapprove') ?? null);
    setSubscribed(!!subRes.data);
  };

  const loadComments = async () => {
    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles:comments_user_id_profiles_fkey(display_name, avatar_url)')
      .eq('content_id', id!)
      .order('created_at', { ascending: false });
    if (!error) setComments((data as unknown as CommentWithProfile[]) ?? []);
  };

  const handleVote = useCallback(async (vote: 'approve' | 'disapprove') => {
    if (!user) return toast.error('Sign in to vote');
    if (actionLoading) return;
    setActionLoading('vote');
    try {
      const newVote = userVote === vote ? 'none' : vote;

      // Optimistic update
      const prevApprove = approveCount;
      const prevDisapprove = disapproveCount;
      const prevVote = userVote;

      if (prevVote === 'approve') setApproveCount(c => Math.max(c - 1, 0));
      if (prevVote === 'disapprove') setDisapproveCount(c => Math.max(c - 1, 0));
      if (newVote === 'approve') setApproveCount(c => c + 1);
      if (newVote === 'disapprove') setDisapproveCount(c => c + 1);
      setUserVote(newVote === 'none' ? null : newVote as 'approve' | 'disapprove');

      const { error } = await supabase.rpc('cast_vote', { _content_id: id!, _vote: newVote });
      if (error) {
        // Rollback
        setApproveCount(prevApprove);
        setDisapproveCount(prevDisapprove);
        setUserVote(prevVote);
        toast.error('Vote failed');
      }
    } finally {
      setActionLoading(null);
    }
  }, [user, userVote, id, actionLoading, approveCount, disapproveCount]);

  const handleComment = useCallback(async () => {
    if (!user) return toast.error('Sign in to comment');
    if (!commentText.trim() || actionLoading) return;
    setActionLoading('comment');
    const { error } = await supabase.from('comments').insert({ content_id: id!, user_id: user.id, body: commentText.trim() });
    if (error) toast.error('Failed to post comment');
    else { setCommentText(''); loadComments(); toast.success('Comment added'); }
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
    } catch { toast.error('Action failed'); }
    finally { setActionLoading(null); }
  }, [user, content, subscribed, actionLoading]);

  const handleReport = async () => {
    if (!user) return toast.error('Sign in to report');
    if (!reportReason.trim()) return toast.error('Please provide a reason');
    const { error } = await supabase.from('content_reports').upsert({ content_id: id!, reporter_id: user.id, reason: reportReason.trim() }, { onConflict: 'content_id,reporter_id' });
    if (error) toast.error('Failed to submit report');
    else toast.success('Report submitted. Thank you.');
    setReportReason('');
  };

  const openEditDialog = () => {
    if (!content) return;
    setEditForm({
      title: content.title,
      caption: content.caption || '',
      description: content.description || '',
      category: content.category || 'Others',
      status: content.status || 'published',
      approve_disapprove_enabled: content.approve_disapprove_enabled ?? true
    });
    setEditDialogOpen(true);
  };

  const saveEdit = async () => {
    if (!content || !editForm.title.trim() || !editForm.category) return;
    setSavingEdit(true);
    const { error } = await supabase.from('content').update({
      title: editForm.title.trim(),
      caption: editForm.caption.trim() || null,
      description: editForm.description.trim() || null,
      category: editForm.category,
      status: editForm.status,
      approve_disapprove_enabled: editForm.approve_disapprove_enabled
    } as any).eq('id', content.id);

    setSavingEdit(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Content updated');
      setEditDialogOpen(false);
      loadContent();
    }
  };

  const deleteContent = async () => {
    if (!content) return;
    if (!confirm('Are you sure you want to delete this content permanently?')) return;
    const { error } = await supabase.from('content').delete().eq('id', content.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Content deleted');
      navigate('/dashboard');
    }
  };

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

  const votingEnabled = content.approve_disapprove_enabled;
  const isOwner = user?.id === content.creator_id;

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
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">No media file</div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold mb-1">{content.title}</h1>

        {/* Caption */}
        {content.caption && (
          <p className="text-sm text-muted-foreground mb-3 italic">"{content.caption}"</p>
        )}

        {/* Channel + Actions row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Link to={`/channel/${content.channels?.id}`}>
              <Avatar className="h-10 w-10">
                <AvatarImage src={content.channels?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">{content.channels?.name?.charAt(0)}</AvatarFallback>
              </Avatar>
            </Link>
            <div>
              <div className="flex items-center gap-1.5">
                <Link to={`/channel/${content.channels?.id}`} className="font-medium text-sm hover:text-primary">{content.channels?.name}</Link>
                {content.channels?.verification_badge && content.channels.verification_badge !== 'none' && (
                  <VerificationBadge type={content.channels.verification_badge} size="sm" />
                )}
              </div>
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
            {isOwner && (
              <>
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-primary" onClick={openEditDialog}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground hover:text-destructive" onClick={deleteContent}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}

            {/* Approve / Disapprove */}
            {votingEnabled && (
              <>
                <Button
                  variant={userVote === 'approve' ? 'default' : 'secondary'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => handleVote('approve')}
                  disabled={actionLoading === 'vote'}
                >
                  <ThumbsUp className="h-4 w-4 mr-1" /> APPROVE {approveCount > 0 && approveCount}
                </Button>
                <Button
                  variant={userVote === 'disapprove' ? 'destructive' : 'secondary'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => handleVote('disapprove')}
                  disabled={actionLoading === 'vote'}
                >
                  <ThumbsDown className="h-4 w-4 mr-1" /> DISAPPROVE {disapproveCount > 0 && disapproveCount}
                </Button>
              </>
            )}
            <Button variant="secondary" size="sm" className="rounded-full" onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied!'); }}>
              <Share2 className="h-4 w-4 mr-1" /> Share
            </Button>

            {/* Report */}
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground">
                  <Flag className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Report This Content</DialogTitle></DialogHeader>
                <div className="space-y-3 pt-2">
                  <Label>Reason for report</Label>
                  <Textarea value={reportReason} onChange={e => setReportReason(e.target.value)} placeholder="Describe why you are reporting this content..." rows={4} />
                  <Button className="w-full" onClick={handleReport} disabled={!reportReason.trim()}>Submit Report</Button>
                </div>
              </DialogContent>
            </Dialog>
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

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto w-[90%] sm:max-w-[500px]">
            <DialogHeader><DialogTitle>Edit Content</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Caption</Label>
                <Input value={editForm.caption} onChange={e => setEditForm(p => ({ ...p, caption: e.target.value }))} placeholder="Optional short subtitle" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} rows={4} />
              </div>
              <div className="space-y-2">
                <Label>Category <span className="text-destructive">*</span></Label>
                <Select value={editForm.category} onValueChange={v => setEditForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {CHANNEL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Visibility Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="draft">Draft (hidden)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between mt-6 p-4 bg-muted/50 rounded-lg">
                <div className="space-y-0.5">
                  <Label>Enable Votes</Label>
                  <p className="text-xs text-muted-foreground">Allow viewers to approve / disapprove</p>
                </div>
                <Switch checked={editForm.approve_disapprove_enabled} onCheckedChange={c => setEditForm(p => ({ ...p, approve_disapprove_enabled: c }))} />
              </div>
              <Button onClick={saveEdit} className="w-full mt-4" disabled={savingEdit || !editForm.title.trim()}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Comments */}
        <div className="space-y-4">
          <h2 className="font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> {comments.length} Comments
          </h2>

          {user && (
            <div className="flex gap-3">
              <Textarea placeholder="Add a comment..." value={commentText} onChange={e => setCommentText(e.target.value)} className="min-h-[80px]" />
              <Button onClick={handleComment} disabled={!commentText.trim() || actionLoading === 'comment'} className="self-end">
                {actionLoading === 'comment' ? 'Posting...' : 'Post'}
              </Button>
            </div>
          )}

          <div className="space-y-4">
            {comments.map(comment => (
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
