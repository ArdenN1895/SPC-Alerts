// supabase/functions/send-push/index.ts
// UNIFIED VERSION: Handles both targeted (user_ids) and broadcast (all users) notifications
// Uses web-push library for proper VAPID signing (mobile-compatible)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }), 
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("📬 ===== PUSH NOTIFICATION REQUEST =====");

  try {
    // Get environment variables
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.log("🔑 Environment check:");
    console.log("- VAPID_PUBLIC_KEY:", vapidPublic ? "✅ Set" : "❌ Missing");
    console.log("- VAPID_PRIVATE_KEY:", vapidPrivate ? "✅ Set" : "❌ Missing");

    if (!vapidPublic || !vapidPrivate) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Configure web-push with VAPID keys
    webpush.setVapidDetails(
      "mailto:admin@spcalerts.com",
      vapidPublic,
      vapidPrivate
    );

    // Parse request body
    const requestData = await req.json();
    const { 
      title, 
      body, 
      icon = "/public/img/icon-192.png",
      badge = "/public/img/badge-72.png",
      image, 
      url = "/public/html/index.html",
      data,
      urgency = "normal",
      user_ids // Optional: if provided = targeted, if not = broadcast to ALL
    } = requestData;

    console.log(`📨 Notification: "${title}" - "${body}"`);
    
    // Determine notification type
    if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
      console.log(`🎯 TARGETED notification to ${user_ids.length} specific user(s):`, user_ids);
    } else {
      console.log(`📢 BROADCAST notification to ALL subscribed users`);
    }

    // Validate required fields
    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: "title and body are required" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    
    // Fetch subscriptions based on whether user_ids is provided
    let query = supabase.from("push_subscriptions").select("id, user_id, subscription");
    
    if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
      // TARGETED: Only fetch subscriptions for specified users
      query = query.in('user_id', user_ids);
    }
    // If no user_ids, fetch ALL subscriptions (broadcast)

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      console.error("❌ Database error:", fetchError);
      return new Response(
        JSON.stringify({ error: `Database error: ${fetchError.message}` }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📊 Found ${subscriptions?.length || 0} subscription(s)`);

    if (!subscriptions || subscriptions.length === 0) {
      const message = user_ids 
        ? `No subscribers found for specified users: ${user_ids.join(', ')}`
        : "No subscribers found in the system";
      
      console.log("⚠️", message);
      
      return new Response(
        JSON.stringify({ 
          success: true, // Don't fail if no subscribers
          delivered_to: 0, 
          message,
          notification_type: user_ids ? 'targeted' : 'broadcast',
          targeted_users: user_ids || null
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare notification payload
    const notificationPayload = JSON.stringify({ 
      title, 
      body, 
      icon: icon || "/public/img/icon-192.png",
      badge: badge || "/public/img/badge-72.png",
      image, 
      url,
      data: data || {},
      timestamp: Date.now(),
      tag: `spc-alert-${Date.now()}`, // Unique tag for each notification
      requireInteraction: urgency === 'high'
    });

    let delivered = 0;
    let failed = 0;
    const errors: Array<{id: string, user_id: string, error: string}> = [];

    // Send notifications to all subscriptions
    for (const { id, user_id, subscription } of subscriptions) {
      try {
        console.log(`\n📤 Sending to user ${user_id} (subscription ${id})...`);
        
        // Parse subscription if it's a string
        const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;
        console.log(`- Endpoint: ${sub.endpoint.substring(0, 50)}...`);
        
        // ✅ Use web-push library to send (handles VAPID signing automatically)
        const result = await webpush.sendNotification(
          sub,
          notificationPayload,
          {
            TTL: 86400, // 24 hours
            urgency: urgency, // "very-low", "low", "normal", or "high"
            contentEncoding: "aes128gcm"
          }
        );

        console.log(`✅ Delivered successfully to user ${user_id} (status: ${result.statusCode})`);
        delivered++;

      } catch (error: any) {
        console.error(`❌ Failed for user ${user_id}:`, error.message);
        failed++;
        errors.push({ id, user_id, error: error.message });

        // Remove invalid/expired subscriptions
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`🗑️ Removing invalid subscription ${id} for user ${user_id}`);
          await supabase.from("push_subscriptions").delete().eq("id", id);
        }
      }
    }

    // Log final results
    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`- Notification type: ${user_ids ? 'TARGETED' : 'BROADCAST'}`);
    console.log(`- Delivered: ${delivered}`);
    console.log(`- Failed: ${failed}`);
    console.log(`- Total subscriptions: ${subscriptions.length}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        delivered_to: delivered,
        failed: failed,
        total_subscriptions: subscriptions.length,
        notification_type: user_ids ? 'targeted' : 'broadcast',
        targeted_users: user_ids || null,
        errors: errors.length > 0 ? errors : undefined
      }), 
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ FATAL ERROR:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        type: error.name,
        stack: error.stack
      }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
