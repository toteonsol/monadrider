/** Client helper for the AI Ride Coach · null on any failure (rule-based fallback). */
export async function aiCoach(record: unknown, careerTotals: unknown): Promise<string | null> {
  try {
    const r = await fetch("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record, career: careerTotals }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { tip?: string | null };
    return j.tip ?? null;
  } catch {
    return null;
  }
}
