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
import { toast } from 'sonner';
import type { Channel } from '@/types/database';

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [stats, setStats] = useState({ views: 0, subscribers: 0, content: 0 });
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', description: '' });
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

  const createChannel = async () => {
    if (!user || !newChannel.name.trim() || creating) return;
    setCreating(true);
    const { error } = await supabase.from('channels').insert({
      owner_id: user.id,
      name: newChannel.name.trim(),
      description: newChannel.description.trim() || null,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Channel created!');
      setNewChannel({ name: '', description: '' });
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

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Creator Dashboard</h1>
          <Button onClick={() => navigate('/upload')}>
            <Plus className="h-4 w-4 mr-2" /> Upload Content
          </Button>
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
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Channel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Channel Name</Label>
                  <Input value={newChannel.name} onChange={e => setNewChannel(p => ({ ...p, name: e.target.value }))} placeholder="My Channel" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={newChannel.description} onChange={e => setNewChannel(p => ({ ...p, description: e.target.value }))} placeholder="What's this channel about?" />
                </div>
                <Button onClick={createChannel} className="w-full" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
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
                        <h3 className="font-semibold">{ch.name}</h3>
                        <p className="text-sm text-muted-foreground">{ch.subscriber_count} subscribers</p>
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
