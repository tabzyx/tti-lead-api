export default async function handler(req, res) {
  try {
    // ✅ Allow browser testing
    if (req.method === "GET") {
      return res.status(200).json({ message: "API is working ✅" });
    }

    // ✅ Only POST allowed
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Only POST allowed" });
    }

    const data = req.body || {};

    // 🔍 Extract headers safely
    const userAgent = req.headers?.["user-agent"] || "unknown";
    const referer = req.headers?.["referer"] || "";
    const ip =
      req.headers?.["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "unknown";

    // 🔍 Extract UTM params
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
    } catch (e) {
      utm = {};
    }

    // 🧠 Email type detection
    const email = data.email || "";
    const email_type =
      email.includes("gmail.com") ||
      email.includes("yahoo.com") ||
      email.includes("hotmail.com")
        ? "personal"
        : "business";

    // 🧠 Lead Scoring (based on your current form)
    let score = 0;

    if (email_type === "business") score += 20;
    if (data.company_name) score += 10;
    if (data.job_title) score += 5;

    if (data.service_required === "certification") score += 30;
    if (data.service_required === "testing") score += 20;

    if (data.inquiry && data.inquiry.length > 30) score += 10;

    // Priority
    let priority = "low";
    if (score >= 50) priority = "high";
    else if (score >= 30) priority = "medium";

    // 📦 Final Payload
    const payload = {
      full_name: data.full_name || "",
      email: email.toLowerCase(),
      phone: data.phone || "",
      company_name: data.company_name || "",
      job_title: data.job_title || "",
      country: data.country || "",
      service_required: data.service_required || "",
      inquiry: data.inquiry || "",

      // intelligence
      email_type,
      lead_score: score,
      priority,

      // tracking
      user_agent: userAgent,
      ip_address: ip,
      source_page: data.page || referer || "unknown",
      ...utm,

      created_at: new Date().toISOString(),
    };

    console.log("✅ Lead received:", payload);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ ERROR:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
