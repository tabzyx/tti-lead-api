export default async function handler(req, res) {
  // ✅ Allow CORS
  res.setHeader("Access-Control-Allow-Origin", "https://ttilabs.tabzyx.com")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // ✅ Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" })
  }

  const { fullName, email, industries, jobTitle, linkedin } = req.body

  // ✅ Basic validation
  if (!email || !industries || industries.length === 0) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // 🧠 Split Full Name → First & Last
  const nameParts = fullName ? fullName.trim().split(" ") : [];
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  // 🧩 Map industries → Brevo List IDs
  const industryToListMap = {
    Pharma: 8,
    Food: 9,
    Softlines: 2,
    Sustainability: 12
  };

  let listIds;

  // ✅ Handle "Subscribe to All"
  if (industries.includes("All")) {
    listIds = Object.values(industryToListMap);
  } else {
    listIds = industries
      .map(ind => industryToListMap[ind])
      .filter(Boolean);
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: firstName,
          LASTNAME: lastName,
          JOB_TITLE: jobTitle || ""
        },
        listIds: listIds,
        updateEnabled: true
      })
    });
    console.log("API KEY:", process.env.BREVO_API_KEY)
    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json(data);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    return res.status(500).json({ error: "Server error" });
  }
}
