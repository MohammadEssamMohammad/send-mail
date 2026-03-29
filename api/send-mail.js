import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { email } = body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const { data, error } = await resend.emails.send({
      from: "onboarding@resend.dev", // replace with your verified domain in production
      to: email,
      subject: "Welcome 🎉",
      html: `
        <h2>Welcome 🎉</h2>
        <p>Thanks for registering!</p>
        <p>Glad to have you onboard 🚀</p>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(500).json({ message: "Failed to send email", error });
    }

    return res.status(200).json({ message: "Email sent successfully", data });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ message: "Error sending email", error: error.message });
  }
}