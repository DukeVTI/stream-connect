import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, User, Tv, Film } from 'lucide-react';
import { VerificationBadge } from '@/components/ui/VerificationBadge';
import { formatDistanceToNow } from 'date-fns';

export default function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const [query, setQuery] = useState(q);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [content, setContent] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q) runSearch(q);
  }, [q]);

  const runSearch = async (term: string) => {
    setLoading(true);
    const ilike = `%${term}%`;
    const [accRes, chRes, contentRes] = await Promise.all([
      supabase.from('profiles').select('user_id, display_name, first_name, last_name, nickname, profile_photo_url, avatar_url, verification_badge, created_at, account_status').ilike('display_name', ilike).neq('account_status', 'deactivated').limit(20),
      supabase.from('channels').select('id, name, handle, category, languages, profile_photo_url, avatar_url, subscriber_count, created_at').ilike('name', ilike).limit(20),
      supabase.from('content').select('id, title, caption, thumbnail_url, content_type, view_count, created_at, channels(name)').eq('status', 'published').ilike('title', ilike).limit(20),
    ]);
    setAccounts(accRes.data ?? []);
    setChannels(chRes.data ?? []);
    setContent(contentRes.data ?? []);
    setLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) setSearchParams({ q: query.trim() });
  };

  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search accounts, channels, content..." className="pl-9" />
          </div>
        </form>

        {q && (
          <p className="text-sm text-muted-foreground mb-4">
            Results for "<span className="text-foreground font-medium">{q}</span>"
          </p>
        )}

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : (
          <Tabs defaultValue="channels">
            <TabsList className="mb-6">
              <TabsTrigger value="accounts" className="gap-1.5"><User className="h-4 w-4" /> Accounts ({accounts.length})</TabsTrigger>
              <TabsTrigger value="channels" className="gap-1.5"><Tv className="h-4 w-4" /> Channels ({channels.length})</TabsTrigger>
              <TabsTrigger value="content" className="gap-1.5"><Film className="h-4 w-4" /> Content ({content.length})</TabsTrigger>
            </TabsList>

            {/* ACCOUNTS */}
            <TabsContent value="accounts">
              {accounts.length === 0 ? (
                <EmptyState label="No accounts found" />
              ) : (
                <div className="space-y-3">
                  {accounts.map(acc => (
                    <Card key={acc.user_id}>
                      <CardContent className="py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={acc.profile_photo_url ?? acc.avatar_url ?? undefined} />
                            <AvatarFallback>{acc.display_name?.charAt(0) ?? '?'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm">{acc.display_name}</span>
                              {acc.verification_badge !== 'none' && <VerificationBadge type={acc.verification_badge} size="sm" />}
                            </div>
                            {acc.nickname && <p className="text-xs text-muted-foreground">"{acc.nickname}"</p>}
                            <p className="text-xs text-muted-foreground">Member {formatDistanceToNow(new Date(acc.created_at), { addSuffix: true })}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* CHANNELS */}
            <TabsContent value="channels">
              {channels.length === 0 ? (
                <EmptyState label="No channels found" />
              ) : (
                <div className="space-y-3">
                  {channels.map(ch => (
                    <Link key={ch.id} to={`/channel/${ch.id}`}>
                      <Card className="hover:border-primary/40 transition-colors">
                        <CardContent className="py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={ch.profile_photo_url ?? ch.avatar_url ?? undefined} />
                              <AvatarFallback>{ch.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{ch.name}</p>
                              <p className="text-xs text-muted-foreground">@{ch.handle} · {ch.subscriber_count} subscribers</p>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {ch.category && <Badge variant="secondary" className="text-xs">{ch.category}</Badge>}
                                {ch.languages?.slice(0, 2).map((l: string) => <Badge key={l} variant="outline" className="text-xs">{l}</Badge>)}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* CONTENT */}
            <TabsContent value="content">
              {content.length === 0 ? (
                <EmptyState label="No content found" />
              ) : (
                <div className="space-y-3">
                  {content.map(item => (
                    <Link key={item.id} to={`/watch/${item.id}`}>
                      <Card className="hover:border-primary/40 transition-colors">
                        <CardContent className="py-4">
                          <div className="flex gap-3 items-center">
                            {item.thumbnail_url ? (
                              <img src={item.thumbnail_url} alt={item.title} className="h-14 w-24 object-cover rounded" />
                            ) : (
                              <div className="h-14 w-24 bg-muted rounded flex items-center justify-center shrink-0">
                                <Film className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{item.title}</p>
                              {item.caption && <p className="text-xs text-muted-foreground italic truncate">"{item.caption}"</p>}
                              <p className="text-xs text-muted-foreground mt-0.5">{item.channels?.name} · {item.view_count} views · {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </MainLayout>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">{label}</div>
  );
}
