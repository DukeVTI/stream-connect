import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Eye, Users, Film, Trash2, Radio, KeyRound, Lock, Unlock, BadgeCheck } from 'lucide-react';
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
import type { Database } from '@/integrations/supabase/types';

type Channel = Database['public']['Tables']['channels']['Row'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [stats, setStats] = useState({ views: 0, subscribers: 0, content: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinChannelId, setPinChannelId] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [settingPin, setSettingPin] = useState(false);

  const photoRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

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
      supabase.from('channels').select('*').eq('owner_id', user.id).order('created_at'),
      supabase.from('content').select('view_count').eq('creator_id', user.id),
    ]);
    const channelData = channelRes.data ?? [];
    setChannels(channelData as Channel[]);
    const totalSubs = channelData.reduce((sum, ch) => sum + ch.subscriber_count, 0);
    const totalViews = (contentRes.data ?? []).reduce((sum, c) => sum + c.view_count, 0);
    setStats({ views: totalViews, subscribers: totalSubs, content: contentRes.data?.length ?? 0 });
    setLoading(false);
  };

  const toggleLanguage = (lang: string) =>
    setNewChannel(p => ({
      ...p,
      languages: p.languages.includes(lang)
        ? p.languages.filter(l => l !== lang)
        : [...p.languages, lang],
    }));

  const createChannel = async () => {
    if (!user || !newChannel.name.trim() || !newChannel.handle.trim() || !newChannel.category || creating) return;

    const finalCategory = newChannel.category === 'Others'
      ? newChannel.customCategory.trim() || 'Others'
      : newChannel.category;

    const finalLanguages = [...newChannel.languages];
    if (finalLanguages.includes('Others') && newChannel.customLanguage.trim()) {
      finalLanguages[finalLanguages.indexOf('Others')] = newChannel.customLanguage.trim();
    }

    setCreating(true);
    try {
      // Insert channel first
      const { data: ch, error } = await supabase.from('channels').insert({
        owner_id: user.id,
        name: newChannel.name.trim(),
        description: newChannel.description.trim() || null,
        handle: newChannel.handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
        category: finalCategory,
        languages: finalLanguages,
      } as any).select().single();

      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          toast.error('That handle is already taken. Choose a different one.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      // Upload profile photo if selected
      if (photoFile && ch) {
        const ext = photoFile.name.split('.').pop();
        const path = `${user.id}/${ch.id}.${ext}`;
        const { error: upErr } = await supabase.storage.from('channel-photos').upload(path, photoFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('channel-photos').getPublicUrl(path);
          await supabase.from('channels').update({ profile_photo_url: urlData.publicUrl, avatar_url: urlData.publicUrl }).eq('id', ch.id);
        }
      }

      toast.success('Channel created!');
      setNewChannel({ name: '', description: '', handle: '', category: '', customCategory: '', languages: [], customLanguage: '' });
      setPhotoFile(null);
      setPhotoPreview(null);
      setDialogOpen(false);
      loadData();
    } finally {
      setCreating(false);
    }
  };

  const deleteChannel = async (channelId: string) => {
    if (!confirm('Delete this channel and all its content?')) return;
    const { error } = await supabase.from('channels').delete().eq('id', channelId);
    if (error) toast.error(error.message);
    else { toast.success('Channel deleted'); loadData(); }
  };

  const openPinDialog = (channelId: string) => {
    setPinChannelId(channelId);
    setPinInput('');
    setPinConfirm('');
    setPinDialogOpen(true);
  };

  const savePin = async () => {
    if (pinInput.length < 4) return toast.error('PIN must be at least 4 characters');
    if (pinInput !== pinConfirm) return toast.error('PINs do not match');
    setSettingPin(true);
    const { error } = await supabase.rpc('set_channel_pin', { _channel_id: pinChannelId, _plain_pin: pinInput });
    setSettingPin(false);
    if (error) toast.error(error.message);
    else { toast.success('Channel PIN set successfully'); setPinDialogOpen(false); }
  };

  const goLive = async () => {
    if (!user || !goLiveData.channelId || !goLiveData.title.trim() || goingLive) return;
    const channel = channels.find(c => c.id === goLiveData.channelId);
    if (channel && !channel.livestream_eligible) {
      toast.error('This channel is not eligible for livestreaming. Upgrade or use your first channel.');
      return;
    }
    setGoingLive(true);
    const roomName = `live-${goLiveData.channelId}-${Date.now()}`;
    const { data: session, error } = await supabase
      .from('live_sessions')
      .insert({ channel_id: goLiveData.channelId, creator_id: user.id, title: goLiveData.title.trim(), livekit_room_name: roomName })
      .select().single();
    if (error || !session) { toast.error(error?.message || 'Failed to start stream'); setGoingLive(false); return; }
    await supabase.from('channels').update({ is_live: true }).eq('id', goLiveData.channelId);
    setGoLiveOpen(false);
    setGoLiveData({ channelId: '', title: '' });
    setGoingLive(false);
    navigate(`/live/${session.id}`);
  };

  const liveEligibleChannels = channels.filter(c => c.livestream_eligible);

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk' }}>Dashboard</h1>
          <div className="flex gap-2">
            <Dialog open={goLiveOpen} onOpenChange={setGoLiveOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" disabled={liveEligibleChannels.length === 0}>
                  <Radio className="h-4 w-4 mr-2" /> Go Live
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Start a Livestream</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select value={goLiveData.channelId} onValueChange={v => setGoLiveData(p => ({ ...p, channelId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select eligible channel" /></SelectTrigger>
                      <SelectContent>
                        {liveEligibleChannels.map(ch => (
                          <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Stream Title</Label>
                    <Input value={goLiveData.title} onChange={e => setGoLiveData(p => ({ ...p, title: e.target.value }))} placeholder="What are you streaming?" />
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
          {[
            { icon: Eye, label: 'Total Views', value: stats.views.toLocaleString() },
            { icon: Users, label: 'Subscribers', value: stats.subscribers.toLocaleString() },
            { icon: Film, label: 'Content Items', value: stats.content },
          ].map(({ icon: Icon, label, value }) => (
            <Card key={label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Icon className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{value}</p>
                    <p className="text-sm text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* PIN Dialog */}
        <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle><KeyRound className="inline h-4 w-4 mr-2" />Set Channel PIN</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              This PIN allows co-managers to access this channel. Your own account never needs it.
            </p>
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>New PIN (min 4 characters)</Label>
                <Input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="Enter PIN" />
              </div>
              <div className="space-y-1.5">
                <Label>Confirm PIN</Label>
                <Input type="password" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)} placeholder="Repeat PIN" />
              </div>
              <Button className="w-full" onClick={savePin} disabled={settingPin || pinInput.length < 4}>
                {settingPin ? 'Saving...' : 'Save PIN'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Channels section */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Your Channels</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Plus className="h-4 w-4 mr-1" /> New Channel</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create BCTV Channel</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">

                {/* Channel profile photo */}
                <div className="space-y-2">
                  <Label>Channel Profile Photo <span className="text-destructive">*</span></Label>
                  <div
                    className="flex items-center gap-4 border border-dashed border-border rounded-lg p-4 cursor-pointer hover:border-primary/50"
                    onClick={() => photoRef.current?.click()}
                  >
                    {photoPreview ? (
                      <img src={photoPreview} className="h-14 w-14 rounded-full object-cover shrink-0" alt="preview" />
                    ) : (
                      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center shrink-0 text-2xl">📷</div>
                    )}
                    <p className="text-sm text-muted-foreground">{photoPreview ? 'Change photo' : 'Upload channel photo'}</p>
                  </div>
                  <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); }
                  }} />
                </div>

                <div className="space-y-2">
                  <Label>Channel Name <span className="text-destructive">*</span></Label>
                  <Input value={newChannel.name} onChange={e => setNewChannel(p => ({ ...p, name: e.target.value }))} placeholder="My Channel" />
                </div>

                <div className="space-y-2">
                  <Label>Channel Handle ID <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input
                      value={newChannel.handle}
                      onChange={e => setNewChannel(p => ({ ...p, handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                      placeholder="mychannel"
                      className="pl-8"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Letters, numbers, and underscores only.</p>
                </div>

                <div className="space-y-2">
                  <Label>Channel Description <span className="text-destructive">*</span></Label>
                  <Textarea value={newChannel.description} onChange={e => setNewChannel(p => ({ ...p, description: e.target.value }))} placeholder="What's this channel about?" />
                </div>

                <div className="space-y-2">
                  <Label>Category <span className="text-destructive">*</span></Label>
                  <Select value={newChannel.category} onValueChange={v => setNewChannel(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {CHANNEL_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {newChannel.category === 'Others' && (
                    <Input value={newChannel.customCategory} onChange={e => setNewChannel(p => ({ ...p, customCategory: e.target.value.slice(0, 50) }))} placeholder="Enter custom category (50 char max)" maxLength={50} />
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Languages</Label>
                  <p className="text-xs text-muted-foreground">Select one or more languages.</p>
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
                    <Input value={newChannel.customLanguage} onChange={e => setNewChannel(p => ({ ...p, customLanguage: e.target.value.slice(0, 50) }))} placeholder="Enter language (50 char max)" maxLength={50} className="mt-2" />
                  )}
                </div>

                <Button
                  onClick={createChannel}
                  className="w-full"
                  disabled={creating || !newChannel.name.trim() || !newChannel.handle.trim() || !newChannel.category || !newChannel.description.trim() || !photoFile}
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
              <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-2" /> Create Your First Channel</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {channels.map((ch) => (
              <Card key={ch.id} className="group">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer flex-1 min-w-0" onClick={() => navigate(`/channel/${ch.id}`)}>
                      {ch.profile_photo_url ? (
                        <img src={ch.profile_photo_url} alt={ch.name} className="h-12 w-12 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
                          {ch.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{ch.name}</h3>
                          {ch.is_live && <LiveBadge />}
                          {ch.is_first_channel && (
                            <Badge variant="secondary" className="text-xs gap-1">
                              <BadgeCheck className="h-3 w-3" /> Free Live
                            </Badge>
                          )}
                          {!ch.livestream_eligible && !ch.is_first_channel && (
                            <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
                              <Lock className="h-3 w-3" /> No Livestream
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">@{ch.handle ?? '—'} · {ch.subscriber_count} subscribers</p>
                        {ch.category && <Badge variant="secondary" className="mt-1 text-xs">{ch.category}</Badge>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Set Channel PIN"
                        onClick={() => openPinDialog(ch.id)}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteChannel(ch.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
