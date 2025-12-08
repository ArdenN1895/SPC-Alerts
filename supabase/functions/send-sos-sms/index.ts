// supabase/functions/send-sos-sms/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const TOKEN = Deno.env.get("PHILSMS_API_TOKEN")!;

serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { to, message } = await req.json();

    // — Phone formatting —
    let phone = to.replace(/\D/g, "");
    if (phone.startsWith("09")) phone = "63" + phone.slice(1);
    if (phone.startsWith("9") && phone.length === 10) phone = "63" + phone;
    phone = "+" + phone;
    if (!/^\+639\d{9}$/.test(phone)) throw new Error("Invalid number: " + phone);

    // — THIS IS THE ONLY COMBINATION THAT WORKS WITHOUT APPROVAL —
    const payload = {
      recipient: phone,
      sender_id: "PhilSMS",      // ← Must be exactly this (all caps)
      type: "plain",
      message: message.trim(),
    };

    console.log("Sending →", phone);

    const res = await fetch("https://dashboard.philsms.com/api/v3/sms/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log("PhilSMS Raw Response:", text);

    const json = JSON.parse(text);

    if (res.ok && json.status === "success") {
      return new Response(JSON.stringify({ success: true, messageId: json.data?.id }), {
        headers: { "Content-Type": "application/json", ...cors },
      });
    } else {
      throw new Error(json.message || json.error || text);
    }
  } catch (err: any) {
    console.error("Final error:", err.message);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { "Content-Type": "application/json", ...cors },
    });
  }
});