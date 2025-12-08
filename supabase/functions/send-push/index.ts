// supabase/functions/send-push/index.ts
// UNIFIED VERSION: Handles both targeted (user_ids) and broadcast (all users) notifications
// FIX: Refactored to use Promise.allSettled() for concurrent sending to prevent Edge Function timeout on broadcast.

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

  console.log("📬 ===== PUSH NOTIFICATION REQUEST (CONCURRENT) =====");

  try {
    // Get environment variables
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!vapidPublic || !vapidPrivate) {
      console.error("❌ VAPID keys not configured");
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
    const isTargeted = user_ids && Array.isArray(user_ids) && user_ids.length > 0;
    if (isTargeted) {
      console.log(`🎯 TARGETED notification to ${user_ids.length} specific user(s)`);
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
    
    // Fetch subscriptions
    let query = supabase.from("push_subscriptions").select("id, user_id, subscription");
    
    if (isTargeted) {
      // TARGETED: Only fetch subscriptions for specified users
      query = query.in('user_id', user_ids);
    }
    // If not targeted, fetch ALL subscriptions (broadcast)

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
      const message = isTargeted
        ? `No subscribers found for specified users: ${user_ids.join(', ')}`
        : "No subscribers found in the system";
      
      console.log("⚠️", message);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          delivered_to: 0, 
          message,
          notification_type: isTargeted ? 'targeted' : 'broadcast',
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

    // ==========================================================
    // 💡 FIX: Use Promise.allSettled() for concurrent sending
    // ==========================================================
    const sendPromises = subscriptions.map(({ id, user_id, subscription }) => (async () => {
      try {
        // Parse subscription if it's a string
        const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;
        
        // Send the notification
        await webpush.sendNotification(
          sub,
          notificationPayload,
          {
            TTL: 86400, // 24 hours
            urgency: urgency,
            contentEncoding: "aes128gcm"
          }
        );
        
        // Update shared counter (acceptable in this pattern)
        delivered++; 

      } catch (error: any) {
        console.error(`❌ Failed for user ${user_id}:`, error.message);
        failed++;
        errors.push({ id, user_id, error: error.message });

        // Remove invalid/expired subscriptions
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`🗑️ Removing invalid subscription ${id} for user ${user_id}`);
          // Await the deletion to ensure database cleanup happens
          await supabase.from("push_subscriptions").delete().eq("id", id);
        }
      }
    })());

    // Wait for ALL promises (notification attempts) to settle
    await Promise.allSettled(sendPromises);

    // ==========================================================

    // Log final results
    console.log(`\n📊 FINAL RESULTS:`);
    console.log(`- Notification type: ${isTargeted ? 'TARGETED' : 'BROADCAST'}`);
    console.log(`- Delivered: ${delivered}`);
    console.log(`- Failed: ${failed}`);
    console.log(`- Total subscriptions: ${subscriptions.length}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        delivered_to: delivered,
        failed: failed,
        total_subscriptions: subscriptions.length,
        notification_type: isTargeted ? 'targeted' : 'broadcast',
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
