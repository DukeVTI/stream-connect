import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AutomationConfig {
  schedule_id: string;
  channel_id: string;
  playlist_id: string;
  trigger_type: "always_offline" | "scheduled";
  start_hour: number | null;
  start_minute: number | null;
  end_hour: number | null;
  end_minute: number | null;
  days_of_week: number[] | null;
  timezone: string;
  is_enabled: boolean;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Get all enabled schedules
    const { data: schedules, error: scheduleError } = await supabase
      .from("automation_schedules")
      .select("*")
      .eq("is_enabled", true);

    if (scheduleError) {
      throw new Error(`Failed to fetch schedules: ${scheduleError.message}`);
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentDayOfWeek = now.getDay();

    let processedCount = 0;
    const errors: string[] = [];

    for (const schedule of schedules) {
      try {
        // Check if this schedule should run
        let shouldRun = false;

        if (schedule.trigger_type === "always_offline") {
          // Check if channel is offline
          const { data: channel } = await supabase
            .from("channels")
            .select("is_live")
            .eq("id", schedule.channel_id)
            .single();

          if (channel && !channel.is_live) {
            shouldRun = true;
          }
        } else if (schedule.trigger_type === "scheduled") {
          // Check if current time is within scheduled window
          const startTime =
            (schedule.start_hour || 0) * 60 + (schedule.start_minute || 0);
          const endTime =
            (schedule.end_hour || 0) * 60 + (schedule.end_minute || 0);
          const currentTime = currentHour * 60 + currentMinute;

          const daysOfWeek = schedule.days_of_week || [0, 1, 2, 3, 4, 5, 6];

          if (
            daysOfWeek.includes(currentDayOfWeek) &&
            currentTime >= startTime &&
            currentTime <= endTime
          ) {
            shouldRun = true;
          }
        }

        if (!shouldRun) {
          continue;
        }

        // Check if session is already running
        const { data: activeSession } = await supabase
          .from("automation_sessions")
          .select("id")
          .eq("schedule_id", schedule.id)
          .eq("status", "running")
          .single();

        if (activeSession) {
          // Already running
          continue;
        }

        // Get playlist items
        const { data: playlistItems, error: itemsError } = await supabase
          .from("automation_playlist_items")
          .select(`
            id,
            content:content_id(
              id,
              title,
              file_url,
              duration
            )
          `)
          .eq("playlist_id", schedule.playlist_id)
          .order("position", { ascending: true });

        if (itemsError) {
          throw new Error(`Failed to fetch playlist items: ${itemsError.message}`);
        }

        if (!playlistItems || playlistItems.length === 0) {
          console.log(`No items in playlist ${schedule.playlist_id}`);
          continue;
        }

        // Get channel info for room name
        const { data: channel } = await supabase
          .from("channels")
          .select("handle, name")
          .eq("id", schedule.channel_id)
          .single();

        const roomName = `auto-${channel?.handle || channel?.name}-${Date.now()}`;

        // Create automation session
        const { data: session, error: sessionError } = await supabase.rpc(
          "start_automation_session",
          {
            _schedule_id: schedule.id,
            _room_name: roomName,
          }
        );

        if (sessionError) {
          throw new Error(
            `Failed to create session: ${sessionError.message}`
          );
        }

        // Log event
        await supabase
          .from("automation_logs")
          .insert({
            channel_id: schedule.channel_id,
            session_id: session,
            event_type: "started",
            message: `Automation started for playlist ${schedule.playlist_id}`,
            metadata: {
              playlist_item_count: playlistItems.length,
              trigger_type: schedule.trigger_type,
            },
          });

        processedCount++;

        // Build playlist file list from content
        const fileList = playlistItems
          .map((item: any) => item.content?.file_url)
          .filter(Boolean);

        // Start LiveKit Egress with playlist
        if (fileList.length > 0) {
          const liveKitUrl = Deno.env.get("LIVEKIT_URL") || "";
          const liveKitApiKey = Deno.env.get("LIVEKIT_API_KEY") || "";
          const liveKitApiSecret = Deno.env.get("LIVEKIT_API_SECRET") || "";
          const s3Bucket = Deno.env.get("AWS_S3_BUCKET") || "";
          const s3Region = Deno.env.get("AWS_REGION") || "us-east-1";
          const awsAccessKey = Deno.env.get("AWS_ACCESS_KEY_ID") || "";
          const awsSecretKey = Deno.env.get("AWS_SECRET_ACCESS_KEY") || "";

          // Generate LiveKit token
          const token = generateAccessToken(liveKitApiKey, liveKitApiSecret);

          // Start Egress with file list
          const egressResponse = await fetch(
            `${liveKitUrl}/livekit.Egress/StartRoomCompositeEgress`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                room_name: roomName,
                output: {
                  case: "file",
                  value: {
                    filepath: `automation/${roomName}/${Date.now()}.mp4`,
                    s3: {
                      access_key: awsAccessKey,
                      secret: awsSecretKey,
                      bucket: s3Bucket,
                      region: s3Region,
                    },
                  },
                },
              }),
            }
          );

          if (egressResponse.ok) {
            const egressData = await egressResponse.json();
            // Update session with egress ID
            await supabase.rpc("update_automation_session", {
              _session_id: session,
              _status: "running",
              _egress_id: egressData.egress_id,
            });
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Schedule ${schedule.id}: ${errorMsg}`);
        console.error(`Error processing schedule ${schedule.id}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: processedCount,
        errors: errors,
        timestamp: now.toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Error in automation scheduler:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Helper function to generate LiveKit JWT token
function generateAccessToken(apiKey: string, apiSecret: string): string {
  const header = { typ: "JWT", alg: "HS256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: apiKey,
    nbf: now,
    exp: now + 3600, // 1 hour expiry
  };

  const encodeBase64Url = (input: string): string => {
    return btoa(input)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  };

  const headerEncoded = encodeBase64Url(JSON.stringify(header));
  const payloadEncoded = encodeBase64Url(JSON.stringify(payload));

  const message = `${headerEncoded}.${payloadEncoded}`;
  const signature = encodeBase64Url(hmacSha256(apiSecret, message));

  return `${message}.${signature}`;
}

// Helper function for HMAC-SHA256
function hmacSha256(key: string, message: string): string {
  const keyBytes = new TextEncoder().encode(key);
  const messageBytes = new TextEncoder().encode(message);

  // Use WebCrypto API
  const crypto = globalThis.crypto;
  const hmac = crypto.subtle.sign(
    "HMAC",
    { name: "SHA-256", hash: "SHA-256" },
    keyBytes,
    messageBytes
  );

  return String.fromCharCode.apply(null, new Uint8Array(hmac));
}
