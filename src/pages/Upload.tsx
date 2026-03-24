import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon, Video, Headphones, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const MAX_SHORT_SECONDS = 120;

export default function Upload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    caption: '',
    description: '',
    channelId: '',
    contentType: 'video' as 'video' | 'audio',
    status: 'published' as 'draft' | 'published',
    category: '',
    approveDisapproveEnabled: true,
  });
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [detectedDuration, setDetectedDuration] = useState<number | null>(null);
  const isPsaShort = detectedDuration !== null && detectedDuration <= MAX_SHORT_SECONDS;

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    loadChannels();
  }, [user]);

  const loadChannels = async () => {
    if (!user) return;
    const { data } = await supabase.from('channels').select('id, name').eq('owner_id', user.id);
    setChannels(data ?? []);
    if (data && data.length > 0) setForm(f => ({ ...f, channelId: data[0].id }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setDetectedDuration(null);

    // Detect duration via Audio/Video element
    const url = URL.createObjectURL(f);
    const el = form.contentType === 'video'
      ? document.createElement('video')
      : document.createElement('audio');
    el.src = url;
    el.onloadedmetadata = () => {
      const dur = Math.round(el.duration);
      setDetectedDuration(dur);
      URL.revokeObjectURL(url);
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.channelId || !form.title.trim() || !form.caption.trim()) {
      toast.error('Please fill in all required fields (title and caption are required)');
      return;
    }
    setLoading(true);
    try {
      let fileUrl = null;
      let thumbnailUrl = null;

      if (file) {
        const ext = file.name.split('.').pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('content-files').upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('content-files').getPublicUrl(path);
        fileUrl = urlData.publicUrl;
      }

      if (thumbnail) {
        const ext = thumbnail.name.split('.').pop();
        const path = `${user.id}/${Date.now()}-thumb.${ext}`;
        const { error } = await supabase.storage.from('thumbnails').upload(path, thumbnail);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(path);
        thumbnailUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from('content').insert({
        channel_id: form.channelId,
        creator_id: user.id,
        title: form.title.trim(),
        caption: form.caption.trim(),
        description: form.description.trim() || null,
        content_type: form.contentType,
        file_url: fileUrl,
        thumbnail_url: thumbnailUrl,
        status: form.status,
        category: form.category || null,
        approve_disapprove_enabled: form.approveDisapproveEnabled,
        is_psa_short: isPsaShort,
        duration: detectedDuration,
      } as any);

      if (error) throw error;
      toast.success(isPsaShort ? 'PSA Short uploaded!' : 'Content uploaded!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  if (channels.length === 0) {
    return (
      <MainLayout>
        <div className="max-w-lg mx-auto px-4 py-20 text-center">
          <h2 className="text-xl font-bold mb-2">Create a channel first</h2>
          <p className="text-muted-foreground mb-4">You need at least one channel to upload content.</p>
          <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6" style={{ fontFamily: 'Space Grotesk' }}>Upload Content</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Content type */}
          <div className="grid grid-cols-2 gap-4">
            {(['video', 'audio'] as const).map(type => (
              <Card
                key={type}
                className={`cursor-pointer transition-all ${form.contentType === type ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setForm(f => ({ ...f, contentType: type }))}
              >
                <CardContent className="pt-6 text-center">
                  {type === 'video' ? <Video className="h-8 w-8 mx-auto mb-2 text-primary" /> : <Headphones className="h-8 w-8 mx-auto mb-2 text-primary" />}
                  <p className="font-medium capitalize">{type}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Give your content a title" required />
          </div>

          <div className="space-y-2">
            <Label>Caption <span className="text-destructive">*</span></Label>
            <Input value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="A short caption for this content" required />
            <p className="text-xs text-muted-foreground">Required. Shown prominently below the title.</p>
          </div>

          <div className="space-y-2">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="More details about this content..." rows={4} />
          </div>

          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={form.channelId} onValueChange={v => setForm(f => ({ ...f, channelId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {channels.map(ch => <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{form.contentType === 'video' ? 'Video File' : 'Audio File'}</Label>
            <Input type="file" accept={form.contentType === 'video' ? 'video/*' : 'audio/*'} onChange={handleFileChange} className="cursor-pointer" />
            {/* Duration detection result */}
            {detectedDuration !== null && (
              <div className="flex items-center gap-2">
                {isPsaShort ? (
                  <Badge className="gap-1 bg-amber-500 text-white"><Zap className="h-3 w-3" /> PSA Short detected ({detectedDuration}s)</Badge>
                ) : (
                  <p className="text-xs text-muted-foreground">Duration: {Math.floor(detectedDuration / 60)}m {detectedDuration % 60}s</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Thumbnail <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input type="file" accept="image/*" onChange={e => setThumbnail(e.target.files?.[0] ?? null)} className="cursor-pointer" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v: any) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Music, Tech" />
            </div>
          </div>

          {/* Approve/Disapprove toggle */}
          <div className="flex items-center justify-between border border-border rounded-lg p-4">
            <div>
              <p className="font-medium text-sm">Approve / Disapprove Voting</p>
              <p className="text-xs text-muted-foreground">Allow viewers to approve or disapprove this content</p>
            </div>
            <Switch
              checked={form.approveDisapproveEnabled}
              onCheckedChange={checked => setForm(f => ({ ...f, approveDisapproveEnabled: checked }))}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || !form.title.trim() || !form.caption.trim()}>
            <UploadIcon className="h-4 w-4 mr-2" />
            {loading ? 'Uploading...' : `Upload${isPsaShort ? ' as PSA Short' : ''}`}
          </Button>
        </form>
      </div>
    </MainLayout>
  );
}
