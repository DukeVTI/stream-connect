import { Link } from 'react-router-dom';
import { Play, Headphones, Eye, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ContentCardProps {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  contentType: 'video' | 'audio';
  viewCount: number;
  createdAt: string;
  channelName: string;
  channelAvatar: string | null;
  channelId: string;
  isOwner?: boolean;
}

export function ContentCard({
  id, title, thumbnailUrl, contentType, viewCount, createdAt, channelName, channelAvatar, channelId, isOwner
}: ContentCardProps) {
  return (
    <div className="group">
      <Link to={`/watch/${id}`} className="block">
        <div className="relative aspect-video bg-muted rounded-xl overflow-hidden mb-3">
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {contentType === 'video' ? (
                <Play className="h-12 w-12 text-muted-foreground" />
              ) : (
                <Headphones className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
          )}
          <div className="absolute top-2 right-2">
            <span className="px-2 py-0.5 rounded-md bg-background/80 backdrop-blur text-xs font-medium">
              {contentType === 'video' ? 'VIDEO' : 'AUDIO'}
            </span>
          </div>
        </div>
      </Link>
      <div className="flex gap-3">
        <Link to={`/channel/${channelId}`} className="shrink-0">
          <div className="h-9 w-9 rounded-full bg-muted overflow-hidden">
            {channelAvatar ? (
              <img src={channelAvatar} alt={channelName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold">
                {channelName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/watch/${id}`}>
            <h3 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {title}
            </h3>
          </Link>
          <Link to={`/channel/${channelId}`} className="text-xs text-muted-foreground hover:text-foreground mt-1 block">
            {channelName}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{viewCount.toLocaleString()}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</span>
          </div>
        </div>
        {isOwner && (
          <Link to={`/watch/${id}`} title="Manage Content" className="mt-1 ml-1 text-muted-foreground hover:text-primary transition-colors shrink-0">
            <Settings className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
