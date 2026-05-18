// scripts/seed-dev-data.mjs
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log("Creating test clinic...");

  const { data: clinic, error: clinicErr } = await supabase
    .from("clinics")
    .upsert(
      {
        slug: "dr-demo-dental",
        name: "Dr. Demo's Dental Clinic",
        phone_display: "+919876543210",
        timezone: "Asia/Kolkata",
        status: "active",
        settings: {
          greeting:
            "Namaste! Dr. Demo's Dental Clinic mein aapka swagat hai.",
          hours: "10am-7pm Mon-Sat",
          services: [
            "Cleaning",
            "Filling",
            "Root Canal",
            "Extraction",
            "Braces",
            "Cosmetic",
          ],
          languages: ["hi", "en"],
          emergency_number: "+919876543210",
          transfer_number: "+919876543210",
        },
      },
      { onConflict: "slug" }
    )
    .select()
    .single();

  if (clinicErr) {
    console.error("Clinic creation failed:", clinicErr);
    process.exit(1);
  }

  console.log("Clinic created:", clinic.id);

  // Create auth user
  const testEmail = "demo@orvia.dev";
  const testPassword = "demo1234";

  const { data: authUser, error: authErr } =
    await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

  if (authErr && !authErr.message.includes("already been registered")) {
    console.error("Auth user creation failed:", authErr);
    process.exit(1);
  }

  const userId =
    authUser?.user?.id ??
    (
      await supabase.auth.admin.listUsers().then((r) =>
        r.data.users.find((u) => u.email === testEmail)
      )
    )?.id;

  if (!userId) {
    console.error("Could not get user ID");
    process.exit(1);
  }

  // Link user to clinic
  const { error: userErr } = await supabase.from("users").upsert(
    {
      id: userId,
      clinic_id: clinic.id,
      email: testEmail,
      full_name: "Dr. Demo",
      role: "owner",
    },
    { onConflict: "id" }
  );

  if (userErr) {
    console.error("User link failed:", userErr);
    process.exit(1);
  }

  // Seed some calls
  const callOutcomes = [
    "appointment_booked",
    "lead_captured",
    "info_given",
    "transferred",
    null,
  ];

  for (let i = 0; i < 8; i++) {
    const startedAt = new Date(
      Date.now() - i * 3600000 - Math.random() * 1800000
    );
    const duration = Math.floor(60 + Math.random() * 240);
    const endedAt = new Date(startedAt.getTime() + duration * 1000);
    const outcome = callOutcomes[i % callOutcomes.length];

    await supabase.from("calls").insert({
      clinic_id: clinic.id,
      vapi_call_id: `demo_call_${Date.now()}_${i}`,
      caller_phone: `+9198765${String(43210 + i).slice(-5)}`,
      language_detected: i % 3 === 0 ? "hi" : "en",
      status: "completed",
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_secs: duration,
      summary: [
        "Patient called about tooth pain, needs emergency appointment.",
        "Patient inquired about teeth cleaning, appointment booked for Thursday.",
        "Patient asked about clinic hours and services available.",
        "Patient transferred to clinic for braces consultation.",
        "Patient called about root canal pricing.",
        "Patient needs extraction, urgent appointment requested.",
        "Follow-up call about ongoing treatment.",
        "New patient inquiry about cosmetic dentistry.",
      ][i],
      outcome,
      transcript: [
        {
          role: "assistant",
          content: "Namaste! Dr. Demo's Dental Clinic mein aapka swagat hai.",
        },
        { role: "user", content: "Mujhe appointment chahiye." },
        {
          role: "assistant",
          content: "Bilkul! Kya service chahiye aapko?",
        },
        { role: "user", content: "Tooth pain hai, urgent hai." },
      ],
      cost_cents: Math.floor(10 + Math.random() * 30),
    });
  }

  // Seed some leads
  for (let i = 0; i < 3; i++) {
    await supabase.from("leads").insert({
      clinic_id: clinic.id,
      name: ["Rahul Sharma", "Priya Patel", "Amit Kumar"][i],
      phone: `+9198765${String(43215 + i).slice(-5)}`,
      service_needed: ["Tooth pain", "Cleaning", "Braces consultation"][i],
      urgency: ["urgent", "routine", "inquiry"][i],
      status: "new",
    });
  }

  // Seed an appointment
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 30, 0, 0);

  await supabase.from("appointments").insert({
    clinic_id: clinic.id,
    patient_name: "Priya Patel",
    patient_phone: "+919876543216",
    service_type: "Cleaning",
    scheduled_start: tomorrow.toISOString(),
    status: "confirmed",
  });

  console.log("\nSeed complete!");
  console.log(`Login: ${testEmail} / ${testPassword}`);
  console.log(`Clinic: ${clinic.name} (${clinic.id})`);
  console.log("8 calls, 3 leads, 1 appointment seeded.");
}

seed().catch(console.error);
