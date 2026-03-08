
-- Atomic increment for view_count
CREATE OR REPLACE FUNCTION public.increment_view_count(_content_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.content SET view_count = view_count + 1 WHERE id = _content_id;
$$;

-- Atomic increment for like_count
CREATE OR REPLACE FUNCTION public.increment_like_count(_content_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.content SET like_count = like_count + 1 WHERE id = _content_id;
$$;

-- Atomic decrement for like_count
CREATE OR REPLACE FUNCTION public.decrement_like_count(_content_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.content SET like_count = GREATEST(like_count - 1, 0) WHERE id = _content_id;
$$;
