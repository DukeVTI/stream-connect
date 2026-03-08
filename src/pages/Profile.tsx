import { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { uploadImage } from '@/lib/storage';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [isCreator, setIsCreator] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '');
      setBio(profile.bio ?? '');
      setIsCreator(profile.is_creator);
      setAvatarPreview(profile.avatar_url);
    }
  }, [profile]);

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
      .update({ display_name: displayName, bio, is_creator: isCreator })
      .eq('user_id', user.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Profile updated');
      await refreshProfile();
    }
    setSaving(false);
  };

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

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Creator Mode</p>
                <p className="text-xs text-muted-foreground">Enable to upload content and manage channels</p>
              </div>
              <Switch checked={isCreator} onCheckedChange={setIsCreator} />
            </div>

            <Button onClick={handleSave} className="w-full" disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
