

# BCR - Streaming & Content Platform (MVP)

## Overview
A YouTube-like platform called **BCR** where creators upload video/audio content and viewers can browse, subscribe, like, comment, and discover channels. Livestreaming will be added in a future phase.

## Pages & Features

### 1. Authentication
- Sign up / sign in pages with email & password
- User profiles (display name, avatar, bio)

### 2. Home / Discover Feed
- Grid of content cards (thumbnail, title, creator, views, date)
- Filter tabs: All, Video, Audio, Trending
- Search bar to find content and channels
- Click a card → content player page

### 3. Content Player Page
- Video player or audio player depending on content type
- Title, description, creator info with subscribe button
- Like/dislike buttons and view count
- Comments section (add, view comments)
- Sidebar with related/recommended content

### 4. Creator Dashboard (for registered creators)
- Overview stats: total views, subscribers, content count
- List of their channels with quick stats
- "Create Channel" button

### 5. Channel Management
- Create/edit channel (name, description, avatar, banner)
- Each creator can have multiple channels
- Channel page visible to viewers with all its content

### 6. Content Upload
- Upload form: title, description, thumbnail, category
- File upload for video or audio files
- Assign to one of the creator's channels
- Draft/published status toggle

### 7. Channel Page (public)
- Channel banner, avatar, name, subscriber count
- Tabs: Videos, Audio, About
- Subscribe button for viewers

### 8. User Profile & Subscriptions
- View subscriptions feed (content from subscribed channels)
- Manage account settings

## Backend (Supabase via Lovable Cloud)
- **Auth**: Email/password sign-up and sign-in
- **Database tables**: profiles, channels, content, comments, likes, subscriptions
- **Storage**: Buckets for video files, audio files, thumbnails, and avatars
- **RLS policies**: Creators manage their own content, viewers can read public content

## Design
- Dark theme by default (like YouTube dark mode)
- Clean, modern UI with card-based layouts
- Responsive for desktop and mobile
- Red/dark accent color scheme for BCR branding

