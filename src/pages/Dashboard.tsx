import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Users, Film, Trash2, Radio } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LiveBadge } from '@/components/live/LiveBadge';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CHANNEL_CATEGORIES, CHANNEL_LANGUAGES } from '@/lib/constants';
import type { Channel } from '@/types/database';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [stats, setStats] = useState({ views: 0, subscribers: 0, content: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({
    name: '',
    description: '',
    handle: '',
    category: '',
    customCategory: '',
    languages: [] as string[],
    customLanguage: '',
  });
  const [creating, setCreating] = useState(false);
  const [goLiveData, setGoLiveData] = useState({ channelId: '', title: '' });
  const [goingLive, setGoingLive] = useState(false);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);

    const [channelRes, contentRes] = await Promise.all([
      supabase.from('channels').select('*').eq('owner_id', user.id),
      supabase.from('content').select('view_count').eq('creator_id', user.id),
    ]);

    const channelData = channelRes.data ?? [];
    setChannels(channelData);

    const totalSubs = channelData.reduce((sum, ch) => sum + ch.subscriber_count, 0);
    const totalViews = (contentRes.data ?? []).reduce((sum, c) => sum + c.view_count, 0);

    setStats({ views: totalViews, subscribers: totalSubs, content: contentRes.data?.length ?? 0 });
    setLoading(false);
  };

  const toggleLanguage = (lang: string) => {
    setNewChannel(p => ({
      ...p,
      languages: p.languages.includes(lang)
        ? p.languages.filter(l => l !== lang)
        : [...p.languages, lang],
    }));
  };

  const createChannel = async () => {
    if (!user || !newChannel.name.trim() || !newChannel.handle.trim() || !newChannel.category || creating) return;

    const finalCategory = newChannel.category === 'Others'
      ? newChannel.customCategory.trim() || 'Others'
      : newChannel.category;

    const finalLanguages = [...newChannel.languages];
    if (finalLanguages.includes('Others') && newChannel.customLanguage.trim()) {
      const idx = finalLanguages.indexOf('Others');
      finalLanguages[idx] = newChannel.customLanguage.trim();
    }

    setCreating(true);
    const { error } = await supabase.from('channels').insert({
      owner_id: user.id,
      name: newChannel.name.trim(),
      description: newChannel.description.trim() || null,
      handle: newChannel.handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
      category: finalCategory,
      languages: finalLanguages,
    } as any);
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        toast.error('That handle is already taken. Choose a different one.');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success('Channel created!');
      setNewChannel({ name: '', description: '', handle: '', category: '', customCategory: '', languages: [], customLanguage: '' });
      setDialogOpen(false);
      loadData();
    }
    setCreating(false);
  };

  const deleteChannel = async (channelId: string) => {
    if (!confirm('Delete this channel and all its content?')) return;
    const { error } = await supabase.from('channels').delete().eq('id', channelId);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Channel deleted');
      loadData();
    }
  };

  const goLive = async () => {
    if (!user || !goLiveData.channelId || !goLiveData.title.trim() || goingLive) return;
    setGoingLive(true);

    const roomName = `live-${goLiveData.channelId}-${Date.now()}`;
    const { data: session, error } = await supabase
      .from('live_sessions')
      .insert({
        channel_id: goLiveData.channelId,
        creator_id: user.id,
        title: goLiveData.title.trim(),
        livekit_room_name: roomName,
      })
      .select()
      .single();

    if (error || !session) {
      toast.error(error?.message || 'Failed to start stream');
      setGoingLive(false);
      return;
    }

    await supabase.from('channels').update({ is_live: true }).eq('id', goLiveData.channelId);

    setGoLiveOpen(false);
    setGoLiveData({ channelId: '', title: '' });
    setGoingLive(false);
    navigate(`/live/${session.id}`);
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk' }}>Dashboard</h1>
          <div className="flex gap-2">
            <Dialog open={goLiveOpen} onOpenChange={setGoLiveOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" disabled={channels.length === 0}>
                  <Radio className="h-4 w-4 mr-2" /> Go Live
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start a Livestream</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={goLiveData.channelId} onValueChange={(v) => setGoLiveData((p) => ({ ...p, channelId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select a channel" /></SelectTrigger>
                      <SelectContent>
                        {channels.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Stream Title</Label>
                    <Input value={goLiveData.title} onChange={(e) => setGoLiveData((p) => ({ ...p, title: e.target.value }))} placeholder="What are you streaming?" />
                  </div>
                  <Button onClick={goLive} className="w-full" variant="destructive" disabled={goingLive || !goLiveData.channelId || !goLiveData.title.trim()}>
                    {goingLive ? 'Starting...' : 'Go Live'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button onClick={() => navigate('/upload')}>
              <Plus className="h-4 w-4 mr-2" /> Upload Content
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Eye className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats.views.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Total Views</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats.subscribers.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">Subscribers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Film className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats.content}</p>
                  <p className="text-sm text-muted-foreground">Content Items</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Channels */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Your Channels</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> New Channel</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create BCTV Channel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Channel Name *</Label>
                  <Input value={newChannel.name} onChange={e => setNewChannel(p => ({ ...p, name: e.target.value }))} placeholder="My Channel" />
                </div>

                <div className="space-y-2">
                  <Label>Channel Handle ID *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input
                      value={newChannel.handle}
                      onChange={e => setNewChannel(p => ({ ...p, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                      placeholder="mychannel"
                      className="pl-8"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Unique identifier. Letters, numbers, and underscores only.</p>
                </div>

                <div className="space-y-2">
                  <Label>Description *</Label>
                  <Textarea value={newChannel.description} onChange={e => setNewChannel(p => ({ ...p, description: e.target.value }))} placeholder="What's this channel about?" />
                </div>

                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={newChannel.category} onValueChange={v => setNewChannel(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {CHANNEL_CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {newChannel.category === 'Others' && (
                    <Input
                      value={newChannel.customCategory}
                      onChange={e => setNewChannel(p => ({ ...p, customCategory: e.target.value.slice(0, 50) }))}
                      placeholder="Enter custom category (50 char max)"
                      maxLength={50}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Languages</Label>
                  <p className="text-xs text-muted-foreground mb-2">Select one or more languages for your channel content.</p>
                  <div className="flex flex-wrap gap-2">
                    {CHANNEL_LANGUAGES.map(lang => (
                      <Badge
                        key={lang}
                        variant={newChannel.languages.includes(lang) ? 'default' : 'outline'}
                        className="cursor-pointer select-none"
                        onClick={() => toggleLanguage(lang)}
                      >
                        {lang}
                      </Badge>
                    ))}
                  </div>
                  {newChannel.languages.includes('Others') && (
                    <Input
                      value={newChannel.customLanguage}
                      onChange={e => setNewChannel(p => ({ ...p, customLanguage: e.target.value.slice(0, 50) }))}
                      placeholder="Enter language (50 char max)"
                      maxLength={50}
                      className="mt-2"
                    />
                  )}
                </div>

                <Button
                  onClick={createChannel}
                  className="w-full"
                  disabled={creating || !newChannel.name.trim() || !newChannel.handle.trim() || !newChannel.category}
                >
                  {creating ? 'Creating...' : 'Create Channel'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-12">Loading...</p>
        ) : channels.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">You haven't created any channels yet</p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create Your First Channel
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {channels.map((ch) => (
              <Card key={ch.id} className="group">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/channel/${ch.id}`)}>
                      <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                        {ch.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{ch.name}</h3>
                          {ch.is_live && <LiveBadge />}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          @{(ch as any).handle ?? '—'} · {ch.subscriber_count} subscribers
                        </p>
                        {(ch as any).category && (
                          <Badge variant="secondary" className="mt-1 text-xs">{(ch as any).category}</Badge>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteChannel(ch.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
