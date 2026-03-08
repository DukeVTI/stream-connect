import { useState, useEffect, useRef } from 'react';
import { Camera, Clock, CheckCircle2, XCircle, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { uploadImage } from '@/lib/storage';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Creator request state
  const [creatorRequest, setCreatorRequest] = useState<{ status: string } | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '');
      setBio(profile.bio ?? '');
      setAvatarPreview(profile.avatar_url);
    }
  }, [profile]);

  useEffect(() => {
    if (user) loadCreatorRequest();
  }, [user]);

  const loadCreatorRequest = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('creator_requests')
      .select('status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCreatorRequest(data);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }

    setUploading(true);
    try {
      const url = await uploadImage('avatars', user.id, file);
      if (url) {
        setAvatarPreview(url);
        await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', user.id);
        await refreshProfile();
        toast.success('Avatar updated!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName, bio })
      .eq('user_id', user.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Profile updated');
      await refreshProfile();
    }
    setSaving(false);
  };

  const handleRequestCreator = async () => {
    if (!user || submittingRequest) return;
    setSubmittingRequest(true);
    const { error } = await supabase.from('creator_requests').insert({
      user_id: user.id,
      reason: requestReason.trim() || null,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Creator request submitted! An admin will review it shortly.');
      setRequestReason('');
      loadCreatorRequest();
    }
    setSubmittingRequest(false);
  };

  const renderCreatorSection = () => {
    // Already a creator
    if (profile?.is_creator) {
      return (
        <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">Creator Mode Active</p>
              <p className="text-xs text-muted-foreground">You can upload content and manage channels</p>
            </div>
          </div>
          <Badge variant="default">Creator</Badge>
        </div>
      );
    }

    // Has a pending request
    if (creatorRequest?.status === 'pending') {
      return (
        <div className="flex items-center justify-between p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-sm">Creator Request Pending</p>
              <p className="text-xs text-muted-foreground">An admin is reviewing your request</p>
            </div>
          </div>
          <Badge variant="secondary">Pending</Badge>
        </div>
      );
    }

    // Was rejected — can resubmit
    if (creatorRequest?.status === 'rejected') {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium text-sm">Creator Request Rejected</p>
                <p className="text-xs text-muted-foreground">You can submit a new request below</p>
              </div>
            </div>
            <Badge variant="destructive">Rejected</Badge>
          </div>
          {renderRequestForm()}
        </div>
      );
    }

    // No request yet
    return renderRequestForm();
  };

  const renderRequestForm = () => (
    <div className="space-y-3 p-4 rounded-lg border border-border">
      <div>
        <p className="font-medium text-sm">Want to become a creator?</p>
        <p className="text-xs text-muted-foreground">Submit a request and an admin will review it</p>
      </div>
      <Textarea
        value={requestReason}
        onChange={(e) => setRequestReason(e.target.value)}
        placeholder="Tell us why you'd like to become a creator (optional)..."
        rows={2}
      />
      <Button
        onClick={handleRequestCreator}
        disabled={submittingRequest}
        size="sm"
        className="gap-1.5"
      >
        <Send className="h-4 w-4" />
        {submittingRequest ? 'Submitting...' : 'Request Creator Access'}
      </Button>
    </div>
  );

  return (
    <MainLayout>
      <div className="max-w-lg mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Your Profile</h1>

        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Avatar with upload */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatarPreview ?? undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                    {displayName.charAt(0)?.toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                >
                  <Camera className="h-5 w-5 text-white" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
              <div>
                <p className="font-medium">{displayName || 'No name set'}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-primary hover:underline mt-1"
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : 'Change avatar'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell people about yourself" rows={3} />
            </div>

            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>

            {/* Creator section */}
            <div className="pt-2 border-t border-border">
              <h3 className="text-sm font-semibold mb-3">Creator Status</h3>
              {renderCreatorSection()}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
