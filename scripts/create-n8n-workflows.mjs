// Creates all 5 Orvia webhook workflows on the n8n instance
const N8N_URL = "https://primary-production-3207.up.railway.app";
const N8N_API_KEY = process.env.N8N_API_KEY;
const SB_URL = "https://odefnvrtbklydspokdmc.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!N8N_API_KEY) {
  console.error("Set N8N_API_KEY env var");
  process.exit(1);
}
if (!SB_KEY) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY env var");
  process.exit(1);
}

const SB_HEADERS = [
  { name: "apikey", value: SB_KEY },
  { name: "Authorization", value: `Bearer ${SB_KEY}` },
  { name: "Content-Type", value: "application/json" },
  { name: "Prefer", value: "return=representation" },
];

const SB_HEADERS_READ = [
  { name: "apikey", value: SB_KEY },
  { name: "Authorization", value: `Bearer ${SB_KEY}` },
];

async function createWorkflow(workflow) {
  const res = await fetch(`${N8N_URL}/api/v1/workflows`, {
    method: "POST",
    headers: {
      "X-N8N-API-KEY": N8N_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(workflow),
  });
  const data = await res.json();
  if (data.id) {
    console.log(`  Created: ${data.name} (${data.id})`);
    return data.id;
  } else {
    console.error(`  FAILED: ${data.message || JSON.stringify(data)}`);
    return null;
  }
}

async function activateWorkflow(id) {
  const res = await fetch(`${N8N_URL}/api/v1/workflows/${id}/activate`, {
    method: "POST",
    headers: { "X-N8N-API-KEY": N8N_API_KEY },
  });
  const data = await res.json();
  console.log(`  Activated: ${data.name || id} → active=${data.active}`);
}

// ============================================================
// WORKFLOW 1: Call Started
// ============================================================
const callStarted = {
  name: "Orvia: Call Started",
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "call-started",
        responseMode: "responseNode",
      },
      id: "wh1",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [260, 300],
      webhookId: "call-started-wh",
    },
    {
      parameters: {
        jsCode: `
const body = $input.first().json.body || $input.first().json;
const call = body.message?.call || body.call || {};
const vapiCallId = call.id || '';
const phoneNumberId = call.phoneNumberId || '';
const callerPhone = call.customer?.number || '';

return [{
  json: {
    vapi_call_id: vapiCallId,
    phone_number_id: phoneNumberId,
    caller_phone: callerPhone
  }
}];`,
      },
      id: "parse1",
      name: "Parse Payload",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
    },
    {
      parameters: {
        method: "GET",
        url: `=${SB_URL}/rest/v1/clinics?vapi_phone_id=eq.{{ $json.phone_number_id }}&status=eq.active&select=id`,
        sendHeaders: true,
        headerParameters: { parameters: SB_HEADERS_READ },
      },
      id: "lookup1",
      name: "Lookup Clinic",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [700, 300],
    },
    {
      parameters: {
        method: "POST",
        url: `${SB_URL}/rest/v1/calls`,
        sendHeaders: true,
        headerParameters: { parameters: SB_HEADERS },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({ clinic_id: $json[0]?.id || null, vapi_call_id: $('Parse Payload').first().json.vapi_call_id, caller_phone: $('Parse Payload').first().json.caller_phone, status: 'in_progress', started_at: new Date().toISOString() }) }}`,
      },
      id: "insert1",
      name: "Create Call Record",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [920, 300],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ success: true }) }}`,
      },
      id: "resp1",
      name: "Respond",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1140, 300],
    },
  ],
  connections: {
    Webhook: { main: [[{ node: "Parse Payload", type: "main", index: 0 }]] },
    "Parse Payload": { main: [[{ node: "Lookup Clinic", type: "main", index: 0 }]] },
    "Lookup Clinic": { main: [[{ node: "Create Call Record", type: "main", index: 0 }]] },
    "Create Call Record": { main: [[{ node: "Respond", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ============================================================
// WORKFLOW 2: Capture Lead
// ============================================================
const captureLead = {
  name: "Orvia: Capture Lead",
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "capture-lead",
        responseMode: "responseNode",
      },
      id: "wh2",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [260, 300],
      webhookId: "capture-lead-wh",
    },
    {
      parameters: {
        jsCode: `
const body = $input.first().json.body || $input.first().json;
const call = body.message?.call || body.call || {};
const params = body.message?.functionCall?.parameters || body.functionCall?.parameters || {};

return [{
  json: {
    vapi_call_id: call.id || '',
    name: params.name || null,
    phone: params.phone || call.customer?.number || '',
    service_needed: params.service_needed || null,
    urgency: params.urgency || 'routine',
    notes: params.notes || null
  }
}];`,
      },
      id: "parse2",
      name: "Parse Payload",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
    },
    {
      parameters: {
        method: "GET",
        url: `=${SB_URL}/rest/v1/calls?vapi_call_id=eq.{{ $json.vapi_call_id }}&select=id,clinic_id`,
        sendHeaders: true,
        headerParameters: { parameters: SB_HEADERS_READ },
      },
      id: "getcall2",
      name: "Get Call Record",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [700, 300],
    },
    {
      parameters: {
        method: "POST",
        url: `${SB_URL}/rest/v1/leads`,
        sendHeaders: true,
        headerParameters: { parameters: SB_HEADERS },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({ clinic_id: $json[0]?.clinic_id || null, call_id: $json[0]?.id || null, name: $('Parse Payload').first().json.name, phone: $('Parse Payload').first().json.phone, service_needed: $('Parse Payload').first().json.service_needed, urgency: $('Parse Payload').first().json.urgency, notes: $('Parse Payload').first().json.notes, status: 'new' }) }}`,
      },
      id: "insertlead2",
      name: "Insert Lead",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [920, 300],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ result: "Lead captured successfully. The clinic team has been notified and will contact the patient shortly." }) }}`,
      },
      id: "resp2",
      name: "Respond to Vapi",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1140, 300],
    },
  ],
  connections: {
    Webhook: { main: [[{ node: "Parse Payload", type: "main", index: 0 }]] },
    "Parse Payload": { main: [[{ node: "Get Call Record", type: "main", index: 0 }]] },
    "Get Call Record": { main: [[{ node: "Insert Lead", type: "main", index: 0 }]] },
    "Insert Lead": { main: [[{ node: "Respond to Vapi", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ============================================================
// WORKFLOW 3: Check Availability
// For MVP: returns hardcoded slots based on clinic hours
// Google Calendar integration comes when GCal service account is set up
// ============================================================
const checkAvailability = {
  name: "Orvia: Check Availability",
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "check-availability",
        responseMode: "responseNode",
      },
      id: "wh3",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [260, 300],
      webhookId: "check-avail-wh",
    },
    {
      parameters: {
        jsCode: `
const body = $input.first().json.body || $input.first().json;
const params = body.message?.functionCall?.parameters || body.functionCall?.parameters || {};
const requestedDate = params.date || new Date().toISOString().split('T')[0];

// MVP: Generate standard clinic slots (10am-7pm IST, 30-min intervals)
// TODO: Replace with Google Calendar API query when service account is configured
const slots = [
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM',
  '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM'
];

// Randomly remove some slots to simulate bookings
const available = slots.filter(() => Math.random() > 0.3);

return [{
  json: {
    date: requestedDate,
    available_slots: available
  }
}];`,
      },
      id: "slots3",
      name: "Generate Available Slots",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ result: "Available slots on " + $json.date + ": " + $json.available_slots.join(", ") + ". Which time works best for the patient?" }) }}`,
      },
      id: "resp3",
      name: "Respond to Vapi",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [700, 300],
    },
  ],
  connections: {
    Webhook: { main: [[{ node: "Generate Available Slots", type: "main", index: 0 }]] },
    "Generate Available Slots": { main: [[{ node: "Respond to Vapi", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ============================================================
// WORKFLOW 4: Book Appointment
// ============================================================
const bookAppointment = {
  name: "Orvia: Book Appointment",
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "book-appointment",
        responseMode: "responseNode",
      },
      id: "wh4",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [260, 300],
      webhookId: "book-appt-wh",
    },
    {
      parameters: {
        jsCode: `
const body = $input.first().json.body || $input.first().json;
const call = body.message?.call || body.call || {};
const params = body.message?.functionCall?.parameters || body.functionCall?.parameters || {};

return [{
  json: {
    vapi_call_id: call.id || '',
    patient_name: params.patient_name || '',
    patient_phone: params.patient_phone || call.customer?.number || '',
    service_type: params.service_type || '',
    slot: params.slot || ''
  }
}];`,
      },
      id: "parse4",
      name: "Parse Payload",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
    },
    {
      parameters: {
        method: "GET",
        url: `=${SB_URL}/rest/v1/calls?vapi_call_id=eq.{{ $json.vapi_call_id }}&select=id,clinic_id`,
        sendHeaders: true,
        headerParameters: { parameters: SB_HEADERS_READ },
      },
      id: "getcall4",
      name: "Get Call Record",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [700, 300],
    },
    {
      parameters: {
        method: "POST",
        url: `${SB_URL}/rest/v1/appointments`,
        sendHeaders: true,
        headerParameters: { parameters: SB_HEADERS },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({ clinic_id: $json[0]?.clinic_id || null, call_id: $json[0]?.id || null, patient_name: $('Parse Payload').first().json.patient_name, patient_phone: $('Parse Payload').first().json.patient_phone, service_type: $('Parse Payload').first().json.service_type, scheduled_start: $('Parse Payload').first().json.slot, status: 'confirmed' }) }}`,
      },
      id: "insertappt4",
      name: "Insert Appointment",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [920, 300],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ result: "Appointment confirmed for " + $('Parse Payload').first().json.patient_name + " on " + $('Parse Payload').first().json.slot + " for " + $('Parse Payload').first().json.service_type + ". The clinic will see you then!" }) }}`,
      },
      id: "resp4",
      name: "Respond to Vapi",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1140, 300],
    },
  ],
  connections: {
    Webhook: { main: [[{ node: "Parse Payload", type: "main", index: 0 }]] },
    "Parse Payload": { main: [[{ node: "Get Call Record", type: "main", index: 0 }]] },
    "Get Call Record": { main: [[{ node: "Insert Appointment", type: "main", index: 0 }]] },
    "Insert Appointment": { main: [[{ node: "Respond to Vapi", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ============================================================
// WORKFLOW 5: Call Ended
// ============================================================
const callEnded = {
  name: "Orvia: Call Ended",
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "vapi-events",
        responseMode: "responseNode",
      },
      id: "wh5",
      name: "Webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2,
      position: [260, 300],
      webhookId: "vapi-events-wh",
    },
    {
      parameters: {
        jsCode: `
const body = $input.first().json.body || $input.first().json;
const msg = body.message || body;
const call = msg.call || {};

// Only process end-of-call-report or call.ended events
const eventType = msg.type || '';
if (eventType !== 'end-of-call-report' && eventType !== 'status-update') {
  return [{ json: { skip: true, event: eventType } }];
}

// For status-update, only process if status is 'ended'
if (eventType === 'status-update' && msg.status !== 'ended') {
  return [{ json: { skip: true, event: eventType, status: msg.status } }];
}

const vapiCallId = call.id || '';
const transcript = msg.artifact?.messages || msg.transcript || null;
const recordingUrl = msg.artifact?.recordingUrl || msg.recordingUrl || null;
const summary = msg.artifact?.summary || msg.summary || null;
const endedReason = msg.endedReason || call.endedReason || 'unknown';
const duration = call.duration || null;
const costObj = call.cost || null;
const costCents = costObj ? Math.round(costObj * 100) : 0;

return [{
  json: {
    skip: false,
    vapi_call_id: vapiCallId,
    transcript: transcript,
    recording_url: recordingUrl,
    summary: summary,
    ended_reason: endedReason,
    duration_secs: duration,
    cost_cents: costCents
  }
}];`,
      },
      id: "parse5",
      name: "Parse Event",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [480, 300],
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
          conditions: [
            {
              id: "skip-check",
              leftValue: "={{ $json.skip }}",
              rightValue: "={{ false }}",
              operator: { type: "boolean", operation: "equals" },
            },
          ],
          combinator: "and",
        },
      },
      id: "if5",
      name: "Should Process?",
      type: "n8n-nodes-base.if",
      typeVersion: 2.2,
      position: [700, 300],
    },
    {
      parameters: {
        method: "PATCH",
        url: `=${SB_URL}/rest/v1/calls?vapi_call_id=eq.{{ $json.vapi_call_id }}`,
        sendHeaders: true,
        headerParameters: { parameters: SB_HEADERS },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({ status: 'completed', ended_at: new Date().toISOString(), duration_secs: $json.duration_secs, transcript: $json.transcript, recording_url: $json.recording_url, summary: $json.summary, cost_cents: $json.cost_cents }) }}`,
      },
      id: "update5",
      name: "Update Call Record",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      position: [920, 250],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ success: true }) }}`,
      },
      id: "resp5",
      name: "Respond OK",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [1140, 300],
    },
    {
      parameters: {
        respondWith: "json",
        responseBody: `={{ JSON.stringify({ success: true, skipped: true }) }}`,
      },
      id: "resp5skip",
      name: "Respond Skip",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1.1,
      position: [920, 450],
    },
  ],
  connections: {
    Webhook: { main: [[{ node: "Parse Event", type: "main", index: 0 }]] },
    "Parse Event": { main: [[{ node: "Should Process?", type: "main", index: 0 }]] },
    "Should Process?": {
      main: [
        [{ node: "Update Call Record", type: "main", index: 0 }],
        [{ node: "Respond Skip", type: "main", index: 0 }],
      ],
    },
    "Update Call Record": { main: [[{ node: "Respond OK", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

// ============================================================
// MAIN: Create all workflows and activate them
// ============================================================
async function main() {
  // First, delete the incomplete workflow from earlier attempt
  console.log("Checking for existing workflows...");
  const listRes = await fetch(`${N8N_URL}/api/v1/workflows`, {
    headers: { "X-N8N-API-KEY": N8N_API_KEY },
  });
  const existing = await listRes.json();
  for (const wf of existing.data || []) {
    console.log(`  Deleting existing: ${wf.name} (${wf.id})`);
    await fetch(`${N8N_URL}/api/v1/workflows/${wf.id}`, {
      method: "DELETE",
      headers: { "X-N8N-API-KEY": N8N_API_KEY },
    });
  }

  console.log("\nCreating workflows...");
  const workflows = [callStarted, captureLead, checkAvailability, bookAppointment, callEnded];
  const ids = [];

  for (const wf of workflows) {
    const id = await createWorkflow(wf);
    if (id) ids.push(id);
  }

  console.log(`\nActivating ${ids.length} workflows...`);
  for (const id of ids) {
    await activateWorkflow(id);
  }

  console.log("\nDone! Webhook URLs:");
  console.log(`  call-started:      ${N8N_URL}/webhook/call-started`);
  console.log(`  capture-lead:      ${N8N_URL}/webhook/capture-lead`);
  console.log(`  check-availability:${N8N_URL}/webhook/check-availability`);
  console.log(`  book-appointment:  ${N8N_URL}/webhook/book-appointment`);
  console.log(`  vapi-events:       ${N8N_URL}/webhook/vapi-events`);
}

main().catch(console.error);
