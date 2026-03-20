module.exports = async function handler(req, res) {
  try {
   if (req.method === "GET") {
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
  console.log(
    "SUPABASE_KEY:",
    process.env.SUPABASE_KEY ? "EXISTS" : "MISSING"
  );

  return res.status(200).json({
    message: "API is working ✅",
  });
}

    if (req.method !== "POST") {
      return res.status(405).json({ message: "Only POST allowed" });
    }

    const data = req.body || {};

    console.log(data);

    const userAgent = req.headers?.["user-agent"] || "unknown";
    const referer = req.headers?.["referer"] || "";
    const ip =
      req.headers?.["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "unknown";

    // UTM parsing
    let utm = {};
    try {
      if (referer) {
        const url = new URL(referer);
        utm = {
          utm_source: url.searchParams.get("utm_source"),
          utm_medium: url.searchParams.get("utm_medium"),
          utm_campaign: url.searchParams.get("utm_campaign"),
        };
      }
    } catch (e) {}

    // Email type
    const email = data.email || "";
    const email_type =
      email.includes("gmail") || email.includes("yahoo")
        ? "personal"
        : "business";

    // Scoring
    let score = 0;
    if (email_type === "business") score += 20;
    if (data.company_name) score += 10;
    if (data.service_required === "Certification") score += 30;
    if (data.service_required === "Testing") score += 20;
    if (data.inquiry?.length > 30) score += 10;

    let priority = "low";
    if (score >= 50) priority = "high";
    else if (score >= 30) priority = "medium";

    const payload = {
      full_name: data.full_name || "",
      email: email.toLowerCase(),
      phone: data.phone || "",
      company_name: data.company_name || "",
      job_title: data.job_title || "",
      country: data.Country || "",
      service_required: data.service_required || "",
      inquiry: data.inquiry || "",

      email_type,
      lead_score: score,
      priority,

      source_page: data.page || referer,
      ...utm,

      ip_address: ip,
      user_agent: userAgent,
      created_at: new Date().toISOString(),
    };

    console.log("✅ Lead:", payload);

    // 🔥 Send to Supabase (REST API)
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/leads`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: process.env.SUPABASE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
    Prefer: "return=minimal", // keep this
  },
  body: JSON.stringify(payload),
});

// ✅ READ BODY ONLY ONCE
const text = await response.text();

if (!response.ok) {
  console.error("❌ Supabase error:", text);
} else {
  console.log("✅ Insert successful");
}
    // 🔐 Authenticate with Odoo
const authRes = await fetch(`${process.env.ODOO_URL}/web/session/authenticate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    params: {
      db: process.env.ODOO_DB,
      login: process.env.ODOO_USERNAME,
      password: process.env.ODOO_DB_PASSWORD,
    },
  }),
});

const authData = await authRes.json();
const uid = authData?.result?.uid;

if (!uid) {
  console.error("❌ Odoo auth failed", authData);
} else {
  console.log("✅ Odoo authenticated");

  // 🚀 Create Lead in CRM
  const leadRes = await fetch(`${process.env.ODOO_URL}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      params: {
        model: "crm.lead",
        method: "create",
        args: [
          {
            name: `${data.service_required} Inquiry`,
            contact_name: data.full_name,
            email_from: data.email,
            phone: data.phone,
            description: data.inquiry,
          },
        ],
        kwargs: {},
      },
    }),
  });

  const leadData = await leadRes.json();
  console.log("📈 Odoo Lead Created:", leadData);
}

 return res.status(200).json({ success: true });
  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
