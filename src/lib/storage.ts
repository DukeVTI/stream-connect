import { supabase } from '@/integrations/supabase/client';

export async function uploadImage(
  bucket: 'avatars' | 'banners' | 'thumbnails',
  userId: string,
  file: File
): Promise<string | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
