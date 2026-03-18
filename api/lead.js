export default async function handler(req, res) {
  try {
    // Handle GET (browser test)
    if (req.method === "GET") {
      return res.status(200).json({ message: "API is working ✅" });
    }

    // Only allow POST
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Only POST allowed" });
    }

    const data = req.body || {};

    // Safe extraction (prevents crashes)
    const userAgent = req.headers?.["user-agent"] || "unknown";
    const referer = req.headers?.["referer"] || "";
    const ip =
      req.headers?.["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "unknown";

    // Safe URL parsing
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

    // Safe array cleaner
    const cleanArray = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === "string") return value.split(",");
      return [];
    };

    const payload = {
      ...data,
      target_market: cleanArray(data.target_market),
      standards: cleanArray(data.standards),
      user_agent: userAgent,
      ip_address: ip,
      source_page: referer,
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
