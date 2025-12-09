// supabase/functions/send-push/index.ts
// FIXED VERSION: Enhanced logging, error handling, and mobile compatibility

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// Helper to log with timestamps
function log(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}

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

  log("📬 ===== PUSH NOTIFICATION REQUEST =====");

  try {
    // Get environment variables
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Detailed environment check
    log("🔍 Environment Check:", {
      vapidPublic: vapidPublic ? `${vapidPublic.substring(0, 20)}...` : "MISSING",
      vapidPrivate: vapidPrivate ? "SET" : "MISSING",
      supabaseUrl: supabaseUrl || "MISSING",
      supabaseKey: supabaseKey ? "SET" : "MISSING"
    });

    if (!vapidPublic || !vapidPrivate) {
      const error = "VAPID keys not configured in environment";
      log("❌ " + error);
      return new Response(
        JSON.stringify({ 
          error,
          hint: "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Supabase Edge Function secrets"
        }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!supabaseUrl || !supabaseKey) {
      const error = "Supabase configuration missing";
      log("❌ " + error);
      return new Response(
        JSON.stringify({ error }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Configure web-push
    webpush.setVapidDetails(
      "mailto:admin@spcalerts.com",
      vapidPublic,
      vapidPrivate
    );
    log("✅ Web-push configured with VAPID keys");

    // Parse request body
    let requestData;
    try {
      requestData = await req.json();
      log("📦 Request body:", requestData);
    } catch (parseError) {
      log("❌ Failed to parse request body:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { 
      title, 
      body, 
      icon,
      badge,
      image, 
      url,
      data,
      urgency = "normal",
      user_ids
    } = requestData;

    // Validate required fields
    if (!title || !body) {
      log("❌ Missing required fields");
      return new Response(
        JSON.stringify({ error: "title and body are required" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`📨 Notification: "${title}" - "${body}"`);
    
    // Determine notification type
    const isTargeted = user_ids && Array.isArray(user_ids) && user_ids.length > 0;
    if (isTargeted) {
      log(`🎯 TARGETED to ${user_ids.length} user(s):`, user_ids);
    } else {
      log("📢 BROADCAST to ALL users");
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    log("✅ Supabase client created");
    
    // Fetch subscriptions
    log("🔍 Fetching subscriptions...");
    let query = supabase
      .from("push_subscriptions")
      .select("id, user_id, subscription");
    
    if (isTargeted) {
      query = query.in('user_id', user_ids);
    }

    const { data: subscriptions, error: fetchError } = await query;

    if (fetchError) {
      log("❌ Database fetch error:", fetchError);
      return new Response(
        JSON.stringify({ 
          error: `Database error: ${fetchError.message}`,
          details: fetchError
        }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(`📊 Found ${subscriptions?.length || 0} subscription(s)`);

    if (!subscriptions || subscriptions.length === 0) {
      const message = isTargeted
        ? `No subscribers found for users: ${user_ids?.join(', ')}`
        : "No subscribers in the system";
      
      log("⚠️ " + message);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          delivered_to: 0, 
          failed: 0,
          message,
          notification_type: isTargeted ? 'targeted' : 'broadcast',
          targeted_users: user_ids || null,
          hint: "Users need to enable notifications in the app"
        }), 
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the origin from request or use default
    const origin = req.headers.get('origin') || 'https://spc-alerts.vercel.app';
    
    // Prepare notification payload with absolute URLs
    const notificationPayload = JSON.stringify({ 
      title, 
      body, 
      icon: icon || `${origin}/public/img/icon-192.png`,
      badge: badge || `${origin}/public/img/badge-72.png`,
      image: image ? (image.startsWith('http') ? image : `${origin}${image}`) : undefined,
      url: url || `${origin}/public/html/index.html`,
      data: {
        ...(data || {}),
        timestamp: Date.now(),
        notificationType: isTargeted ? 'targeted' : 'broadcast'
      },
      tag: `spc-alert-${Date.now()}`,
      requireInteraction: urgency === 'high',
      // Mobile-specific options
      vibrate: [200, 100, 200],
      silent: false,
      renotify: true
    });

    log("📤 Notification payload prepared:", JSON.parse(notificationPayload));

    let delivered = 0;
    let failed = 0;
    const errors: Array<{id: string, user_id: string, error: string, statusCode?: number}> = [];

    // Send notifications concurrently
    log(`🚀 Sending to ${subscriptions.length} subscription(s)...`);
    
    const sendPromises = subscriptions.map(({ id, user_id, subscription }) => (async () => {
      try {
        // Parse subscription if it's a string
        const sub = typeof subscription === 'string' 
          ? JSON.parse(subscription) 
          : subscription;
        
        log(`📤 Sending to user ${user_id} (subscription ${id})`);
        
        // Validate subscription structure
        if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
          throw new Error("Invalid subscription structure");
        }
        
        // Send the notification
        const result = await webpush.sendNotification(
          sub,
          notificationPayload,
          {
            TTL: 86400, // 24 hours
            urgency: urgency,
            contentEncoding: "aes128gcm"
          }
        );
        
        delivered++;
        log(`✅ Delivered to user ${user_id}`);

      } catch (error: any) {
        failed++;
        const statusCode = error.statusCode || error.status;
        const errorMessage = error.message || String(error);
        
        log(`❌ Failed for user ${user_id}:`, {
          message: errorMessage,
          statusCode,
          body: error.body
        });
        
        errors.push({ 
          id, 
          user_id, 
          error: errorMessage,
          statusCode
        });

        // Remove invalid/expired subscriptions
        if (statusCode === 410 || statusCode === 404) {
          log(`🗑️ Removing invalid subscription ${id} for user ${user_id}`);
          try {
            await supabase.from("push_subscriptions").delete().eq("id", id);
            log(`✅ Subscription ${id} deleted`);
          } catch (deleteError) {
            log(`⚠️ Failed to delete subscription ${id}:`, deleteError);
          }
        }
      }
    })());

    // Wait for all to complete
    await Promise.allSettled(sendPromises);

    // Log final results
    log("📊 FINAL RESULTS:", {
      notificationType: isTargeted ? 'TARGETED' : 'BROADCAST',
      delivered,
      failed,
      totalSubscriptions: subscriptions.length,
      successRate: `${((delivered / subscriptions.length) * 100).toFixed(1)}%`
    });

    if (errors.length > 0) {
      log("⚠️ Errors encountered:", errors);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        delivered_to: delivered,
        failed,
        total_subscriptions: subscriptions.length,
        notification_type: isTargeted ? 'targeted' : 'broadcast',
        targeted_users: user_ids || null,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString()
      }), 
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    log("❌ FATAL ERROR:", {
      message: error.message,
      type: error.name,
      stack: error.stack
    });
    
    return new Response(
      JSON.stringify({ 
        error: error.message || "Unknown error",
        type: error.name,
        timestamp: new Date().toISOString()
      }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
