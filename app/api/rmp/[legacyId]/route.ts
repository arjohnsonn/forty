import { NextResponse } from "next/server";

const RMP_GQL = "https://www.ratemyprofessors.com/graphql";
const RMP_AUTH = "Basic dGVzdDp0ZXN0"; // public hardcoded RMP web credential (test:test)
const MAX_COURSES = 12;
const MIN_COURSE_RATINGS = 3;
const RMP_TIMEOUT_MS = 5000;

const nodeId = (legacyId: number) => btoa(`Teacher-${legacyId}`);

async function rmp(query: string, variables: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RMP_TIMEOUT_MS);
  try {
    const res = await fetch(RMP_GQL, {
      method: "POST",
      headers: { Authorization: RMP_AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`RMP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

const MAIN_QUERY = `query($id: ID!){ node(id: $id){ ... on Teacher {
  firstName lastName department avgRating avgDifficulty numRatings wouldTakeAgainPercent
  ratingsDistribution { r1 r2 r3 r4 r5 total }
  teacherRatingTags { tagName tagCount }
  courseCodes { courseName courseCount }
  ratings(first: 6){ edges { node { class date grade clarityRating helpfulRating difficultyRating wouldTakeAgain ratingTags comment } } }
} } }`;

const COURSE_QUERY = `query($id: ID!, $course: String){ node(id: $id){ ... on Teacher {
  ratings(first: 100, courseFilter: $course){ edges { node { clarityRating helpfulRating difficultyRating wouldTakeAgain } } }
} } }`;

// Full review text for one course (powers the panel's "filter by course" dropdown).
const COURSE_REVIEWS_QUERY = `query($id: ID!, $course: String){ node(id: $id){ ... on Teacher {
  ratings(first: 12, courseFilter: $course){ edges { node { class date grade clarityRating helpfulRating difficultyRating wouldTakeAgain ratingTags comment } } }
} } }`;

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const quality = (r: any) => (Number(r.clarityRating) + Number(r.helpfulRating)) / 2;
const wtaPercent = (rs: any[]): number | null => {
  const answered = rs.filter((r) => r.wouldTakeAgain === 0 || r.wouldTakeAgain === 1);
  return answered.length
    ? Math.round((100 * answered.filter((r) => r.wouldTakeAgain === 1).length) / answered.length)
    : null;
};

const mapReviews = (edges: any[] | undefined) =>
  (edges ?? [])
    .map((e: any) => e?.node)
    .filter(Boolean)
    .map((r: any) => ({
      course: r.class ?? null,
      grade: r.grade ?? null,
      date: r.date ?? null,
      quality: round1(quality(r)),
      difficulty: Number(r.difficultyRating) || null,
      wouldTakeAgain: r.wouldTakeAgain === 1 ? true : r.wouldTakeAgain === 0 ? false : null,
      comment: r.comment ?? "",
      tags: String(r.ratingTags ?? "")
        .split("--")
        .map((t: string) => t.trim())
        .filter(Boolean),
    }));

const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

export async function GET(req: Request, { params }: { params: Promise<{ legacyId: string }> }) {
  const { legacyId } = await params;
  const id = Number(legacyId);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const course = new URL(req.url).searchParams.get("course");

  try {
    // ?course=CODE -> just that course's reviews (powers the panel's review filter).
    if (course) {
      const node = (await rmp(COURSE_REVIEWS_QUERY, { id: nodeId(id), course }))?.data?.node;
      return NextResponse.json({ reviews: mapReviews(node?.ratings?.edges) }, { headers: CACHE });
    }

    const main = (await rmp(MAIN_QUERY, { id: nodeId(id) }))?.data?.node;
    if (!main) return NextResponse.json({ error: "not found" }, { status: 404 });

    const topCourses = (main.courseCodes ?? [])
      .filter((c: any) => c?.courseName)
      .sort((a: any, b: any) => (b.courseCount ?? 0) - (a.courseCount ?? 0))
      .slice(0, MAX_COURSES);

    const courses = (
      await Promise.all(
        topCourses.map(async (c: any) => {
          try {
            const node = (await rmp(COURSE_QUERY, { id: nodeId(id), course: c.courseName }))?.data?.node;
            const rs = (node?.ratings?.edges ?? []).map((e: any) => e?.node).filter(Boolean);
            if (rs.length < MIN_COURSE_RATINGS) return null;
            return {
              code: c.courseName,
              rating: round1(avg(rs.map(quality))),
              difficulty: round1(avg(rs.map((r: any) => Number(r.difficultyRating)))),
              wouldTakeAgain: wtaPercent(rs),
              numRatings: rs.length,
            };
          } catch {
            return null;
          }
        }),
      )
    )
      .filter(Boolean)
      .sort((a: any, b: any) => b.numRatings - a.numRatings);

    const reviews = mapReviews(main.ratings?.edges);

    const payload = {
      legacyId: id,
      name: `${(main.firstName ?? "").trim()} ${(main.lastName ?? "").trim()}`.trim(),
      department: main.department ?? null,
      overall: {
        rating: main.avgRating ?? null,
        difficulty: main.avgDifficulty ?? null,
        wouldTakeAgain:
          typeof main.wouldTakeAgainPercent === "number" && main.wouldTakeAgainPercent >= 0
            ? Math.round(main.wouldTakeAgainPercent)
            : null,
        numRatings: main.numRatings ?? 0,
      },
      distribution: main.ratingsDistribution ?? null,
      tags: (main.teacherRatingTags ?? [])
        .map((t: any) => ({ tag: t.tagName, count: t.tagCount }))
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, 10),
      courses,
      reviews,
    };

    return NextResponse.json(payload, { headers: CACHE });
  } catch {
    return NextResponse.json({ error: "RateMyProfessors request failed" }, { status: 502 });
  }
}
