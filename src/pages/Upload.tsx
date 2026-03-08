import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload as UploadIcon, Video, Headphones } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export default function Upload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    channelId: '',
    contentType: 'video' as 'video' | 'audio',
    status: 'published' as 'draft' | 'published',
    category: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !form.channelId || !form.title.trim()) return;
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
        description: form.description.trim() || null,
        content_type: form.contentType,
        file_url: fileUrl,
        thumbnail_url: thumbnailUrl,
        status: form.status,
        category: form.category || null,
      });

      if (error) throw error;
      toast.success('Content uploaded!');
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
          <h2 className="text-xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk' }}>Create a channel first</h2>
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
          {/* Content type selection */}
          <div className="grid grid-cols-2 gap-4">
            <Card
              className={`cursor-pointer transition-all ${form.contentType === 'video' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setForm(f => ({ ...f, contentType: 'video' }))}
            >
              <CardContent className="pt-6 text-center">
                <Video className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="font-medium">Video</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-all ${form.contentType === 'audio' ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setForm(f => ({ ...f, contentType: 'audio' }))}
            >
              <CardContent className="pt-6 text-center">
                <Headphones className="h-8 w-8 mx-auto mb-2 text-primary" />
                <p className="font-medium">Audio</p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Give your content a title" required />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe your content..." rows={4} />
          </div>

          <div className="space-y-2">
            <Label>Channel</Label>
            <Select value={form.channelId} onValueChange={v => setForm(f => ({ ...f, channelId: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {channels.map(ch => (
                  <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{form.contentType === 'video' ? 'Video File' : 'Audio File'}</Label>
            <Input
              type="file"
              accept={form.contentType === 'video' ? 'video/*' : 'audio/*'}
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="cursor-pointer"
            />
          </div>

          <div className="space-y-2">
            <Label>Thumbnail (optional)</Label>
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

          <Button type="submit" className="w-full" disabled={loading}>
            <UploadIcon className="h-4 w-4 mr-2" />
            {loading ? 'Uploading...' : 'Upload'}
          </Button>
        </form>
      </div>
    </MainLayout>
  );
}
