import { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { uploadImage } from '@/lib/storage';

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dobPublic, setDobPublic] = useState(false);
  const [bio, setBio] = useState('');
  const [hobbies, setHobbies] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFirstName((profile as any).first_name ?? '');
      setLastName((profile as any).last_name ?? '');
      setNickname((profile as any).nickname ?? '');
      setDateOfBirth((profile as any).date_of_birth ?? '');
      setDobPublic((profile as any).dob_public ?? false);
      setBio(profile.bio ?? '');
      setHobbies(((profile as any).hobbies ?? []).join(', '));
      setAvatarPreview(profile.avatar_url);
    }
  }, [profile]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return; }

    setUploading(true);
    try {
      const url = await uploadImage('avatars', user.id, file);
      if (url) {
        setAvatarPreview(url);
        await supabase.from('profiles').update({ avatar_url: url }).eq('user_id', user.id);
        await refreshProfile();
        toast.success('Profile photo updated!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First and last name are required');
      return;
    }
    if (!bio.trim()) {
      toast.error('Bio is required');
      return;
    }
    setSaving(true);
    const hobbiesArray = hobbies.split(',').map(h => h.trim()).filter(Boolean);
    const displayName = `${firstName.trim()} ${lastName.trim()}`;
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        nickname: nickname.trim() || null,
        date_of_birth: dateOfBirth || null,
        dob_public: dobPublic,
        bio: bio.trim(),
        hobbies: hobbiesArray.length > 0 ? hobbiesArray : null,
      } as any)
      .eq('user_id', user.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Profile updated');
      await refreshProfile();
    }
    setSaving(false);
  };

  const initials = firstName ? firstName.charAt(0).toUpperCase() : (profile?.display_name?.charAt(0)?.toUpperCase() ?? 'U');

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Space Grotesk' }}>Your BCTV Account</h1>

        <div className="space-y-6">
          {/* Profile Photo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile Photo *</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={avatarPreview ?? undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-3xl">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                  >
                    <Camera className="h-6 w-6 text-white" />
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </div>
                <div>
                  <p className="font-medium">{firstName || lastName ? `${firstName} ${lastName}`.trim() : 'No name set'}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-xs text-primary hover:underline mt-1"
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Change photo'}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name *</Label>
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" />
                  <p className="text-xs text-muted-foreground">Public</p>
                </div>
                <div className="space-y-2">
                  <Label>Last Name *</Label>
                  <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
                  <p className="text-xs text-muted-foreground">Public</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Camera / Nick Name</Label>
                <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="Your stage name or nickname (optional)" />
                <p className="text-xs text-muted-foreground">Public if provided</p>
              </div>

              <div className="space-y-2">
                <Label>Date of Birth *</Label>
                <Input type="date" value={dateOfBirth} onChange={e => setDateOfBirth(e.target.value)} />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Day & month are public by default. Year is hidden.</p>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Show full DOB</Label>
                    <Switch checked={dobPublic} onCheckedChange={setDobPublic} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* About You */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About You</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Short Bio / Tell Us About You *</Label>
                <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell people about yourself..." rows={3} />
                <p className="text-xs text-muted-foreground">Public</p>
              </div>

              <div className="space-y-2">
                <Label>Hobbies</Label>
                <Input value={hobbies} onChange={e => setHobbies(e.target.value)} placeholder="Reading, Cooking, Photography (comma separated)" />
                <p className="text-xs text-muted-foreground">Public. Can be filled later.</p>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} className="w-full" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </MainLayout>
  );
}
