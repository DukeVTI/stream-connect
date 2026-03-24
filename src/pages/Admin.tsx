import { useEffect, useState, useCallback } from 'react';
import { Shield, CheckCircle2, XCircle, Clock, Users, BadgeCheck, Ban, Mail, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { VerificationBadge } from '@/components/ui/VerificationBadge';

interface CreatorRequest {
  id: string;
  user_id: string;
  status: string;
  reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

interface UserProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  account_status: string;
  verification_badge: string;
  created_at: string;
}

export default function Admin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState('requests');
  const [requests, setRequests] = useState<CreatorRequest[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Email form
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailTarget, setEmailTarget] = useState('all');
  const [emailTargetId, setEmailTargetId] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (user) checkAdminAndLoad();
  }, [user]);

  const checkAdminAndLoad = async () => {
    if (!user) return;
    const { data } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    setIsAdmin(!!data);
    if (data) {
      await Promise.all([loadRequests(), loadUsers()]);
    }
    setLoading(false);
  };

  const loadRequests = async () => {
    const { data, error } = await supabase
      .from('creator_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return;
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(r => r.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', userIds);
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) ?? []);
      setRequests(data.map(r => ({ ...r, profiles: profileMap.get(r.user_id) ?? null })));
    } else {
      setRequests([]);
    }
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url, account_status, verification_badge, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    setUsers((data as UserProfile[]) ?? []);
  };

  const handleReview = useCallback(async (requestId: string, decision: 'approved' | 'rejected') => {
    if (actionLoading) return;
    setActionLoading(requestId);
    try {
      const { error } = await supabase.rpc('review_creator_request', { _request_id: requestId, _decision: decision });
      if (error) throw error;
      toast.success(`Request ${decision}!`);
      loadRequests();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  }, [actionLoading]);

  const handleSetStatus = async (userId: string, status: 'active' | 'suspended' | 'deactivated') => {
    if (actionLoading) return;
    setActionLoading(userId + status);
    const { error } = await supabase.rpc('admin_set_account_status', { _user_id: userId, _status: status });
    setActionLoading(null);
    if (error) toast.error(error.message);
    else { toast.success(`Account ${status}`); loadUsers(); }
  };

  const handleSetBadge = async (userId: string, badge: 'none' | 'green' | 'blue') => {
    if (actionLoading) return;
    setActionLoading(userId + badge);
    const { error } = await supabase.rpc('admin_set_verification_badge', { _user_id: userId, _badge: badge });
    setActionLoading(null);
    if (error) toast.error(error.message);
    else { toast.success('Badge updated'); loadUsers(); }
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return toast.error('Subject and body required');
    setSendingEmail(true);
    // Invoke Edge Function for email sending
    const { error } = await supabase.functions.invoke('admin-send-email', {
      body: { subject: emailSubject, body: emailBody, target: emailTarget, targetId: emailTargetId || null },
    });
    setSendingEmail(false);
    if (error) toast.error('Failed to send email: ' + error.message);
    else { toast.success('Email sent!'); setEmailSubject(''); setEmailBody(''); }
  };

  if (isAdmin === null || loading) {
    return (
      <MainLayout>
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-64" />
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

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Admin Portal</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Clock, label: 'Pending Reviews', value: pendingCount, color: 'text-yellow-500' },
            { icon: CheckCircle2, label: 'Approved', value: requests.filter(r => r.status === 'approved').length, color: 'text-green-500' },
            { icon: XCircle, label: 'Rejected', value: requests.filter(r => r.status === 'rejected').length, color: 'text-destructive' },
            { icon: Users, label: 'Total Users', value: users.length, color: 'text-primary' },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Icon className={`h-6 w-6 ${color}`} />
                  <div>
                    <p className="text-xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="requests" className="gap-1.5">
              Creator Requests {pendingCount > 0 && <Badge variant="destructive" className="h-5 min-w-5 text-xs px-1.5">{pendingCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="email"><Mail className="h-3.5 w-3.5 mr-1" /> Send Email</TabsTrigger>
          </TabsList>

          {/* CREATOR REQUESTS */}
          <TabsContent value="requests" className="mt-6 space-y-3">
            {requests.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">No requests</CardContent></Card>
            ) : requests.map(req => (
              <Card key={req.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={req.profiles?.avatar_url ?? undefined} />
                        <AvatarFallback>{req.profiles?.display_name?.charAt(0) ?? '?'}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{req.profiles?.display_name ?? 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</p>
                        {req.reason && <p className="text-xs text-muted-foreground mt-1">"{req.reason}"</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {req.status === 'pending' ? (
                        <>
                          <Button size="sm" onClick={() => handleReview(req.id, 'approved')} disabled={actionLoading === req.id}>
                            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleReview(req.id, 'rejected')} disabled={actionLoading === req.id}>
                            <XCircle className="h-4 w-4 mr-1" /> Reject
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
            ))}
          </TabsContent>

          {/* USER MANAGEMENT */}
          <TabsContent value="users" className="mt-6 space-y-3">
            {users.map(u => (
              <Card key={u.user_id}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={u.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{u.display_name?.charAt(0) ?? '?'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm">{u.display_name ?? 'Unknown'}</span>
                        {u.verification_badge !== 'none' && <VerificationBadge type={u.verification_badge as any} size="sm" />}
                        {u.account_status !== 'active' && (
                          <Badge variant="destructive" className="text-xs capitalize">{u.account_status}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">Joined {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}</p>
                    </div>

                    {/* Status Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {u.account_status === 'active' ? (
                        <>
                          <Button size="sm" variant="outline" className="text-yellow-600 border-yellow-300 h-7 text-xs" onClick={() => handleSetStatus(u.user_id, 'suspended')}>
                            <Ban className="h-3 w-3 mr-1" /> Suspend
                          </Button>
                          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleSetStatus(u.user_id, 'deactivated')}>
                            Deactivate
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSetStatus(u.user_id, 'active')}>
                          Reinstate
                        </Button>
                      )}

                      {/* Badge Actions */}
                      <Select
                        value={u.verification_badge}
                        onValueChange={(v: any) => handleSetBadge(u.user_id, v)}
                      >
                        <SelectTrigger className="h-7 text-xs w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Badge</SelectItem>
                          <SelectItem value="blue">🔵 Blue (Public)</SelectItem>
                          <SelectItem value="green">🟢 Green (In-house)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* EMAIL COMPOSE */}
          <TabsContent value="email" className="mt-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Compose Email</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Send To</Label>
                  <Select value={emailTarget} onValueChange={setEmailTarget}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users (Broadcast)</SelectItem>
                      <SelectItem value="individual">Individual User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {emailTarget === 'individual' && (
                  <div className="space-y-1.5">
                    <Label>User ID or Email</Label>
                    <Input value={emailTargetId} onChange={e => setEmailTargetId(e.target.value)} placeholder="User ID or email address" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Subject <span className="text-destructive">*</span></Label>
                  <Input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Email subject" />
                </div>
                <div className="space-y-1.5">
                  <Label>Message <span className="text-destructive">*</span></Label>
                  <Textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Compose your message here..." rows={6} />
                </div>
                <Button className="gap-2" onClick={handleSendEmail} disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}>
                  <Send className="h-4 w-4" />
                  {sendingEmail ? 'Sending...' : 'Send Email'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
