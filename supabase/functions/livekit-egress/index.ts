import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EgressRequest {
  action: "start" | "pause" | "resume" | "stop";
  sessionId: string;
  roomName: string;
  channelId?: string;
  recordingId?: string;
  recordingUrl?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: EgressRequest = await req.json();
    const {
      action,
      sessionId,
      roomName,
      channelId,
      recordingId,
      recordingUrl,
      thumbnailUrl,
      durationSeconds,
      fileSizeBytes,
    } = body;

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Get LiveKit API credentials from environment
    const liveKitUrl = Deno.env.get("LIVEKIT_URL") || "";
    const liveKitApiKey = Deno.env.get("LIVEKIT_API_KEY") || "";
    const liveKitApiSecret = Deno.env.get("LIVEKIT_API_SECRET") || "";

    // Validate required fields
    if (!sessionId || !roomName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: corsHeaders }
      );
    }

    let result = {};

    switch (action) {
      case "start": {
        // Start recording using LiveKit Egress API
        const egressResponse = await fetch(
          `${liveKitUrl}/livekit.Egress/StartRoomCompositeEgress`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${generateAccessToken(
                liveKitApiKey,
                liveKitApiSecret
              )}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              room_name: roomName,
              output: {
                case: "file",
                value: {
                  filepath: `recordings/${roomName}/${sessionId}.mp4`,
                  s3: {
                    access_key: Deno.env.get("AWS_ACCESS_KEY_ID"),
                    secret: Deno.env.get("AWS_SECRET_ACCESS_KEY"),
                    bucket: Deno.env.get("AWS_S3_BUCKET"),
                    region: Deno.env.get("AWS_REGION") || "us-east-1",
                  },
                },
              },
            }),
          }
        );

        if (!egressResponse.ok) {
          const error = await egressResponse.text();
          console.error("LiveKit Egress error:", error);
          return new Response(
            JSON.stringify({ error: "Failed to start recording" }),
            { status: 500, headers: corsHeaders }
          );
        }

        const egressData = await egressResponse.json();
        const egressId = egressData.egress_id;

        // Store recording in database
        const { data: recordingData, error: dbError } = await supabase
          .from("recordings")
          .insert({
            session_id: sessionId,
            channel_id: channelId,
            status: "recording",
            livekit_egress_id: egressId,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (dbError) {
          console.error("Database error:", dbError);
          return new Response(
            JSON.stringify({ error: "Failed to create recording record" }),
            { status: 500, headers: corsHeaders }
          );
        }

        result = {
          success: true,
          recordingId: recordingData.id,
          egressId: egressId,
        };
        break;
      }

      case "pause": {
        if (!recordingId) {
          return new Response(
            JSON.stringify({ error: "Recording ID required for pause" }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Update database to mark as paused
        const { error: updateError } = await supabase
          .from("recordings")
          .update({
            status: "paused",
            paused_at: new Date().toISOString(),
          })
          .eq("id", recordingId);

        if (updateError) {
          console.error("Database error:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to pause recording" }),
            { status: 500, headers: corsHeaders }
          );
        }

        result = { success: true, status: "paused" };
        break;
      }

      case "resume": {
        if (!recordingId) {
          return new Response(
            JSON.stringify({ error: "Recording ID required for resume" }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Update database to mark as recording again
        const { error: updateError } = await supabase
          .from("recordings")
          .update({
            status: "recording",
            resumed_at: new Date().toISOString(),
          })
          .eq("id", recordingId);

        if (updateError) {
          console.error("Database error:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to resume recording" }),
            { status: 500, headers: corsHeaders }
          );
        }

        result = { success: true, status: "recording" };
        break;
      }

      case "stop": {
        if (!recordingId) {
          return new Response(
            JSON.stringify({ error: "Recording ID required for stop" }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Get the egress ID from database
        const { data: recordingData, error: fetchError } = await supabase
          .from("recordings")
          .select("livekit_egress_id")
          .eq("id", recordingId)
          .single();

        if (fetchError || !recordingData) {
          console.error("Database error:", fetchError);
          return new Response(
            JSON.stringify({ error: "Recording not found" }),
            { status: 404, headers: corsHeaders }
          );
        }

        // Stop the LiveKit Egress
        const stopResponse = await fetch(
          `${liveKitUrl}/livekit.Egress/StopEgress`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${generateAccessToken(
                liveKitApiKey,
                liveKitApiSecret
              )}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              egress_id: recordingData.livekit_egress_id,
            }),
          }
        );

        if (!stopResponse.ok) {
          console.error("Failed to stop LiveKit egress");
        }

        // Update database with recording details
        const { error: updateError } = await supabase
          .from("recordings")
          .update({
            status: "completed",
            recording_url: recordingUrl,
            thumbnail_url: thumbnailUrl,
            duration_seconds: durationSeconds,
            file_size_bytes: fileSizeBytes,
            completed_at: new Date().toISOString(),
          })
          .eq("id", recordingId);

        if (updateError) {
          console.error("Database error:", updateError);
          return new Response(
            JSON.stringify({ error: "Failed to complete recording" }),
            { status: 500, headers: corsHeaders }
          );
        }

        result = { success: true, status: "completed" };
        break;
      }

      default: {
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: corsHeaders }
        );
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
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
  const hmac = crypto.subtle.sign("HMAC", { name: "SHA-256", hash: "SHA-256" }, keyBytes, messageBytes);

  return String.fromCharCode.apply(null, new Uint8Array(hmac));
}