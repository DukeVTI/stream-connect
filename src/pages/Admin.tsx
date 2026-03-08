import { useEffect, useState, useCallback } from 'react';
import { Shield, CheckCircle2, XCircle, Clock, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface CreatorRequest {
  id: string;
  user_id: string;
  status: string;
  reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles: { display_name: string | null; avatar_url: string | null; email?: string } | null;
}

export default function Admin() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CreatorRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState('pending');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (user) checkAdminAndLoad();
  }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;
    const { data } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    setIsAdmin(!!data);
    if (data) loadRequests();
    else setLoading(false);
  };

  const loadRequests = async () => {
    setLoading(true);
    // We need to join with profiles via user_id
    const { data, error } = await supabase
      .from('creator_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load requests');
      setLoading(false);
      return;
    }

    // Fetch profile info for each request
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? []);
      const enriched = data.map(r => ({
        ...r,
        profiles: profileMap.get(r.user_id) ?? null,
      }));
      setRequests(enriched);
    } else {
      setRequests([]);
    }
    setLoading(false);
  };

  const handleReview = useCallback(async (requestId: string, decision: 'approved' | 'rejected') => {
    if (actionLoading) return;
    setActionLoading(requestId);
    try {
      const { error } = await supabase.rpc('review_creator_request', {
        _request_id: requestId,
        _decision: decision,
      });
      if (error) throw error;
      toast.success(`Request ${decision}!`);
      loadRequests();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading]);

  if (isAdmin === null || loading) {
    return (
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </MainLayout>
    );
  }

  if (!isAdmin) {
    return (
      <MainLayout>
        <div className="text-center py-20">
          <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have admin privileges.</p>
        </div>
      </MainLayout>
    );
  }

  const filtered = tab === 'all' ? requests : requests.filter(r => r.status === tab);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Pending Requests</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{requests.filter(r => r.status === 'approved').length}</p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <XCircle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">{requests.filter(r => r.status === 'rejected').length}</p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Requests */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="pending" className="gap-1.5">
              Pending {pendingCount > 0 && <Badge variant="destructive" className="h-5 min-w-5 text-xs px-1.5">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-6 space-y-3">
            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No {tab === 'all' ? '' : tab} requests found
                </CardContent>
              </Card>
            ) : (
              filtered.map((req) => (
                <Card key={req.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={req.profiles?.avatar_url ?? undefined} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                            {req.profiles?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{req.profiles?.display_name ?? 'Unknown User'}</p>
                          <p className="text-xs text-muted-foreground">
                            Requested {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                          </p>
                          {req.reason && <p className="text-sm text-muted-foreground mt-1">"{req.reason}"</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {req.status === 'pending' ? (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1"
                              onClick={() => handleReview(req.id, 'approved')}
                              disabled={actionLoading === req.id}
                            >
                              <CheckCircle2 className="h-4 w-4" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1"
                              onClick={() => handleReview(req.id, 'rejected')}
                              disabled={actionLoading === req.id}
                            >
                              <XCircle className="h-4 w-4" /> Reject
                            </Button>
                          </>
                        ) : (
                          <Badge variant={req.status === 'approved' ? 'default' : 'destructive'}>
                            {req.status === 'approved' ? 'Approved' : 'Rejected'}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
