// Overview header copy. A fresh headline + subline on every visit, drawn from
// time-of-day and day-of-week pools plus lines built from the business's live
// numbers — hundreds of combinations, and never the same pairing twice in a
// row (the last one shown is remembered in localStorage).

export interface GreetingContext {
  firstName: string | null
  now: Date
  callsToday: number
  bookedToday: number
  leadsToday: number
  bookedThisWeek: number
  nextAppointment: { name: string; at: Date } | null
  actionCount: number
  agentLive: boolean
}

export interface Greeting {
  headline: string
  emoji: string // "wave" = the illustrated wave; anything else renders as text
  subline: string
}

type Line = [text: string, emoji: string]

const LATE_NIGHT: Line[] = [
  ["Burning the midnight oil, {name}?", "🌙"],
  ["Still up, {name}?", "🦉"],
  ["Night owl mode, {name}", "🦉"],
  ["Quiet hours, {name}", "🌙"],
  ["Hello from the night shift, {name}", "✨"],
  ["The world's asleep, {name}", "🌌"],
]
const MORNING: Line[] = [
  ["Good morning, {name}", "wave"],
  ["Morning, {name}", "☀️"],
  ["Rise and shine, {name}", "🌅"],
  ["Fresh start, {name}", "☀️"],
  ["Coffee's on, {name}", "☕"],
  ["Here's your morning, {name}", "wave"],
  ["Top of the morning, {name}", "🌤️"],
  ["Ready when you are, {name}", "wave"],
]
const AFTERNOON: Line[] = [
  ["Good afternoon, {name}", "wave"],
  ["Afternoon, {name}", "🌤️"],
  ["Hope lunch was good, {name}", "🥪"],
  ["Halfway through the day, {name}", "⏳"],
  ["Afternoon check-in, {name}", "wave"],
  ["Welcome back, {name}", "wave"],
]
const EVENING: Line[] = [
  ["Good evening, {name}", "wave"],
  ["Evening, {name}", "🌆"],
  ["Winding down, {name}?", "🌇"],
  ["Here's how today went, {name}", "📊"],
  ["Nice work today, {name}", "🙌"],
  ["Almost a wrap, {name}", "🌆"],
]
const WEEKDAY: Record<number, Line[]> = {
  1: [["Fresh week, {name}", "🚀"], ["Happy Monday, {name}", "wave"]],
  3: [["Midweek already, {name}", "📅"]],
  5: [["Happy Friday, {name}", "🎉"], ["Almost the weekend, {name}", "🙌"]],
  6: [["Weekend check-in, {name}", "wave"], ["Easy Saturday, {name}", "😌"]],
  0: [["Sunday check-in, {name}", "wave"], ["Slow Sunday, {name}", "😌"]],
}

const ALWAYS_ON: string[] = [
  "Your front desk never takes a break.",
  "Every call answered. No hold music required.",
  "Sit back. The phones are covered.",
  "No voicemails on our watch.",
  "Answering calls so you don't have to.",
  "Your receptionist is on duty, as always.",
  "Every caller gets a real answer, instantly.",
  "Calls in, bookings out.",
]
const OFFLINE_SAFE: string[] = [
  "Here's where things stand.",
  "Everything at a glance.",
  "Here's your day so far.",
  "A quick look at the business.",
]

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function dataLines(c: GreetingContext): string[] {
  const out: string[] = []
  const hour = c.now.getHours()
  if (c.bookedToday > 0) {
    out.push(
      `${plural(c.bookedToday, "booking")} on the calendar already today.`,
      `Your AI has booked ${plural(c.bookedToday, "appointment")} today.`,
      hour < 13 ? `${plural(c.bookedToday, "booking")} before lunch. Not bad.` : `${plural(c.bookedToday, "new appointment")} today, all handled.`,
    )
  }
  if (c.callsToday > 0) {
    out.push(
      `${plural(c.callsToday, "call")} answered today, none sent to voicemail.`,
      `${plural(c.callsToday, "caller")} today, every one picked up.`,
    )
  }
  if (c.nextAppointment) {
    const t = c.nextAppointment.at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    const first = c.nextAppointment.name.split(" ")[0]
    const sameDay = c.nextAppointment.at.toDateString() === c.now.toDateString()
    out.push(sameDay ? `Next up: ${first} at ${t}.` : `Next on the calendar: ${first}, ${c.nextAppointment.at.toLocaleDateString("en-US", { weekday: "long" })} at ${t}.`)
  }
  if (c.leadsToday > 0) out.push(`${plural(c.leadsToday, "new lead")} waiting for a callback.`)
  if (c.actionCount > 0) out.push(`${plural(c.actionCount, "thing")} could use your eye today.`)
  if (c.bookedThisWeek > 0) out.push(`${plural(c.bookedThisWeek, "booking")} this week and counting.`)
  if (c.callsToday === 0 && hour >= 6 && hour < 12 && c.agentLive) {
    out.push("Quiet so far. Ready for the first call of the day.")
  }
  return out
}

const STORAGE_KEY = "orvia-last-greeting"

function readLast(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
function writeLast(v: string) {
  try { localStorage.setItem(STORAGE_KEY, v) } catch { /* storage unavailable */ }
}

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)]
}

export function pickGreeting(c: GreetingContext, rand: () => number = Math.random): Greeting {
  const hour = c.now.getHours()
  const pool = [
    ...(hour < 5 || hour >= 22 ? LATE_NIGHT : hour < 12 ? MORNING : hour < 17 ? AFTERNOON : EVENING),
    ...(hour >= 5 && hour < 22 ? WEEKDAY[c.now.getDay()] ?? [] : []),
  ]

  const facts = dataLines(c)
  const flavour = c.agentLive
    ? [...ALWAYS_ON, ...(hour < 5 || hour >= 22 ? ["Your AI is covering the night shift.", "After-hours calls are handled."] : [])]
    : OFFLINE_SAFE

  const last = readLast()
  let result: Greeting | null = null
  // Up to a few tries to avoid repeating the exact previous greeting.
  for (let i = 0; i < 6; i++) {
    const [text, emoji] = pick(pool, rand)
    // Real numbers are more interesting than flavour lines — prefer them.
    const subline = facts.length > 0 && rand() < 0.75 ? pick(facts, rand) : pick(flavour, rand)
    const headline = c.firstName ? text.replace("{name}", c.firstName) : text.replace(/,? \{name\}/, "")
    result = { headline, emoji, subline }
    if (`${headline}|${subline}` !== last) break
  }
  writeLast(`${result!.headline}|${result!.subline}`)
  return result!
}
