const PAGE_TAG_MAP = {
  "textiles-apparel": "Textiles & Apparel",
  "leather-footwear": "Leather & Footwear",
  "petroleum": "Petroleum",
  "food-agri": "Food & Agri",
  "ppe": "PPE",
  "chemicals": "Chemicals",
  "pharma": "Pharma",
  "testing": "Testing",
  "inspection": "Inspection",
  "certification": "Certification",
  "sustainability": "Sustainability",
  "contact": "Contact",
};

async function odooCall(url, cookies, payload) {
  // ✅ FORCE kwargs ALWAYS
  if (!payload.params.kwargs) {
    payload.params.kwargs = {};
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (json.error) {
    console.error("❌ Odoo API Error:", json.error);
  }

  return json;
}

// 👇 Tag helper
async function getTagId(name, cookies) {
  try {
    const searchRes = await odooCall(
      `${process.env.ODOO_URL}/web/dataset/call_kw`,
      cookies,
      {
        jsonrpc: "2.0",
        params: {
          model: "crm.tag",
          method: "search_read",
          args: [[["name", "=", name]]],
          kwargs: { fields: ["id"], limit: 1 },
        },
      }
    );

    if (searchRes?.result?.length) {
      return searchRes.result[0].id;
    }

    // 🔥 CREATE TAG
    const createRes = await odooCall(
      `${process.env.ODOO_URL}/web/dataset/call_kw`,
      cookies,
      {
        jsonrpc: "2.0",
        params: {
          model: "crm.tag",
          method: "create",
          args: [{ name: name.trim() }],
        },
      }
    );

    if (createRes?.result) {
      return createRes.result;
    }

    console.error("❌ Tag create failed:", createRes);
    return null;
  } catch (err) {
    console.error("❌ Tag error:", name, err);
    return null;
  }
}

// 👇 Salesperson logic
function getSalespersonId(service) {
  if (service === "Inspection") return 2;
  if (service === "Testing") return 3;
  if (service === "Certification") return 4;
  return 2;
}

// 👇 Handler starts AFTER helpers
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

    // 🔥 IMPORTANT: extract cookies
const cookies = authRes.headers.get("set-cookie");

    async function getOrCreateContact(data, cookies) {
  const searchRes = await odooCall(
    `${process.env.ODOO_URL}/web/dataset/call_kw`,
    cookies,
    {
      jsonrpc: "2.0",
      params: {
        model: "res.partner",
        method: "search_read",
        args: [[["email", "=", data.email]]],
        kwargs: { fields: ["id"], limit: 1 },
      },
    }
  );

  if (searchRes.result.length) {
    return searchRes.result[0].id;
  }

  const createRes = await odooCall(
    `${process.env.ODOO_URL}/web/dataset/call_kw`,
    cookies,
    {
      jsonrpc: "2.0",
      params: {
        model: "res.partner",
        method: "create",
        args: [
          {
            name: data.full_name,
            email: data.email,
            phone: data.phone,
            company_name: data.company_name,
          },
        ],
      },
    }
  );
  console.log("🧪 Contact create response:", createRes);
      if (!createRes?.result) {
  console.error("❌ Contact creation failed:", createRes);
  return null;
}else { return createRes.result;}
}
    
const uid = authData?.result?.uid;

if (!uid) {
  console.error("❌ Odoo auth failed", authData);
} else {
  console.log("✅ Odoo authenticated");

  const pageTag =
  PAGE_TAG_MAP[data.page?.toLowerCase()] ||
  data.page?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  
const rawTags = [
  "Website",
  pageTag,
  data.service_required,
];

const tagIds = [];

for (const tag of rawTags) {
  if (!tag) continue;

  const cleanTag = tag.trim();

  if (!cleanTag) continue;

  const id = await getTagId(cleanTag, cookies);

  if (id) {
    tagIds.push(id);
  } else {
    console.warn("⚠️ Invalid tag skipped:", cleanTag);
  }
}

console.log("🧪 FINAL TAG IDS:", tagIds);

const partnerId = await getOrCreateContact(data, cookies);
const userId = getSalespersonId(data.service_required);

  if (!partnerId) {
  console.error("❌ Invalid partnerId");
}

  // 🚀 Create Lead in CRM
  const leadRes = await fetch(`${process.env.ODOO_URL}/web/dataset/call_kw`, {
    method: "POST",
      headers: {
    "Content-Type": "application/json",
    Cookie: cookies, // 🔥 THIS FIXES EVERYTHING
  },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(), // or any unique number
      params: {
        model: "crm.lead",
        method: "create",
        args: [
          {
  name: `${data.service_required} Inquiry – ${data.full_name} (${data.company_name})`,
  contact_name: data.full_name,
  partner_id: partnerId,
  email_from: data.email,
  phone: data.phone,

  description: `
Service: ${data.service_required}
Company: ${data.company_name}
Name: ${data.full_name}

Message:
${data.inquiry}

Source Page: ${data.page}
  `,
  priority: priority === "high" ? "3" : priority === "medium" ? "2" : "1",
  user_id: userId,
  tag_ids: tagIds.length ? [[6, 0, tagIds]] : [],
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
