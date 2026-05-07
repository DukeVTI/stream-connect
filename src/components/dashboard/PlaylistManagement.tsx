import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Plus, Trash2, Play, Pause, Settings } from 'lucide-react';
import { toast } from 'sonner';

interface PlaylistManagementProps {
  channelId: string;
  channelName: string;
}

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  loop_enabled: boolean;
  shuffle_enabled: boolean;
  created_at: string;
  item_count?: number;
}

interface Schedule {
  id: string;
  playlist_id: string;
  trigger_type: 'always_offline' | 'scheduled' | 'manual';
  is_enabled: boolean;
  start_hour: number | null;
  start_minute: number | null;
  end_hour: number | null;
  end_minute: number | null;
  days_of_week: number[] | null;
  timezone: string | null;
}

interface ContentItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  duration: number | null;
}

export function PlaylistManagement({ channelId, channelName }: PlaylistManagementProps) {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);
  const [addingSchedule, setAddingSchedule] = useState(false);
  const [scheduleType, setScheduleType] = useState<'always_offline' | 'scheduled'>('always_offline');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [timezone, setTimezone] = useState('UTC');
  const [deletingPlaylistId, setDeletingPlaylistId] = useState<string | null>(null);

  useEffect(() => {
    loadPlaylists();
    loadSchedules();
    loadChannelContent();
  }, [channelId]);

  const loadPlaylists = async () => {
    try {
      const { data, error } = await supabase
        .from('automation_playlists')
        .select(`
          *,
          automation_playlist_items(count)
        `)
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const playlistsWithCount = data?.map(p => ({
        ...p,
        item_count: p.automation_playlist_items?.[0]?.count || 0,
      })) || [];

      setPlaylists(playlistsWithCount);
    } catch (error) {
      console.error('Error loading playlists:', error);
      toast.error('Failed to load playlists');
    }
  };

  const loadSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('automation_schedules')
        .select('*')
        .eq('channel_id', channelId);

      if (error) throw error;
      setSchedules(data || []);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  };

  const loadChannelContent = async () => {
    try {
      const { data, error } = await supabase
        .from('content')
        .select('id, title, thumbnail_url, duration')
        .eq('channel_id', channelId)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContent(data || []);
    } catch (error) {
      console.error('Error loading content:', error);
    }
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) {
      toast.error('Playlist name is required');
      return;
    }

    setCreatingPlaylist(true);
    try {
      const { data, error } = await supabase.rpc('create_automation_playlist', {
        _channel_id: channelId,
        _name: newPlaylistName,
        _description: newPlaylistDesc || null,
      });

      if (error) throw error;

      toast.success('Playlist created');
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      await loadPlaylists();
    } catch (error) {
      console.error('Error creating playlist:', error);
      toast.error('Failed to create playlist');
    } finally {
      setCreatingPlaylist(false);
    }
  };

  const deletePlaylist = async (playlistId: string) => {
    try {
      const { error } = await supabase
        .from('automation_playlists')
        .delete()
        .eq('id', playlistId);

      if (error) throw error;

      toast.success('Playlist deleted');
      await loadPlaylists();
      await loadSchedules();
    } catch (error) {
      console.error('Error deleting playlist:', error);
      toast.error('Failed to delete playlist');
    } finally {
      setDeletingPlaylistId(null);
    }
  };

  const togglePlaylistActive = async (playlist: Playlist) => {
    try {
      const { error } = await supabase
        .from('automation_playlists')
        .update({ is_active: !playlist.is_active })
        .eq('id', playlist.id);

      if (error) throw error;

      toast.success(playlist.is_active ? 'Playlist disabled' : 'Playlist enabled');
      await loadPlaylists();
    } catch (error) {
      console.error('Error updating playlist:', error);
      toast.error('Failed to update playlist');
    }
  };

  const createSchedule = async (playlistId: string) => {
    try {
      const [startHour, startMin] = startTime.split(':');
      const [endHour, endMin] = endTime.split(':');

      const { data, error } = await supabase.rpc('create_automation_schedule', {
        _channel_id: channelId,
        _playlist_id: playlistId,
        _trigger_type: scheduleType,
        _start_hour: scheduleType === 'scheduled' ? parseInt(startHour) : null,
        _start_minute: scheduleType === 'scheduled' ? parseInt(startMin) : null,
        _end_hour: scheduleType === 'scheduled' ? parseInt(endHour) : null,
        _end_minute: scheduleType === 'scheduled' ? parseInt(endMin) : null,
        _days_of_week: scheduleType === 'scheduled' ? [0, 1, 2, 3, 4, 5, 6] : null,
        _timezone: timezone,
      });

      if (error) throw error;

      toast.success('Schedule created');
      setSelectedPlaylist(null);
      await loadSchedules();
    } catch (error) {
      console.error('Error creating schedule:', error);
      toast.error('Failed to create schedule');
    } finally {
      setAddingSchedule(false);
    }
  };

  const deleteSchedule = async (scheduleId: string) => {
    try {
      const { error } = await supabase
        .from('automation_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;

      toast.success('Schedule deleted');
      await loadSchedules();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      toast.error('Failed to delete schedule');
    }
  };

  const toggleSchedule = async (schedule: Schedule) => {
    try {
      const { error } = await supabase
        .from('automation_schedules')
        .update({ is_enabled: !schedule.is_enabled })
        .eq('id', schedule.id);

      if (error) throw error;

      toast.success(schedule.is_enabled ? 'Schedule disabled' : 'Schedule enabled');
      await loadSchedules();
    } catch (error) {
      console.error('Error updating schedule:', error);
      toast.error('Failed to update schedule');
    }
  };

  const formatTime = (hour: number | null, minute: number | null): string => {
    if (hour === null || minute === null) return 'N/A';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  const getPlaylistForSchedule = (playlistId: string) => {
    return playlists.find(p => p.id === playlistId);
  };

  return (
    <div className="space-y-6">
      {/* Playlists Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Automation Playlists</CardTitle>
              <CardDescription>Create playlists for offline broadcasting</CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  New Playlist
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Playlist</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="playlist-name">Playlist Name</Label>
                    <Input
                      id="playlist-name"
                      placeholder="e.g., Evening Loop, Sleep Hour"
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="playlist-desc">Description (Optional)</Label>
                    <Textarea
                      id="playlist-desc"
                      placeholder="Add notes about this playlist..."
                      value={newPlaylistDesc}
                      onChange={(e) => setNewPlaylistDesc(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <Button
                    onClick={createPlaylist}
                    className="w-full"
                    disabled={creatingPlaylist}
                  >
                    {creatingPlaylist ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      'Create Playlist'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {playlists.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No playlists yet. Create one to get started.</p>
          ) : (
            <div className="space-y-2">
              {playlists.map((playlist) => (
                <div key={playlist.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{playlist.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {playlist.item_count} items
                      {playlist.loop_enabled && ' • Loop: On'}
                      {playlist.shuffle_enabled && ' • Shuffle: On'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={playlist.is_active ? 'default' : 'secondary'}>
                      {playlist.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button
                      onClick={() => togglePlaylistActive(playlist)}
                      size="sm"
                      variant="outline"
                    >
                      {playlist.is_active ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          onClick={() => setSelectedPlaylist(playlist)}
                          size="sm"
                          variant="outline"
                        >
                          <Settings className="h-3 w-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Configure Automation: {playlist.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <Label>Automation Type</Label>
                            <Select value={scheduleType} onValueChange={(val: any) => setScheduleType(val)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="always_offline">Always When Offline</SelectItem>
                                <SelectItem value="scheduled">Scheduled Times</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {scheduleType === 'scheduled' && (
                            <>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label htmlFor="start-time">Start Time</Label>
                                  <Input
                                    id="start-time"
                                    type="time"
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="end-time">End Time</Label>
                                  <Input
                                    id="end-time"
                                    type="time"
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="timezone">Timezone</Label>
                                <Select value={timezone} onValueChange={setTimezone}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="UTC">UTC</SelectItem>
                                    <SelectItem value="EST">EST (UTC-5)</SelectItem>
                                    <SelectItem value="CST">CST (UTC-6)</SelectItem>
                                    <SelectItem value="MST">MST (UTC-7)</SelectItem>
                                    <SelectItem value="PST">PST (UTC-8)</SelectItem>
                                    <SelectItem value="GMT">GMT (UTC+0)</SelectItem>
                                    <SelectItem value="CET">CET (UTC+1)</SelectItem>
                                    <SelectItem value="IST">IST (UTC+5:30)</SelectItem>
                                    <SelectItem value="JST">JST (UTC+9)</SelectItem>
                                    <SelectItem value="AEST">AEST (UTC+10)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          )}

                          <Button
                            onClick={() => createSchedule(playlist.id)}
                            className="w-full"
                            disabled={addingSchedule}
                          >
                            {addingSchedule ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              'Create Schedule'
                            )}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <AlertDialog>
                      <AlertDialog.Trigger asChild>
                        <Button
                          onClick={() => setDeletingPlaylistId(playlist.id)}
                          size="sm"
                          variant="destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialog.Trigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Playlist</AlertDialogTitle>
                        </AlertDialogHeader>
                        <AlertDialogDescription>
                          Are you sure you want to delete this playlist? This action cannot be undone.
                        </AlertDialogDescription>
                        <div className="flex gap-2 justify-end">
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deletePlaylist(playlist.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </div>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Schedules Section */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Schedules</CardTitle>
          <CardDescription>Configure when playlists should broadcast</CardDescription>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No schedules configured. Create a playlist and configure automation.</p>
          ) : (
            <div className="space-y-2">
              {schedules.map((schedule) => {
                const playlist = getPlaylistForSchedule(schedule.playlist_id);
                return (
                  <div key={schedule.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{playlist?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {schedule.trigger_type === 'always_offline'
                          ? 'Broadcasts when channel is offline'
                          : `${formatTime(schedule.start_hour, schedule.start_minute)} - ${formatTime(schedule.end_hour, schedule.end_minute)} ${schedule.timezone}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={schedule.is_enabled ? 'default' : 'secondary'}>
                        {schedule.is_enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <Button
                        onClick={() => toggleSchedule(schedule)}
                        size="sm"
                        variant="outline"
                      >
                        {schedule.is_enabled ? (
                          <Pause className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        onClick={() => deleteSchedule(schedule.id)}
                        size="sm"
                        variant="destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
