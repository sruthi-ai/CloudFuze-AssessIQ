/**
 * Create/rebuild "Marketing SEO Assessment":
 *   40 questions in 40 minutes, 40 marks — 20 randomly drawn from the existing
 *   100-question Aptitude pool + 20 randomly drawn from a new 62-question SEO/GEO
 *   pool, each pool its own 20-minute section (1 mark each).
 *
 * Idempotent — safe to re-run: SEO questions are only created if missing
 * (matched by title), and the test's sections are cleanly rebuilt each run so
 * pool sizes/timing always match this script, without touching the Aptitude
 * question bank itself.
 *
 *   docker exec -w /app neutaraassessment-backend-1 npx tsx prisma/create-marketing-seo-assessment.ts
 *
 * Env overrides: TEST_TITLE (default "Marketing SEO Assessment"),
 *                APTITUDE_BANK_NAME (default "Freshers Assessment 1"),
 *                APTI_POOL_SIZE (default 20), SEO_POOL_SIZE (default 20),
 *                SECTION_MIN (default 20 — minutes per section; total duration = 2x this).
 */
import { PrismaClient, TestStatus } from '@prisma/client'
const prisma = new PrismaClient()

export const SEO_BANK_NAME = 'Marketing SEO Questions Bank'

// Transcribed 1:1 from the supplied Q1-62 (Sections A-G) + answer key grid.
export const SEO_QUESTIONS: { body: string; options: string[]; correct: number }[] = [
  { body: "What does SEO stand for?", options: ["Search Engine Optimization", "Site Enhancement Operation", "Search Engine Operation", "Search Experience Optimization"], correct: 0 },
  { body: "What does GEO stand for in the context of modern search marketing?", options: ["Geographic Engine Optimization", "Generative Engine Optimization", "Global Export Optimization", "General Enterprise Operations"], correct: 1 },
  { body: "SEO primarily helps a website to:", options: ["Increase paid ad spend", "Rank higher in organic (unpaid) search results", "Send emails to customers", "Design website layouts"], correct: 1 },
  { body: "GEO primarily focuses on optimizing content to:", options: ["Rank only in traditional blue-link search results", "Get cited, quoted, or featured in AI-generated answers (e.g., ChatGPT, Google AI Overviews, Perplexity)", "Improve email open rates", "Reduce server hosting costs"], correct: 1 },
  { body: "Which of the following is NOT a major type of SEO?", options: ["On-Page SEO", "Off-Page SEO", "Technical SEO", "Payroll SEO"], correct: 3 },
  { body: "Which of these is a key difference between traditional SEO and GEO?", options: ["SEO targets ranking positions on a SERP; GEO targets being referenced/cited within an AI-generated response", "GEO only applies to image search", "SEO and GEO are exactly the same with no differences", "GEO does not require quality content"], correct: 0 },
  { body: "Organic search results are different from paid search results because they:", options: ["Are marked 'Ad' and appear at the top always", "Are earned through relevance and optimization, not payment", "Only appear on mobile devices", "Cannot be tracked in analytics"], correct: 1 },
  { body: "Content is more likely to be picked up by AI/generative answer engines when it is:", options: ["Vague, unstructured, and keyword-stuffed", "Clear, well-structured, factual, and easy to extract (e.g., using lists, headings, direct answers)", "Hidden behind a login wall", "Written only in image format"], correct: 1 },
  { body: "SERP stands for:", options: ["Search Engine Results Page", "Site Evaluation Report Page", "Search Engine Ranking Process", "Search Experience Rating Page"], correct: 0 },
  { body: "AI Overviews (shown at the top of some Google search results) are an example of:", options: ["A paid advertisement format only", "A generative AI feature summarizing answers, making GEO increasingly relevant", "A type of backlink", "A social media algorithm"], correct: 1 },
  { body: "Which search engine holds the largest global market share?", options: ["Bing", "Yahoo", "Google", "DuckDuckGo"], correct: 2 },
  { body: "Which factor is widely considered important for both traditional SEO and GEO?", options: ["E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness)", "Number of pop-up ads on a page", "Using the smallest possible font size", "Avoiding all internal links"], correct: 0 },
  { body: "A 'crawler' or 'spider' in SEO refers to:", options: ["A type of malware", "A bot that scans and indexes web pages", "A paid advertisement format", "A website design tool"], correct: 1 },
  { body: "To improve chances of being cited by an AI answer engine, a brand should focus on:", options: ["Publishing clear, original, well-sourced content with data and structured formatting", "Removing all facts and statistics from the page", "Blocking all crawlers via robots.txt", "Using only images with no text"], correct: 0 },
  { body: "'Indexing' means:", options: ["Deleting a page from Google", "Storing a crawled page in the search engine's database", "Designing the homepage", "Running a Google Ads campaign"], correct: 1 },
  { body: "Structured data (schema markup) is useful for GEO because it:", options: ["Helps AI and search engines better understand and extract page content", "Changes the visual design of a website", "Is only used for e-commerce pricing", "Has no impact on machine readability"], correct: 0 },
  { body: "Which of these best describes 'domain authority'?", options: ["The number of pages on a website", "A score predicting how well a website will rank on search engines", "The age of the website's owner", "The number of employees in a company"], correct: 1 },
  { body: "Which of these best describes 'AI visibility' or 'share of model'?", options: ["How often a brand appears/gets mentioned in responses from AI tools like ChatGPT or Gemini", "The number of employees using AI tools in a company", "The percentage of ad spend on Google Ads", "The number of images uploaded to a website"], correct: 0 },
  { body: "Black hat SEO refers to:", options: ["SEO techniques approved by Google", "Unethical techniques that violate search engine guidelines", "A type of technical audit", "SEO done only for local businesses"], correct: 1 },
  { body: "The ideal length for a title tag is generally around:", options: ["10-20 characters", "50-60 characters", "200-300 characters", "There is no limit"], correct: 1 },
  { body: "A meta description is primarily used to:", options: ["Improve page loading speed", "Summarize page content and encourage clicks in SERPs", "Store website passwords", "Block search engines from crawling a page"], correct: 1 },
  { body: "Which HTML tag is used for the main heading of a page?", options: ["<h6>", "<title>", "<h1>", "<meta>"], correct: 2 },
  { body: "Alt text on images is important mainly because it:", options: ["Makes images load faster", "Helps search engines and visually impaired users understand image content", "Changes the image file format", "Increases image file size"], correct: 1 },
  { body: "Keyword density refers to:", options: ["The total number of keywords in the world", "The percentage of times a keyword appears relative to total word count on a page", "The number of backlinks pointing to a keyword", "The cost per click of a keyword"], correct: 1 },
  { body: "Which of these is considered keyword stuffing?", options: ["Using a keyword once in the title", "Naturally including a keyword in the first paragraph", "Repeating a keyword excessively and unnaturally throughout content", "Using synonyms of a keyword"], correct: 2 },
  { body: "Internal linking refers to:", options: ["Linking to pages on other websites", "Linking between pages within the same website", "Linking social media profiles", "Linking to PDF downloads only"], correct: 1 },
  { body: "A 'URL slug' is:", options: ["The domain name of a website", "The readable part of a URL that describes the page content", "A type of redirect", "The server hosting location"], correct: 1 },
  { body: "Which of the following improves on-page SEO the most?", options: ["Using unrelated stock images", "Writing unique, relevant, and well-structured content", "Hiding text with the same color as the background", "Using excessive pop-up ads"], correct: 1 },
  { body: "Header tags (H1, H2, H3...) are mainly used to:", options: ["Change the website's color scheme", "Structure content hierarchy and improve readability/SEO", "Increase server speed", "Store metadata for images"], correct: 1 },
  { body: "A backlink is:", options: ["A link from your website to another website", "A link from another website pointing to your website", "A broken link on your site", "An internal navigation link"], correct: 1 },
  { body: "Which type of backlink is generally most valuable?", options: ["A link from a spammy, low-quality website", "A link from a reputable, high-authority, relevant website", "A link bought in bulk from link farms", "A link with no anchor text"], correct: 1 },
  { body: "'Anchor text' refers to:", options: ["The clickable text of a hyperlink", "The footer text of a website", "The alt text of an image", "The domain registration text"], correct: 0 },
  { body: "Guest blogging is considered an Off-Page SEO technique because it helps:", options: ["Improve website loading speed", "Earn backlinks and increase brand visibility", "Fix broken images", "Reduce bounce rate directly"], correct: 1 },
  { body: "Which of these is an example of Off-Page SEO activity?", options: ["Optimizing the meta title", "Building backlinks through outreach", "Compressing images", "Fixing broken internal links"], correct: 1 },
  { body: "Social media signals (likes, shares) are considered to:", options: ["Directly guarantee first-page ranking", "Indirectly support SEO by increasing visibility and traffic", "Have no relation to SEO whatsoever", "Replace the need for backlinks"], correct: 1 },
  { body: "A 'nofollow' link tells search engines to:", options: ["Follow the link and pass full ranking value", "Not pass SEO ranking credit to the linked page", "Delete the link automatically", "Index the linked page twice"], correct: 1 },
  { body: "Buying large quantities of low-quality backlinks is risky because it can:", options: ["Instantly boost rankings permanently", "Lead to a search engine penalty", "Improve page loading speed", "Have no effect either way"], correct: 1 },
  { body: "A robots.txt file is used to:", options: ["Store website passwords", "Instruct search engine crawlers which pages to crawl or avoid", "Improve image quality", "Track user demographics"], correct: 1 },
  { body: "An XML sitemap helps search engines by:", options: ["Listing important pages for easier crawling and indexing", "Encrypting website data", "Blocking spam bots", "Increasing ad revenue"], correct: 0 },
  { body: "A 404 error means:", options: ["The page loaded successfully", "The requested page could not be found", "The server is too fast", "The page has too many keywords"], correct: 1 },
  { body: "A 301 redirect is used to:", options: ["Temporarily hide a page", "Permanently redirect one URL to another", "Block a page from search engines", "Increase page word count"], correct: 1 },
  { body: "Website page speed is important for SEO mainly because:", options: ["It has no impact on rankings or users", "Slow pages can hurt user experience and rankings", "Google penalizes only fast websites", "It only affects desktop users"], correct: 1 },
  { body: "'Mobile-friendliness' is important for SEO because Google primarily uses:", options: ["Desktop-first indexing", "Mobile-first indexing", "Tablet-only indexing", "No indexing preference at all"], correct: 1 },
  { body: "Canonical tags are used to:", options: ["Prevent duplicate content issues by specifying the preferred URL version", "Add more images to a page", "Block all search engines", "Increase server storage"], correct: 0 },
  { body: "HTTPS (secure) websites are generally preferred by Google over HTTP because:", options: ["HTTPS sites load slower", "HTTPS provides better security and is a ranking signal", "HTTP is always faster", "There is no difference at all"], correct: 1 },
  { body: "A 'long-tail keyword' typically:", options: ["Has one word and very high search volume", "Is a longer, more specific phrase with lower search volume but higher intent", "Cannot be used in content", "Is only used in paid ads"], correct: 1 },
  { body: "Search volume refers to:", options: ["The number of backlinks a keyword has", "The average number of times a keyword is searched in a given period", "The number of ads shown for a keyword", "The number of words in a keyword"], correct: 1 },
  { body: "Keyword difficulty (KD) is a metric that indicates:", options: ["How hard it is to rank for a keyword", "How many characters a keyword contains", "The cost of the keyword in Google Ads only", "The spelling accuracy of the keyword"], correct: 0 },
  { body: "'Search intent' refers to:", options: ["The exact number of searches per day", "The purpose or goal behind a user's search query", "The length of the keyword", "The location of the searcher only"], correct: 1 },
  { body: "Which of these is an example of transactional search intent?", options: ["\"What is SEO?\"", "\"Best laptops under 50000 buy online\"", "\"History of Google\"", "\"How does the internet work?\""], correct: 1 },
  { body: "Competitor keyword analysis helps a business to:", options: ["Copy a competitor's entire website design", "Identify keyword opportunities competitors are already ranking for", "Remove all keywords from their own site", "Avoid using any keywords"], correct: 1 },
  { body: "Google Search Console is mainly used to:", options: ["Design website graphics", "Monitor website performance, indexing status, and search traffic", "Send marketing emails", "Manage social media posts"], correct: 1 },
  { body: "In Google Search Console, 'Impressions' refer to:", options: ["The number of times a page was clicked", "The number of times a page appeared in search results", "The number of backlinks", "The number of images on a page"], correct: 1 },
  { body: "CTR (Click-Through Rate) in Search Console is calculated as:", options: ["Clicks divided by Impressions", "Impressions divided by Clicks", "Clicks multiplied by Impressions", "Total visits divided by bounce rate"], correct: 0 },
  { body: "Google Analytics is primarily used to:", options: ["Track website visitor behavior and traffic sources", "Submit sitemaps to Google", "Register a domain name", "Create backlinks"], correct: 0 },
  { body: "'Bounce rate' in Google Analytics refers to:", options: ["The percentage of single-page sessions with no further interaction", "The number of pages a user visits", "The average session duration", "The number of new users"], correct: 0 },
  { body: "Which report in Search Console would you check to find crawl or indexing errors?", options: ["Performance report", "Coverage/Indexing report", "Links report only", "Sitemaps report only"], correct: 1 },
  { body: "In MS Excel/Google Sheets, which function is commonly used to find an exact value from a table?", options: ["SUM", "VLOOKUP", "AVERAGE", "COUNT"], correct: 1 },
  { body: "To quickly visualize keyword ranking trends over months in Excel, you would most likely use a:", options: ["Pivot table only", "Line chart/graph", "Text box", "Print preview"], correct: 1 },
  { body: "AI tools like ChatGPT or Gemini can assist SEO trainees mainly in:", options: ["Automatically ranking a website #1 on Google instantly", "Generating content ideas, meta description drafts, and keyword brainstorming", "Replacing Google Search Console entirely", "Guaranteeing backlinks"], correct: 1 },
  { body: "A basic SEO report typically should include:", options: ["Only the company's financial statements", "Keyword rankings, traffic trends, and key performance observations", "Employee attendance records", "Unrelated social media memes"], correct: 1 },
  { body: "Why is staying updated with Google algorithm updates important for an SEO trainee?", options: ["Algorithms never change once released", "Updates can affect rankings, so strategies may need adjustment", "It has no effect on SEO strategy", "Only developers need to know about updates"], correct: 1 },
]

async function main() {
  const testTitle = process.env.TEST_TITLE || 'Marketing SEO Assessment'
  const aptitudeBankName = process.env.APTITUDE_BANK_NAME || 'Freshers Assessment 1'
  const aptiPoolSize = Number(process.env.APTI_POOL_SIZE) || 20
  const seoPoolSize = Number(process.env.SEO_POOL_SIZE) || 20
  const sectionMin = Number(process.env.SECTION_MIN) || 20

  const aptiBank = await prisma.questionBank.findFirst({ where: { name: aptitudeBankName } })
  if (!aptiBank) throw new Error(`Aptitude bank "${aptitudeBankName}" not found.`)
  const tenantId = aptiBank.tenantId

  const admin = await prisma.user.findFirst({
    where: { tenantId, role: { in: ['SUPER_ADMIN', 'COMPANY_ADMIN'] } },
    orderBy: { createdAt: 'asc' },
  })
  if (!admin) throw new Error('No admin user found for the tenant.')

  const aptiQuestions = await prisma.question.findMany({
    where: { bankId: aptiBank.id, title: { startsWith: 'Aptitude Q' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (aptiQuestions.length < aptiPoolSize) throw new Error(`Only ${aptiQuestions.length} aptitude questions — need at least ${aptiPoolSize}.`)

  // ── SEO bank + questions (create-if-missing, by title) ──────────────────────
  let seoBank = await prisma.questionBank.findFirst({ where: { name: SEO_BANK_NAME, tenantId } })
  if (!seoBank) {
    seoBank = await prisma.questionBank.create({ data: { name: SEO_BANK_NAME, tenantId, description: 'Marketing SEO/GEO MCQ pool — fundamentals, on-page, off-page, technical SEO, keyword research, GSC/GA, analytical skills.' } })
  }

  let created = 0
  for (let i = 0; i < SEO_QUESTIONS.length; i++) {
    const title = `SEO Q${i + 1}`
    const existing = await prisma.question.findFirst({ where: { bankId: seoBank.id, title } })
    if (existing) continue
    const q = SEO_QUESTIONS[i]
    await prisma.question.create({
      data: {
        bankId: seoBank.id, type: 'MCQ_SINGLE', title, body: q.body,
        difficulty: 'MEDIUM', points: 1, domain: 'Marketing SEO',
        options: { create: q.options.map((text, idx) => ({ text, isCorrect: idx === q.correct, order: idx })) },
      },
    })
    created++
  }
  console.log(`SEO bank: ${created} question(s) created, ${SEO_QUESTIONS.length - created} already existed.`)

  const seoQuestions = await prisma.question.findMany({
    where: { bankId: seoBank.id, title: { startsWith: 'SEO Q' } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (seoQuestions.length < seoPoolSize) throw new Error(`Only ${seoQuestions.length} SEO questions — need at least ${seoPoolSize}.`)

  // ── Test: two sections, one pool each ───────────────────────────────────────
  const totalMin = sectionMin * 2
  const instructions = `Marketing SEO Assessment — ${totalMin} minutes, ${aptiPoolSize + seoPoolSize} questions, 1 mark each. ` +
    `Section 1 (Aptitude): a random ${aptiPoolSize} of ${aptiQuestions.length} questions, ${sectionMin} minutes. ` +
    `Section 2 (SEO & Marketing): a random ${seoPoolSize} of ${seoQuestions.length} questions, ${sectionMin} minutes. Choose the best option.`

  let test = await prisma.test.findFirst({ where: { title: testTitle, tenantId } })
  if (!test) {
    test = await prisma.test.create({
      data: {
        title: testTitle, domain: 'Marketing', duration: totalMin,
        status: TestStatus.DRAFT, proctoring: true, enforceViolations: false, sebRequired: false,
        tenantId, createdById: admin.id, instructions,
      },
    })
    console.log(`created test "${testTitle}"`)
  } else {
    const secs = await prisma.testSection.findMany({ where: { testId: test.id } })
    for (const s of secs) await prisma.testQuestion.deleteMany({ where: { sectionId: s.id } })
    await prisma.testSection.deleteMany({ where: { testId: test.id } })
    await prisma.test.update({ where: { id: test.id }, data: { duration: totalMin, instructions } })
    console.log(`rebuilt existing test "${testTitle}"`)
  }

  const aptiSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'Aptitude', skill: 'GENERAL', order: 0, timeLimit: sectionMin * 60, pickCount: aptiPoolSize,
      description: `${aptiPoolSize} questions (randomly drawn from a bank of ${aptiQuestions.length}) covering quantitative ability, logical reasoning and data interpretation. 1 mark each.` },
  })
  await prisma.testQuestion.createMany({
    data: aptiQuestions.map((q, i) => ({ testId: test!.id, sectionId: aptiSection.id, questionId: q.id, order: i, points: 1 })),
  })

  const seoSection = await prisma.testSection.create({
    data: { testId: test.id, title: 'SEO & Marketing', skill: 'GENERAL', order: 1, timeLimit: sectionMin * 60, pickCount: seoPoolSize,
      description: `${seoPoolSize} questions (randomly drawn from a bank of ${seoQuestions.length}) covering SEO/GEO fundamentals, on-page, off-page, technical SEO, keyword research, Search Console/Analytics, and analytical/AI-tool skills. 1 mark each.` },
  })
  await prisma.testQuestion.createMany({
    data: seoQuestions.map((q, i) => ({ testId: test!.id, sectionId: seoSection.id, questionId: q.id, order: i, points: 1 })),
  })

  console.log(`\n✅ "${testTitle}": Aptitude ${aptiPoolSize}/${aptiQuestions.length} (${sectionMin}min) + SEO & Marketing ${seoPoolSize}/${seoQuestions.length} (${sectionMin}min) = ${totalMin} min, ${aptiPoolSize + seoPoolSize} marks. Status DRAFT — publish it in the admin UI to use.`)
}

if (require.main === module) {
  main().catch(e => { console.error('❌ create-marketing-seo-assessment failed:', e); process.exit(1) }).finally(() => prisma.$disconnect())
}
