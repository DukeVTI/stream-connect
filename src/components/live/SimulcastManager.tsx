import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, Radio, Users, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface SimulcastManagerProps {
  sessionId?: string;
  isPublisher?: boolean;
}

interface Partnership {
  id: string;
  primary_channel_id: string;
  secondary_channel_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'active' | 'ended';
  primary_channel: { name: string; avatar_url: string | null };
  secondary_channel: { name: string; avatar_url: string | null };
  requested_at: string;
}

interface PaidChannel {
  id: string;
  name: string;
  avatar_url: string | null;
  owner_id: string;
}

export function SimulcastManager({ sessionId, isPublisher = false }: SimulcastManagerProps) {
  const { user } = useAuth();
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [paidChannels, setPaidChannels] = useState<PaidChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadPartnerships();
      loadPaidChannels();
    }
  }, [user]);

  const loadPartnerships = async () => {
    try {
      const { data, error } = await supabase
        .from('simulcast_partnerships')
        .select(`
          *,
          primary_channel:channels!primary_channel_id(name, avatar_url),
          secondary_channel:channels!secondary_channel_id(name, avatar_url)
        `)
        .or(`primary_channel_id.in.(SELECT id FROM channels WHERE owner_id = '${user?.id}'),secondary_channel_id.in.(SELECT id FROM channels WHERE owner_id = '${user?.id}')`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPartnerships(data || []);
    } catch (error) {
      console.error('Failed to load partnerships:', error);
    }
  };

  const loadPaidChannels = async () => {
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('id, name, avatar_url, owner_id')
        .eq('subscription_tier', 'paid')
        .neq('owner_id', user?.id); // Exclude own channels

      if (error) throw error;
      setPaidChannels(data || []);
    } catch (error) {
      console.error('Failed to load paid channels:', error);
    }
  };

  const requestSimulcast = async () => {
    if (!selectedChannelId || !sessionId) return;

    setRequesting(true);
    try {
      const { error } = await supabase.rpc('request_simulcast_partnership', {
        _primary_channel_id: sessionId, // This should be the channel ID, not session ID
        _secondary_channel_id: selectedChannelId,
      });

      if (error) throw error;

      toast.success('Simulcast request sent!');
      setDialogOpen(false);
      setSelectedChannelId('');
      await loadPartnerships();
    } catch (error) {
      toast.error('Failed to request simulcast');
    } finally {
      setRequesting(false);
    }
  };

  const acceptPartnership = async (partnershipId: string) => {
    setAcceptingId(partnershipId);
    try {
      const { error } = await supabase.rpc('accept_simulcast_partnership', {
        _partnership_id: partnershipId,
      });

      if (error) throw error;

      toast.success('Simulcast partnership accepted!');
      await loadPartnerships();
    } catch (error) {
      toast.error('Failed to accept partnership');
    } finally {
      setAcceptingId(null);
    }
  };

  const rejectPartnership = async (partnershipId: string) => {
    setRejectingId(partnershipId);
    try {
      const { error } = await supabase.rpc('reject_simulcast_partnership', {
        _partnership_id: partnershipId,
      });

      if (error) throw error;

      toast.success('Simulcast partnership rejected');
      await loadPartnerships();
    } catch (error) {
      toast.error('Failed to reject partnership');
    } finally {
      setRejectingId(null);
    }
  };

  const startSimulcast = async (partnershipId: string) => {
    if (!sessionId) return;

    setStartingId(partnershipId);
    try {
      const { error } = await supabase.rpc('start_simulcast_session', {
        _partnership_id: partnershipId,
        _primary_session_id: sessionId,
      });

      if (error) throw error;

      toast.success('Simulcast started!');
      await loadPartnerships();
    } catch (error) {
      toast.error('Failed to start simulcast');
    } finally {
      setStartingId(null);
    }
  };

  const endSimulcast = async (partnershipId: string) => {
    setEndingId(partnershipId);
    try {
      const { error } = await supabase.rpc('end_simulcast_session', {
        _partnership_id: partnershipId,
      });

      if (error) throw error;

      toast.success('Simulcast ended');
      await loadPartnerships();
    } catch (error) {
      toast.error('Failed to end simulcast');
    } finally {
      setEndingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'accepted':
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Accepted</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'active':
        return <Badge variant="default" className="bg-green-600"><Radio className="h-3 w-3 mr-1" />Active</Badge>;
      case 'ended':
        return <Badge variant="outline">Ended</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const incomingRequests = partnerships.filter(p =>
    p.secondary_channel_id && p.status === 'pending'
  );

  const outgoingRequests = partnerships.filter(p =>
    p.primary_channel_id && p.status === 'pending'
  );

  const activeSimulcasts = partnerships.filter(p => p.status === 'active');

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Radio className="h-4 w-4" />
              Simulcast
            </CardTitle>
            <CardDescription className="text-xs">Broadcast to multiple channels simultaneously</CardDescription>
          </div>
          {isPublisher && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Request Simulcast
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Request Simulcast Partnership</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select Paid Channel</label>
                    <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a paid channel to simulcast to" />
                      </SelectTrigger>
                      <SelectContent>
                        {paidChannels.map(channel => (
                          <SelectItem key={channel.id} value={channel.id}>
                            <div className="flex items-center gap-2">
                              {channel.avatar_url ? (
                                <img src={channel.avatar_url} className="h-6 w-6 rounded-full" alt="" />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-muted" />
                              )}
                              {channel.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={requestSimulcast}
                    className="w-full"
                    disabled={requesting || !selectedChannelId}
                  >
                    {requesting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending Request...
                      </>
                    ) : (
                      'Send Request'
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active Simulcasts */}
        {activeSimulcasts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-green-600">Active Simulcasts</h4>
            {activeSimulcasts.map(partnership => (
              <div key={partnership.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded">
                <div className="flex items-center gap-3">
                  {partnership.secondary_channel.avatar_url ? (
                    <img src={partnership.secondary_channel.avatar_url} className="h-8 w-8 rounded-full" alt="" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-muted" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{partnership.secondary_channel.name}</p>
                    <p className="text-xs text-muted-foreground">Broadcasting live</p>
                  </div>
                </div>
                {isPublisher && (
                  <Button
                    onClick={() => endSimulcast(partnership.id)}
                    size="sm"
                    variant="outline"
                    disabled={endingId === partnership.id}
                  >
                    {endingId === partnership.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'End'
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Incoming Requests */}
        {incomingRequests.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Incoming Requests</h4>
            {incomingRequests.map(partnership => (
              <div key={partnership.id} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded">
                <div className="flex items-center gap-3">
                  {partnership.primary_channel.avatar_url ? (
                    <img src={partnership.primary_channel.avatar_url} className="h-8 w-8 rounded-full" alt="" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-muted" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{partnership.primary_channel.name}</p>
                    <p className="text-xs text-muted-foreground">wants to simulcast to your channel</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => acceptPartnership(partnership.id)}
                    size="sm"
                    variant="default"
                    disabled={acceptingId === partnership.id}
                  >
                    {acceptingId === partnership.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Accept'
                    )}
                  </Button>
                  <Button
                    onClick={() => rejectPartnership(partnership.id)}
                    size="sm"
                    variant="outline"
                    disabled={rejectingId === partnership.id}
                  >
                    {rejectingId === partnership.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      'Reject'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Outgoing Requests */}
        {outgoingRequests.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Outgoing Requests</h4>
            {outgoingRequests.map(partnership => (
              <div key={partnership.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded">
                <div className="flex items-center gap-3">
                  {partnership.secondary_channel.avatar_url ? (
                    <img src={partnership.secondary_channel.avatar_url} className="h-8 w-8 rounded-full" alt="" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-muted" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{partnership.secondary_channel.name}</p>
                    <p className="text-xs text-muted-foreground">Request sent</p>
                  </div>
                </div>
                {getStatusBadge(partnership.status)}
              </div>
            ))}
          </div>
        )}

        {/* Accepted Partnerships Ready to Start */}
        {partnerships.filter(p => p.status === 'accepted' && isPublisher).length > 0 && sessionId && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Ready to Simulcast</h4>
            {partnerships
              .filter(p => p.status === 'accepted' && isPublisher)
              .map(partnership => (
                <div key={partnership.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded">
                  <div className="flex items-center gap-3">
                    {partnership.secondary_channel.avatar_url ? (
                      <img src={partnership.secondary_channel.avatar_url} className="h-8 w-8 rounded-full" alt="" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-muted" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{partnership.secondary_channel.name}</p>
                      <p className="text-xs text-muted-foreground">Ready for simulcast</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => startSimulcast(partnership.id)}
                    size="sm"
                    variant="default"
                    disabled={startingId === partnership.id}
                  >
                    {startingId === partnership.id ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      'Start Simulcast'
                    )}
                  </Button>
                </div>
              ))}
          </div>
        )}

        {partnerships.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No simulcast partnerships yet</p>
        )}
      </CardContent>
    </Card>
  );
}
