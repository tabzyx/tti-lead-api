const PAGE_TAG_MAP = {
  "textiles-apparel": "Textiles & Apparel",
  "leather-footwear": "Leather & Footwear",
  "petroleum": "Petroleum",
  "food-agri": "Food & Agriculture",
  "ppe": "PPE",
  "pharma": "Pharmaceutical",
  "testing": "Testing",
  "inspection": "Inspection",
  "certification": "Certification",
  "compliance": "Compliance",
  "sustainability": "Sustainability",
  "contact": "Contact",
};

const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "mail.com",
  "gmx.com",
  "yandex.com",
]);

const BROCHURE_DOWNLOAD_LINK_MAP = {
  "testing": "https://drive.google.com/file/d/1o5rVhjfGDxVy4M82Fu-8sAsJ9hQlgeIh/view",
  "inspection": "",
  "certification": "",
  "compliance": "",
  "sustainability": "https://drive.google.com/file/d/17HReJQ1dsq0_xeikws-BepblJ1LZ4alz/view",
  "zdhc": "https://drive.google.com/file/d/1HHD-CDGf7YOvPl1yVXQ5Axdpq2N5F8Ok/view",
  "pfas": "https://drive.google.com/file/d/10fo5LNIp1_GOlX-Tnu_Cfi9frwT6CqKc/view",
};

function getBrochureDownloadLink(brochureType) {
  const key = String(brochureType || "").toLowerCase().trim();
  return BROCHURE_DOWNLOAD_LINK_MAP[key] || "";
}

function getEmailType(email) {
  const domain =
    String(email || "")
      .toLowerCase()
      .trim()
      .split("@")[1] || "";

  return PERSONAL_EMAIL_DOMAINS.has(domain) ? "personal" : "business";
}

function normalizeLeadData(data, referer) {
  const brochureType = String(data.brochure_type || "").trim();
  const requestType = String(data.request_type || "").trim();
  const serviceRequired = String(data.service_required || "").trim();
  const page = String(data.page || referer || "").trim();

  let inquiry = String(data.inquiry || "").trim();

  if (!inquiry && brochureType) {
    inquiry = `Brochure download request: ${brochureType}`;
  }

  let formType = "lead";

  if (brochureType) {
    formType = "brochure_download";
  } else if (page.toLowerCase() === "contact") {
    formType = "contact";
  }

  return {
    full_name: String(data.full_name || "").trim(),
    email: String(data.email || "").toLowerCase().trim(),
    phone: String(data.phone || "").trim(),
    company_name: String(data.company_name || "").trim(),
    job_title: String(data.job_title || "").trim(),
    country: String(data.Country || "").trim(),
    service_required: serviceRequired,
    inquiry,

    source_page: page,

    form_type: formType,
    brochure_type: brochureType,
    inquiry_type: requestType,
  };
}

const BREVO_BROCHURE_TEMPLATE_ID = 1;
const BREVO_INQUIRY_AUTORESPONDER_TEMPLATE_ID = 3;

function getAutoResponseTemplateId(lead, emailType) {
  if (lead.form_type === "brochure_download" && emailType === "business") {
    return BREVO_BROCHURE_TEMPLATE_ID;
  }

  return BREVO_INQUIRY_AUTORESPONDER_TEMPLATE_ID;
}

async function sendAutoResponseEmail(lead, emailType) {
  const templateId = getAutoResponseTemplateId(lead, emailType);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      templateId,
      to: [
        {
          email: lead.email,
          name: lead.full_name || lead.email,
        },
      ],
      params: {
        FULL_NAME: lead.full_name,
        EMAIL: lead.email,
        PHONE: lead.phone,
        COMPANY_NAME: lead.company_name,
        JOB_TITLE: lead.job_title,
        COUNTRY: lead.country,
        SERVICE_REQUIRED: lead.service_required,
        INQUIRY: lead.inquiry,
        REQUEST_TYPE: lead.inquiry_type,
        BROCHURE_TYPE: lead.brochure_type,
        SOURCE_PAGE: lead.source_page,
        DOWNLOAD_LINK: getBrochureDownloadLink(lead.brochure_type),
      },
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error("Brevo autoresponder error:", responseText);

    return {
      sent: false,
      reason: "brevo_error",
      details: responseText,
    };
  }

  console.log("Brevo autoresponder sent:", {
    email: lead.email,
    form_type: lead.form_type,
    brochure_type: lead.brochure_type,
    templateId,
  });

  return { sent: true, templateId };
}

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

    const rawData = req.body || {};

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

    const data = normalizeLeadData(rawData, referer);
    const email_type = getEmailType(data.email);

    console.log(data);

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
      email: data.email || "",
      phone: data.phone || "",
      company_name: data.company_name || "",
      job_title: data.job_title || "",
      country: data.country || "",
      service_required: data.service_required || "",
      inquiry: data.inquiry || "",

      email_type,
      lead_score: score,
      priority,

      source_page: data.source_page || "",
      ...utm,

      ip_address: ip,
      user_agent: userAgent,
      form_type: data.form_type || "",
      brochure_type: data.brochure_type || "",
      inquiry_type: data.inquiry_type || "",
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
  return res.status(400).json({
    success: false,
    error: "Lead could not be saved",
  });
}

console.log("✅ Insert successful");

let autoResponse;
try {
  autoResponse = await sendAutoResponseEmail(data, email_type);
} catch (brevoError) {
  console.error("❌ Brevo autoresponder failed:", brevoError);
  autoResponse = {
    sent: false,
    reason: "brevo_exception",
  };
}

if (data.form_type === "brochure_download") {
  return res.status(200).json({
    success: true,
    form_type: data.form_type,
    email_type,
    autoresponder: autoResponse,
    odoo_created: false,
  });
}

try {
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

const authText = await authRes.text();
let authData;

try {
  authData = JSON.parse(authText);
} catch (error) {
  console.error("❌ Odoo auth returned non-JSON:", authText);
  throw error;
}

    // 🔥 IMPORTANT: extract cookies
const cookies = authRes.headers.get("set-cookie");

async function getOrCreateCompany(data, cookies) {
  if (!data.company_name) return null;

  const searchRes = await odooCall(
    `${process.env.ODOO_URL}/web/dataset/call_kw`,
    cookies,
    {
      jsonrpc: "2.0",
      params: {
        model: "res.partner",
        method: "search_read",
        args: [[["name", "=", data.company_name], ["is_company", "=", true]]],
        kwargs: { fields: ["id"], limit: 1 },
      },
    }
  );

  if (searchRes.result?.length) {
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
            name: data.company_name,
            is_company: true, // ✅ FIXED
          },
        ],
        kwargs: {},
      },
    }
  );

  console.log("🧪 Company create response:", createRes);
      if (!createRes?.result) {
  console.error("❌ Company creation failed:", createRes);
  return null;
}else { return createRes.result;}
}

async function getOrCreateContact(data, cookies, companyId) {
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

  if (searchRes.result?.length) {
    return searchRes.result[0].id;
  }

  const website = data.email.includes("@")
    ? `https://${data.email.split("@")[1]}`
    : "";

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

  function: data.job_title || "", // ✅ Job title now works
  website: data.email?.includes("@")
    ? `https://${data.email.split("@")[1]}`
    : "",

  parent_id: companyId || false, // ✅ link to company
}
        ],
        kwargs: {},
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
  PAGE_TAG_MAP[data.source_page?.toLowerCase()] || data.source_page?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  
const rawTags = [
  "Website",
  pageTag,
  data.service_required,
  data.inquiry_type,
  data.form_type === "contact" ? "Contact Form" : "Lead Form",
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

const companyId = await getOrCreateCompany(data, cookies);
const partnerId = await getOrCreateContact(data, cookies, companyId);
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
<b>Service:</b> ${data.service_required}<br/>
<b>Company:</b> ${data.company_name}<br/>
<b>Name:</b> ${data.full_name}<br/>
<b>Email:</b> ${data.email}<br/>
<b>Phone:</b> ${data.phone}<br/><br/>

<b>Message:</b><br/>
${data.inquiry}<br/><br/>

<b>Source Page:</b> ${
  PAGE_TAG_MAP[data.source_page?.toLowerCase()] || data.source_page
}`,
  priority: priority === "high" ? "3" : priority === "medium" ? "2" : "1",
  user_id: userId,
  tag_ids: tagIds.length ? [[6, 0, tagIds]] : [],
          },
        ],
        kwargs: {},
      },
    }),
  });

  const leadText = await leadRes.text();
  let leadData;

  try {
    leadData = JSON.parse(leadText);
  } catch (error) {
    console.error("❌ Odoo lead create returned non-JSON:", leadText);
    throw error;
  }

  console.log("📈 Odoo Lead Created:", leadData);
}

 return res.status(200).json({ success: true });
} catch (odooError) {
  console.error("❌ Odoo flow failed:", odooError);

  return res.status(200).json({
    success: true,
    autoresponder: autoResponse,
    odoo_created: false,
    warning: "Lead saved, but Odoo sync failed",
  });
}
  } catch (error) {
    console.error("ERROR:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
