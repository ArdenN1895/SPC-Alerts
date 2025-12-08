// supabase/functions/send-push/index.ts
// FIXED: Only sends to specified user_ids, not all users

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { title, body, icon, badge, url, urgency, user_ids } = await req.json()

    // Validate that user_ids is provided and is an array
    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      console.error('❌ No user_ids provided or invalid format')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'user_ids must be provided as a non-empty array'
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('📤 Sending targeted push notification to users:', user_ids)

    // Fetch push subscriptions ONLY for specified users
    const { data: subscriptions, error } = await supabaseClient
      .from('push_subscriptions')
      .select('user_id, subscription')
      .in('user_id', user_ids)

    if (error) {
      console.error('❌ Database error:', error)
      throw error
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('⚠️ No subscriptions found for users:', user_ids)
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No push subscriptions found for specified users',
          delivered_to: 0,
          total_subscriptions: 0,
          requested_users: user_ids
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📬 Found ${subscriptions.length} subscription(s) for ${user_ids.length} user(s)`)

    const payload = JSON.stringify({
      title: title || 'Notification',
      body: body || '',
      icon: icon || '/img/icon-192.png',
      badge: badge || '/img/badge-72.png',
      url: url || '/',
      timestamp: Date.now(),
      tag: 'sos-status-update',
      requireInteraction: true,
      data: {
        url: url || '/',
        timestamp: Date.now()
      }
    })

    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')

    if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY) {
      throw new Error('VAPID keys not configured in environment')
    }

    let deliveredCount = 0
    let failedCount = 0
    const deliveryDetails: any[] = []

    // Send to all subscriptions for specified users
    const promises = subscriptions.map(async (sub) => {
      try {
        const subscription = sub.subscription
        
        console.log(`📨 Sending to user ${sub.user_id}...`)
        
        const response = await fetch(subscription.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'TTL': '86400',
            'Urgency': urgency || 'high',
          },
          body: payload,
        })

        if (response.ok) {
          console.log(`✅ Push sent successfully to user ${sub.user_id}`)
          deliveredCount++
          deliveryDetails.push({
            user_id: sub.user_id,
            status: 'delivered'
          })
        } else {
          const errorText = await response.text()
          console.error(`❌ Push failed for user ${sub.user_id}:`, response.status, errorText)
          failedCount++
          deliveryDetails.push({
            user_id: sub.user_id,
            status: 'failed',
            error: `HTTP ${response.status}: ${errorText}`
          })
        }
      } catch (error) {
        console.error(`❌ Error sending push to user ${sub.user_id}:`, error)
        failedCount++
        deliveryDetails.push({
          user_id: sub.user_id,
          status: 'failed',
          error: error.message
        })
      }
    })

    await Promise.all(promises)

    console.log(`📊 Results: ${deliveredCount} delivered, ${failedCount} failed out of ${subscriptions.length} total`)

    return new Response(
      JSON.stringify({ 
        success: deliveredCount > 0,
        delivered_to: deliveredCount,
        total_subscriptions: subscriptions.length,
        failed: failedCount,
        requested_users: user_ids,
        delivery_details: deliveryDetails
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Function error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})