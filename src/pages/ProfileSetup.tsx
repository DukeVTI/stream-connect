import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Camera, ChevronRight, ChevronLeft, CheckCircle, SkipForward, User } from 'lucide-react';

const TOTAL_STEPS = 6;

const STEP_LABELS = [
  'Your Name',
  'Date of Birth',
  'Profile Photo',
  'About You',
  'Hobbies',
  'Assign Admins',
];

interface AdminEntry {
  first_name: string;
  last_name: string;
  email: string;
}

export default function ProfileSetup() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 0 — Name
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');

  // Step 1 — DOB
  const [dob, setDob] = useState('');
  const [dobVisibility, setDobVisibility] = useState<'public' | 'partial' | 'private'>('partial');

  // Step 2 — Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 3 — Bio
  const [bio, setBio] = useState('');

  // Step 4 — Hobbies
  const [hobbies, setHobbies] = useState('');

  // Step 5 — Admins
  const [admins, setAdmins] = useState<AdminEntry[]>([
    { first_name: '', last_name: '', email: '' },
    { first_name: '', last_name: '', email: '' },
    { first_name: '', last_name: '', email: '' },
  ]);

  const canProceed = () => {
    if (step === 0) return firstName.trim() && lastName.trim();
    if (step === 1) return !!dob;
    if (step === 2) return !!photoFile || !!user; // allow only if photo selected
    if (step === 3) return bio.trim().length > 0;
    return true;
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const updateAdmin = (idx: number, field: keyof AdminEntry, value: string) => {
    setAdmins(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const saveAdmins = async () => {
    if (!user) return;
    const validAdmins = admins.filter(a => a.first_name.trim() && a.last_name.trim() && a.email.trim());
    for (const admin of validAdmins) {
      await supabase.from('account_admins').upsert({
        account_owner_id: user.id,
        first_name: admin.first_name.trim(),
        last_name: admin.last_name.trim(),
        email: admin.email.trim().toLowerCase(),
      }, { onConflict: 'account_owner_id,email' });
    }
  };

  const handleFinish = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let photoUrl: string | null = null;

      // Upload profile photo
      if (photoFile) {
        const ext = photoFile.name.split('.').pop();
        const path = `${user.id}/profile.${ext}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, photoFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      }

      const hobbiesArr = hobbies.split(',').map(h => h.trim()).filter(Boolean);

      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          nickname: nickname.trim() || null,
          date_of_birth: dob || null,
          dob_visibility: dobVisibility,
          bio: bio.trim(),
          hobbies: hobbiesArr.length ? hobbiesArr : null,
          profile_photo_url: photoUrl,
          avatar_url: photoUrl,
          profile_complete: true,
        })
        .eq('user_id', user.id);

      if (error) throw error;

      await saveAdmins();
      await refreshProfile();

      toast.success('Profile created! Welcome to BCTV.');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (step < TOTAL_STEPS - 1) setStep(s => s + 1);
    else handleFinish();
  };

  const back = () => setStep(s => s - 1);

  const stepContent = () => {
    switch (step) {
      case 0:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your <strong>real legal name</strong>. This will be publicly visible on your BCTV account.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name <span className="text-destructive">*</span></Label>
                <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="John" />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name <span className="text-destructive">*</span></Label>
                <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Camera / Nick Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="e.g. JD Broadcast" />
              <p className="text-xs text-muted-foreground">Publicly visible. Leave blank to use your real name.</p>
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Your date of birth is required. You control how much of it is shown publicly.
            </p>
            <div className="space-y-1.5">
              <Label>Date of Birth <span className="text-destructive">*</span></Label>
              <Input type="date" value={dob} onChange={e => setDob(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date of Birth Visibility</Label>
              <Select value={dobVisibility} onValueChange={(v: any) => setDobVisibility(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="partial">Show day & month only (default)</SelectItem>
                  <SelectItem value="public">Show full date publicly</SelectItem>
                  <SelectItem value="private">Keep completely private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A profile photo is required and will be shown publicly on your BCTV account.
            </p>
            <div
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 transition-colors"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="h-24 w-24 rounded-full object-cover" />
              ) : (
                <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
                  <Camera className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
              <p className="text-sm font-medium">{photoPreview ? 'Change photo' : 'Upload profile photo'}</p>
              <p className="text-xs text-muted-foreground">JPG, PNG or WEBP · Max 5MB</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tell the BCTV community about yourself. This bio is public.
            </p>
            <div className="space-y-1.5">
              <Label>Short Bio <span className="text-destructive">*</span></Label>
              <Textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Tell us who you are and what you're passionate about..."
                rows={5}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              List your hobbies and interests. This is optional and public. Separate with commas.
            </p>
            <div className="space-y-1.5">
              <Label>Hobbies <span className="text-muted-foreground text-xs">(optional, comma-separated)</span></Label>
              <Input
                value={hobbies}
                onChange={e => setHobbies(e.target.value)}
                placeholder="e.g. Photography, Cooking, Travel"
              />
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You can assign up to 3 co-managers for your account. Each must be a registered BCTV user. 
              This step is optional — you can do it later from your account settings.
            </p>
            {admins.map((admin, i) => (
              <div key={i} className="border border-border rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold">Administrator {i + 1}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name</Label>
                    <Input
                      value={admin.first_name}
                      onChange={e => updateAdmin(i, 'first_name', e.target.value)}
                      placeholder="First name"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name</Label>
                    <Input
                      value={admin.last_name}
                      onChange={e => updateAdmin(i, 'last_name', e.target.value)}
                      placeholder="Last name"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email Address</Label>
                  <Input
                    type="email"
                    value={admin.email}
                    onChange={e => updateAdmin(i, 'email', e.target.value)}
                    placeholder="their@email.com"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center">
              <User className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Space Grotesk' }}>BCTV</span>
          </div>
          <h1 className="text-xl font-bold">Set Up Your Account</h1>
          <p className="text-sm text-muted-foreground mt-1">Step {step + 1} of {TOTAL_STEPS}: {STEP_LABELS[step]}</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 mb-8">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${i <= step ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm min-h-[280px]">
          {stepContent()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 gap-3">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>

          <div className="flex gap-2">
            {/* Skip allowed on step 4 (hobbies) and step 5 (admins) */}
            {(step === 4 || step === 5) && step !== TOTAL_STEPS - 1 && (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s + 1)} className="gap-1">
                <SkipForward className="h-3.5 w-3.5" /> Skip
              </Button>
            )}
            {step === TOTAL_STEPS - 1 ? (
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleFinish} disabled={saving}>
                  Skip & Finish
                </Button>
                <Button onClick={handleFinish} disabled={saving} className="gap-1">
                  {saving ? 'Saving...' : <><CheckCircle className="h-4 w-4" /> Finish</>}
                </Button>
              </div>
            ) : (
              <Button
                onClick={next}
                disabled={!canProceed()}
                className="gap-1"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
