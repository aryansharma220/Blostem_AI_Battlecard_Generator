import axios from "axios";
import { retrieveRelevantSources } from "./rag.js";
import { scrapeCompetitor } from "./scraper.js";
import { getDemoSources } from "./demoData.js";
import { inferSourceAuthority, inferSourceClass, inferSourceFreshness, isHighQualitySource, isLowQualitySource } from "./sourcePolicy.js";

const SERPER_API_KEY = process.env.SERPER_API_KEY || "";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const GITHUB_API_KEY = process.env.GITHUB_API_KEY || "";
const RETRIEVAL_PROVIDER = (process.env.RETRIEVAL_PROVIDER || "auto").toLowerCase();
const DEFAULT_RETRIEVAL_MODE = (process.env.DEFAULT_RETRIEVAL_MODE || "live").toLowerCase();

// Map competitors to their GitHub org/repo patterns
const GITHUB_PATTERNS = {
  razorpay: { org: "razorpay", repos: ["razorpay-node", "razorpay-php", "razorpay-python"] },
  paytm: { org: "paytm", repos: ["paytm-sdk", "paytm-nodejs"] },
  phonepe: { org: "phonepe", repos: ["phonepe-sdk"] },
};

// Known status/uptime page URLs
const STATUS_PAGE_PATTERNS = {
  razorpay: "https://status.razorpay.com",
  paytm: "https://status.paytm.com",
  phonepe: "https://status.phonepe.com",
};

// Engineering blog patterns
const ENGINEERING_BLOG_PATTERNS = {
  razorpay: ["razorpay.com/blog", "engineering.razorpay.com", "tech.razorpay.com"],
  paytm: ["paytm.com/blog", "tech.paytm.com"],
  phonepe: ["phonepe.com/blog", "tech.phonepe.com"],
};

const KNOWN_STRUCTURED_HINTS = {
  razorpay: [
    { title: "Razorpay Pricing", url: "https://razorpay.com/pricing/", snippet: "Official pricing and MDR details for Razorpay merchants.", type: "pricing" },
    { title: "Razorpay Docs", url: "https://razorpay.com/docs/", snippet: "Official API and developer documentation.", type: "docs" },
    { title: "Razorpay Blog", url: "https://razorpay.com/blog/", snippet: "Official launches and product announcements.", type: "blog" },
  ],
  paytm: [
    { title: "Paytm for Business Pricing", url: "https://business.paytm.com/pricing", snippet: "Official merchant pricing and settlement posture.", type: "pricing" },
    { title: "Paytm Business Docs", url: "https://business.paytm.com/docs", snippet: "Official APIs and product documentation.", type: "docs" },
    { title: "Paytm Blog", url: "https://paytm.com/blog/", snippet: "Official launches and company announcements.", type: "blog" },
  ],
  phonepe: [
    { title: "PhonePe Business", url: "https://www.phonepe.com/business-solutions/", snippet: "Merchant solutions overview and product positioning.", type: "company" },
    { title: "PhonePe Product Updates", url: "https://www.phonepe.com/blog/", snippet: "Official launches and merchant product updates.", type: "blog" },
    { title: "PhonePe Merchant Stack", url: "https://www.phonepe.com/business-solutions/payment-gateway/", snippet: "Business stack and payments product overview.", type: "docs" },
  ],
};

// ============ Specialized Hard-to-Find Source Fetchers ============

async function fetchGitHubSignals(competitor) {
  if (!GITHUB_API_KEY) return [];
  try {
    const pattern = GITHUB_PATTERNS[(competitor || "").toLowerCase().replace(/\s+/g, "")] || { org: competitor };
    const headers = {
      Authorization: `token ${GITHUB_API_KEY}`,
      "Accept": "application/vnd.github.v3+json",
    };

    const results = [];

    // Fetch releases/tags to see product velocity and roadmap
    try {
      for (const repo of pattern.repos || [pattern.org]) {
        const repoUrl = `https://api.github.com/repos/${pattern.org}/${repo}/releases?per_page=5`;
        const response = await axios.get(repoUrl, { headers, timeout: 5000 });
        const releases = response.data || [];

        releases.forEach((release) => {
          results.push({
            title: `Release: ${release.tag_name} - ${release.name || "Unnamed"}`,
            url: release.html_url,
            snippet: `Published ${release.published_at}. ${release.body || "No description"}.`.substring(0, 200),
            published_at: release.published_at,
            type: "blog",
            raw_metadata: { github_type: "release", repo, velocity_signal: true },
          });
        });
      }
    } catch (e) {
      // Silently fail if GitHub API calls fail
    }

    // Fetch recent commits to gauge activity and engineering focus
    try {
      const defaultRepo = pattern.repos?.[0] || pattern.org;
      const commitsUrl = `https://api.github.com/repos/${pattern.org}/${defaultRepo}/commits?per_page=3`;
      const response = await axios.get(commitsUrl, { headers, timeout: 5000 });
      const commits = response.data || [];

      commits.forEach((commit) => {
        results.push({
          title: `Commit: ${commit.commit.message.split("\n")[0].substring(0, 60)}`,
          url: commit.html_url,
          snippet: `By ${commit.commit.author.name}. ${commit.commit.message.substring(0, 150)}`,
          published_at: commit.commit.author.date,
          type: "blog",
          raw_metadata: { github_type: "commit", engineering_signal: true },
        });
      });
    } catch (e) {
      // Silently fail
    }

    return results;
  } catch (error) {
    console.warn("GitHub fetcher failed:", error?.message);
    return [];
  }
}

async function fetchStatusPageSignals(competitor) {
  try {
    const statusUrl = STATUS_PAGE_PATTERNS[(competitor || "").toLowerCase()] || `https://status.${competitor}.com`;
    const response = await axios.get(statusUrl, { timeout: 5000 });
    const html = response.data || "";

    // Extract uptime percentage and recent incidents
    const uptimeMatch = html.match(/uptime|99\.\d+%|availability/gi);
    const incidentMatch = html.match(/incident|outage|down|resolved/gi);

    const results = [];
    if (uptimeMatch || incidentMatch) {
      results.push({
        title: `Status Page: ${competitor}`,
        url: statusUrl,
        snippet: `Operational history and incident records. ${uptimeMatch ? "Uptime metrics available" : ""}. ${incidentMatch ? "Recent incidents tracked" : ""}`,
        published_at: new Date().toISOString(),
        type: "company",
        raw_metadata: { status_page: true, operational_signal: true },
      });
    }

    return results;
  } catch (error) {
    console.warn("Status page fetcher failed:", error?.message);
    return [];
  }
}

async function fetchEngineeringBlogSignals(competitor) {
  try {
    const patterns = ENGINEERING_BLOG_PATTERNS[(competitor || "").toLowerCase()] || [];
    const results = [];

    for (const pattern of patterns) {
      try {
        // Use Serper to search engineering blog specifically
        if (!SERPER_API_KEY) continue;
        const query = `site:${pattern} engineering OR architecture OR infrastructure OR scaling`;
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 3 },
          {
            timeout: 5000,
            headers: {
              "X-API-KEY": SERPER_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );

        const blogResults = response.data?.organic || [];
        blogResults.forEach((item) => {
          results.push({
            title: item.title,
            url: item.link,
            snippet: item.snippet,
            published_at: item.date || "",
            type: "blog",
            raw_metadata: { engineering_blog: true, architecture_signal: true },
          });
        });
      } catch (e) {
        // Continue with next pattern
      }
    }

    return results;
  } catch (error) {
    console.warn("Engineering blog fetcher failed:", error?.message);
    return [];
  }
}

async function fetchJobPostingSignals(competitor) {
  try {
    // Use Serper to search for recent job postings which reveal hiring intent
    if (!SERPER_API_KEY) return [];

    const query = `site:linkedin.com "${competitor}" hiring jobs`;
    const response = await axios.post(
      "https://google.serper.dev/search",
      { q: query, num: 4 },
      {
        timeout: 5000,
        headers: {
          "X-API-KEY": SERPER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const jobResults = response.data?.organic || [];
    return jobResults
      .filter((item) => item.title.toLowerCase().includes("job") || item.snippet.toLowerCase().includes("hiring"))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "social",
        raw_metadata: { job_posting: true, hiring_intent_signal: true },
      }));
  } catch (error) {
    console.warn("Job posting fetcher failed:", error?.message);
    return [];
  }
}

async function fetchFounderSignals(competitor) {
  try {
    // Search for recent founder/CEO interviews, tweets, and podcast appearances
    if (!SERPER_API_KEY) return [];

    const founderQuery = `"${competitor}" founder OR CEO interview OR podcast OR conference 2024 2025`;
    const response = await axios.post(
      "https://google.serper.dev/search",
      { q: founderQuery, num: 4 },
      {
        timeout: 5000,
        headers: {
          "X-API-KEY": SERPER_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const founderResults = response.data?.organic || [];
    return founderResults
      .filter((item) => /interview|podcast|conference|talk|speech|founder|ceo/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "news",
        raw_metadata: { founder_signal: true, strategic_intent_signal: true },
      }));
  } catch (error) {
    console.warn("Founder signal fetcher failed:", error?.message);
    return [];
  }
}

// ============ Directional Intelligence Sources ============

async function fetchWaybackMachineSignals(competitor) {
  try {
    // Internet Archive: Historical website changes reveal pivots, removed features, fear signals
    const domain = competitor.toLowerCase().replace(/\s+/g, "");
    const waybackUrl = `https://archive.org/advancedsearch.php?output=json&fl=timestamp,statuscode&filter=statuscode:200&url=${domain}.com/*&collapse=urlkey`;
    
    const response = await axios.get(waybackUrl, { timeout: 5000 });
    const snapshots = response.data?.response?.docs || [];
    
    // Find trends in snapshots - gaps indicate major redesigns/pivots
    if (snapshots.length > 3) {
      const oldestSnapshot = snapshots[snapshots.length - 1]?.timestamp;
      const newestSnapshot = snapshots[0]?.timestamp;
      const gapIndicators = snapshots.filter((s, i) => i > 0 && (parseInt(snapshots[i-1].timestamp) - parseInt(s.timestamp)) > 30000000);
      
      return [{
        title: `Archive.org: ${competitor} Website Evolution`,
        url: `https://web.archive.org/web/*/${domain}.com/`,
        snippet: `${snapshots.length} snapshots tracked from ${oldestSnapshot} to ${newestSnapshot}. ${gapIndicators.length} major redesign periods detected. Website evolution reveals strategic pivots.`,
        published_at: newestSnapshot ? newestSnapshot.substring(0, 4) : "",
        type: "company",
        raw_metadata: { wayback_signal: true, pivot_detection: true, historical_analysis: true },
      }];
    }
    return [];
  } catch (error) {
    console.warn("Wayback Machine fetcher failed:", error?.message);
    return [];
  }
}

async function fetchRegulatorySignals(competitor) {
  try {
    // RBI/NPCI/Company registration database: Regulatory actions, compliance history
    if (!SERPER_API_KEY) return [];
    
    const regulatoryQueries = [
      `RBI "${competitor}" compliance OR directive OR circular OR warning`,
      `"${competitor}" GST registration OR company incorporation OR regulatory filing`,
      `NPCI "${competitor}" license OR approval OR compliance 2024 2025`,
    ];
    
    let results = [];
    for (const query of regulatoryQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue with next query
      }
    }
    
    return results
      .filter((item) => /rbi|npci|compliance|directive|registration|incorporation|license/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "news",
        raw_metadata: { regulatory_signal: true, compliance_history: true },
      }));
  } catch (error) {
    console.warn("Regulatory fetcher failed:", error?.message);
    return [];
  }
}

async function fetchAppStoreSignals(competitor) {
  try {
    // App store metrics: Rating trends, update velocity, crash patterns reveal user satisfaction
    if (!SERPER_API_KEY) return [];
    
    const appStoreQueries = [
      `"${competitor}" app store reviews rating trending`,
      `"${competitor}" Google Play Store crash reports OR stability`,
      `"${competitor}" app store updates 2024 2025 changelog`,
    ];
    
    let results = [];
    for (const query of appStoreQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /app store|play store|rating|review|crash|update|stability/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "reviews",
        raw_metadata: { app_store_signal: true, user_satisfaction_metric: true },
      }));
  } catch (error) {
    console.warn("App store fetcher failed:", error?.message);
    return [];
  }
}

async function fetchPatentTrademarkSignals(competitor) {
  try {
    // Patent/trademark databases: Innovation signals, expansion hints
    if (!SERPER_API_KEY) return [];
    
    const patentQueries = [
      `${competitor} patent OR trademark OR intellectual property 2024`,
      `USPTO "${competitor}" patent application OR granted`,
      `${competitor} innovation OR research OR technology filing`,
    ];
    
    let results = [];
    for (const query of patentQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /patent|trademark|invention|innovation|intellectual property/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "news",
        raw_metadata: { patent_signal: true, innovation_signal: true },
      }));
  } catch (error) {
    console.warn("Patent/Trademark fetcher failed:", error?.message);
    return [];
  }
}

async function fetchCommunityDiscussionSignals(competitor) {
  try {
    // Reddit, Hacker News, Twitter: Unfiltered user sentiment and technical discussions
    if (!SERPER_API_KEY) return [];
    
    const communityQueries = [
      `site:reddit.com ${competitor} OR "site:reddit.com" "${competitor}"`,
      `site:news.ycombinator.com ${competitor}`,
      `site:twitter.com ${competitor} OR "site:x.com" "${competitor}" technical problem`,
    ];
    
    let results = [];
    for (const query of communityQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /reddit|hacker news|twitter|x\.com|discussion|problem|issue|bug/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "social",
        raw_metadata: { community_discussion: true, unfiltered_sentiment: true },
      }));
  } catch (error) {
    console.warn("Community discussion fetcher failed:", error?.message);
    return [];
  }
}

async function fetchLegalDisputeSignals(competitor) {
  try {
    // Legal/compliance records: Litigation, disputes, regulatory actions reveal real problems
    if (!SERPER_API_KEY) return [];
    
    const legalQueries = [
      `${competitor} litigation OR lawsuit OR court case OR dispute 2023 2024 2025`,
      `${competitor} regulatory action OR compliance issue OR violation`,
      `${competitor} settlement OR agreement OR cease and desist`,
    ];
    
    let results = [];
    for (const query of legalQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /litigation|lawsuit|court|dispute|settlement|regulatory|compliance|violation|cease/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "news",
        raw_metadata: { legal_signal: true, dispute_history: true, credibility_risk: true },
      }));
  } catch (error) {
    console.warn("Legal dispute fetcher failed:", error?.message);
    return [];
  }
}

async function fetchPaymentProcessorSignals(competitor) {
  try {
    // Payment processor presence: Stripe, PayPal merchant profiles reveal payment flow architecture
    if (!SERPER_API_KEY) return [];
    
    const processorQueries = [
      `${competitor} Stripe merchant OR payment processor integration`,
      `${competitor} PayPal OR Razorpay OR gateway integration 2024`,
      `${competitor} payment flow OR checkout OR settlement architecture`,
    ];
    
    let results = [];
    for (const query of processorQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /stripe|paypal|payment|processor|gateway|settlement|checkout|merchant/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "company",
        raw_metadata: { processor_signal: true, architecture_hint: true },
      }));
  } catch (error) {
    console.warn("Payment processor fetcher failed:", error?.message);
    return [];
  }
}

async function fetchDataBreachSignals(competitor) {
  try {
    // Data breach/vulnerability databases: Security incidents reveal execution risks
    if (!SERPER_API_KEY) return [];
    
    const securityQueries = [
      `${competitor} data breach OR security incident OR vulnerability 2023 2024 2025`,
      `${competitor} CVE OR "security advisory" OR exploit`,
      `haveibeenpwned OR "breach" "${competitor}"`,
    ];
    
    let results = [];
    for (const query of securityQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /breach|vulnerability|security|incident|exploit|cve/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "news",
        raw_metadata: { security_signal: true, execution_risk: true },
      }));
  } catch (error) {
    console.warn("Data breach fetcher failed:", error?.message);
    return [];
  }
}

async function fetchProductHuntSignals(competitor) {
  try {
    // Product Hunt: Product launches, user feedback, feature announcements
    if (!SERPER_API_KEY) return [];
    
    const productQueries = [
      `site:producthunt.com ${competitor} OR "site:producthunt.com" "${competitor}"`,
      `${competitor} product launch OR feature announcement OR update 2024 2025`,
    ];
    
    let results = [];
    for (const query of productQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /producthunt|product hunt|launch|announcement|feature|update/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "news",
        raw_metadata: { product_hunt_signal: true, market_traction: true },
      }));
  } catch (error) {
    console.warn("Product Hunt fetcher failed:", error?.message);
    return [];
  }
}

async function fetchEmailNewsletterSignals(competitor) {
  try {
    // Email/newsletter communication patterns: Newsletter frequency, messaging evolution, audience outreach
    if (!SERPER_API_KEY) return [];
    
    const newsletterQueries = [
      `"${competitor}" newsletter OR "product update" OR "customer email" 2024 2025`,
      `site:substack.com "${competitor}" OR "site:beehiiv.com" "${competitor}"`,
      `"${competitor}" announcement email OR customer communication 2024`,
    ];
    
    let results = [];
    for (const query of newsletterQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /newsletter|email|announcement|communication|update|substack|beehiiv/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "news",
        raw_metadata: { newsletter_signal: true, communication_pattern: true, customer_outreach: true },
      }));
  } catch (error) {
    console.warn("Email/Newsletter fetcher failed:", error?.message);
    return [];
  }
}

async function fetchLinkedInHiringSignals(competitor) {
  try {
    // LinkedIn hiring patterns: Job posting frequency, role evolution, team growth trajectory
    // Uses search since direct API requires enterprise access
    if (!SERPER_API_KEY) return [];
    
    const hiringQueries = [
      `site:linkedin.com/jobs "${competitor}" 2024 2025`,
      `"${competitor}" hiring trends OR team growth OR recruitment patterns 2024 2025`,
      `"${competitor}" engineer OR product manager OR operations OR compliance hiring`,
    ];
    
    let results = [];
    for (const query of hiringQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 3 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        const items = response.data?.organic || [];
        results.push(...items);
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /linkedin|job|hiring|recruitment|career|position|open role|engineer|product/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "social",
        raw_metadata: { 
          linkedin_hiring: true, 
          hiring_velocity: true, 
          team_composition: true,
          // Extract job category for deeper analysis
          job_category: item.title.toLowerCase().includes("engineer") ? "engineering" : 
                       item.title.toLowerCase().includes("product") ? "product" :
                       item.title.toLowerCase().includes("operations") ? "operations" :
                       item.title.toLowerCase().includes("compliance") ? "compliance" : "other"
        },
      }));
  } catch (error) {
    console.warn("LinkedIn hiring fetcher failed:", error?.message);
    return [];
  }
}

async function fetchRiskSignals(competitor) {
  try {
    // Aggregate risk signals from multiple sources for risk dashboard
    if (!SERPER_API_KEY) return [];
    
    const riskQueries = [
      `${competitor} risk OR exposure OR vulnerability OR challenge 2024 2025`,
      `${competitor} financial risk OR operational risk OR technology risk`,
      `${competitor} customer complaint OR merchant complaint OR user issue 2024`,
    ];
    
    let results = [];
    for (const query of riskQueries) {
      try {
        const response = await axios.post(
          "https://google.serper.dev/search",
          { q: query, num: 2 },
          { timeout: 5000, headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" } }
        );
        results.push(...(response.data?.organic || []));
      } catch (e) {
        // Continue
      }
    }
    
    return results
      .filter((item) => /risk|exposure|vulnerability|challenge|complaint|issue|problem/.test(item.title.toLowerCase()))
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        published_at: item.date || "",
        type: "news",
        raw_metadata: { 
          risk_signal: true,
          risk_category: item.title.toLowerCase().includes("financial") ? "financial" :
                        item.title.toLowerCase().includes("operational") ? "operational" :
                        item.title.toLowerCase().includes("security") ? "security" :
                        item.title.toLowerCase().includes("compliance") ? "compliance" :
                        item.title.toLowerCase().includes("customer") ? "customer_satisfaction" : "other"
        },
      }));
  } catch (error) {
    console.warn("Risk signal fetcher failed:", error?.message);
    return [];
  }
}

function inferType(raw = {}) {
  const text = `${raw.title || ""} ${raw.url || ""} ${raw.snippet || raw.content || ""}`.toLowerCase();
  if (raw.type) return raw.type;
  if (/pricing|price|mdr|fee/.test(text)) return "pricing";
  if (/docs|api|developer|reference/.test(text)) return "docs";
  if (/g2|review|trustpilot|reddit/.test(text)) return "reviews";
  if (/blog|launch|announcement/.test(text)) return "blog";
  if (/linkedin|social/.test(text)) return "social";
  if (/news|funding|forbes|techcrunch|times/.test(text)) return "news";
  return "company";
}

function computeCredibilityScore(source) {
  let score = 0.35;
  if (source.authority === "high") score += 0.35;
  if (source.authority === "medium") score += 0.2;
  if (source.freshness === "recent") score += 0.2;
  if (source.freshness === "unknown") score -= 0.08;
  if (source.freshness === "stale") score -= 0.12;
  if (source.type === "pricing" || source.type === "docs" || source.type === "reviews") score += 0.1;
  if (isLowQualitySource(source.url)) score -= 0.3;
  if (isHighQualitySource(source.url)) score += 0.1;
  return Math.min(Math.max(score, 0.05), 1);
}

function canonicalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceRankScore(source = {}) {
  let score = source.credibility_score || computeCredibilityScore(source);
  if (source.authority === "high") score += 0.14;
  if (source.freshness === "recent") score += 0.1;
  if (source.source_class === "official_product") score += 0.14;
  if (source.source_class === "compliance_operational") score += 0.12;
  if (source.source_class === "employee_signals") score += 0.06;
  if (source.source_class === "customer_sentiment") score += 0.04;
  if (source.source_class === "community_signals") score -= 0.05;
  if (source.provider === "demo") score += 0.02;
  if (source.provider === "structured") score += 0.08;
  if (source.type === "pricing" || source.type === "docs" || source.type === "reviews") score += 0.05;
  if (isLowQualitySource(source.url)) score -= 0.2;
  return score;
}

function normalizeSource(raw, provider, index, competitor = "") {
  const publishedAt = raw.published_at || raw.date || raw.publishedAt || "";
  const retrievedAt = new Date().toISOString();
  const sourceClass = raw.source_class || inferSourceClass({
    type: inferType(raw),
    title: raw.title,
    url: raw.url,
    snippet: raw.snippet || raw.content || raw.description || "",
    raw_metadata: raw.raw_metadata || {},
  });
  const normalized = {
    id: raw.id || `src_${index + 1}`,
    title: raw.title || raw.source || `Source ${index + 1}`,
    url: raw.url || `https://example.com/source-${index + 1}`,
    snippet: raw.snippet || raw.content || raw.description || "",
    published_at: publishedAt,
    retrieved_at: raw.retrieved_at || retrievedAt,
    type: inferType(raw),
    source_class: sourceClass,
    authority: inferSourceAuthority(raw.url || "", competitor),
    freshness: inferSourceFreshness(publishedAt),
    provider,
    credibility_score: 0,
    raw_metadata: raw.raw_metadata || {},
  };
  normalized.credibility_score = computeCredibilityScore(normalized);
  return normalized;
}

function deduplicateNormalizedSources(sources = []) {
  const seen = new Map();
  const deduped = [];
  sources.forEach((source) => {
    const key = canonicalizeText(source.url || source.title || source.snippet);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, source);
      deduped.push(source);
      return;
    }

    const currentScore = sourceRankScore(source);
    const existingScore = sourceRankScore(existing);
    if (currentScore > existingScore) {
      const index = deduped.indexOf(existing);
      if (index >= 0) deduped[index] = source;
      seen.set(key, source);
    }
  });
  return deduped.map((source, index) => ({ ...source, id: `src_${index + 1}` }));
}

async function searchWithTavily(query) {
  if (!TAVILY_API_KEY) return [];
  const response = await axios.post(
    "https://api.tavily.com/search",
    {
      api_key: TAVILY_API_KEY,
      query,
      topic: "general",
      search_depth: "advanced",
      max_results: 6,
      include_answer: false,
    },
    { timeout: 10000 }
  );

  return (response.data?.results || []).map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.content,
    published_at: item.published_date || "",
    raw_metadata: { score: item.score },
  }));
}

async function searchWithSerper(query) {
  if (!SERPER_API_KEY) return [];
  const response = await axios.post(
    "https://google.serper.dev/search",
    { q: query, num: 6 },
    {
      timeout: 10000,
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  return (response.data?.organic || []).map((item) => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet,
    published_at: item.date || "",
    raw_metadata: { position: item.position },
  }));
}

function buildStructuredHints(competitor) {
  const key = (competitor || "").toLowerCase().replace(/\s+/g, "");
  return KNOWN_STRUCTURED_HINTS[key] || [];
}

async function fetchRagFallback(competitor, query) {
  try {
    const ragSources = await retrieveRelevantSources(competitor, query, 5);
    return ragSources.map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content,
      published_at: item.date,
      type: item.category,
      raw_metadata: { relevance: item.relevance },
    }));
  } catch (error) {
    console.warn("RAG fallback failed:", error?.message || error);
    return [];
  }
}

function selectProviderOrder() {
  if (RETRIEVAL_PROVIDER === "tavily") return ["tavily"];
  if (RETRIEVAL_PROVIDER === "serper") return ["serper"];
  return ["tavily", "serper"];
}

function normalizeRetrievalMode(mode) {
  const normalized = String(mode || DEFAULT_RETRIEVAL_MODE || "live").toLowerCase();
  return normalized === "live" ? "live" : "demo";
}

export async function retrieveCompetitiveIntelligence(competitor, query, options = {}) {
  const retrievalMode = normalizeRetrievalMode(options.mode);

  // Demo mode is deterministic and avoids live scraping/API dependency during demos.
  if (retrievalMode === "demo") {
    const demoRaw = getDemoSources(competitor, query);
    const demoNormalized = deduplicateNormalizedSources(
      demoRaw.map((item, index) => normalizeSource(item, "demo", index, competitor))
    )
      .sort((a, b) => b.credibility_score - a.credibility_score)
      .slice(0, 10)
      .map((source, index) => ({ ...source, id: `src_${index + 1}` }));

    return {
      sources: demoNormalized,
      provider_used: "demo",
      providers_used: ["demo"],
      fallback_used: false,
      retrieval_mode: "demo",
    };
  }

  const providersUsed = [];
  let liveResults = [];

  for (const provider of selectProviderOrder()) {
    try {
      const results = provider === "tavily" ? await searchWithTavily(query) : await searchWithSerper(query);
      if (results.length) {
        providersUsed.push(provider);
        liveResults.push(...results);
      }
    } catch (error) {
      console.warn(`${provider} retrieval failed:`, error?.message || error);
    }
  }

  // Fetch hard-to-find signals in parallel
  const [scrapedResults, ragResults, githubResults, statusResults, blogResults, jobResults, founderResults, 
          waybackResults, regulatoryResults, appStoreResults, patentResults, communityResults, legalResults, 
          processorResults, breachResults, productHuntResults, newsletterResults, linkedInResults, riskResults] = await Promise.all([
    liveResults.length ? Promise.resolve([]) : scrapeCompetitor(competitor).catch(() => []),
    fetchRagFallback(competitor, query),
    fetchGitHubSignals(competitor),
    fetchStatusPageSignals(competitor),
    fetchEngineeringBlogSignals(competitor),
    fetchJobPostingSignals(competitor),
    fetchFounderSignals(competitor),
    fetchWaybackMachineSignals(competitor),
    fetchRegulatorySignals(competitor),
    fetchAppStoreSignals(competitor),
    fetchPatentTrademarkSignals(competitor),
    fetchCommunityDiscussionSignals(competitor),
    fetchLegalDisputeSignals(competitor),
    fetchPaymentProcessorSignals(competitor),
    fetchDataBreachSignals(competitor),
    fetchProductHuntSignals(competitor),
    fetchEmailNewsletterSignals(competitor),
    fetchLinkedInHiringSignals(competitor),
    fetchRiskSignals(competitor),
  ]);

  if (scrapedResults.length) providersUsed.push("scraper");
  if (ragResults.length) providersUsed.push("rag");
  if (githubResults.length) providersUsed.push("github");
  if (statusResults.length) providersUsed.push("status-page");
  if (blogResults.length) providersUsed.push("engineering-blog");
  if (jobResults.length) providersUsed.push("job-postings");
  if (founderResults.length) providersUsed.push("founder-signals");
  if (waybackResults.length) providersUsed.push("wayback-machine");
  if (regulatoryResults.length) providersUsed.push("regulatory-database");
  if (appStoreResults.length) providersUsed.push("app-store");
  if (patentResults.length) providersUsed.push("patent-trademark");
  if (communityResults.length) providersUsed.push("community-discussion");
  if (legalResults.length) providersUsed.push("legal-disputes");
  if (processorResults.length) providersUsed.push("payment-processor");
  if (breachResults.length) providersUsed.push("data-breach");
  if (productHuntResults.length) providersUsed.push("product-hunt");
  if (newsletterResults.length) providersUsed.push("newsletter");
  if (linkedInResults.length) providersUsed.push("linkedin-hiring");
  if (riskResults.length) providersUsed.push("risk-aggregation");

  const combined = [
    ...liveResults.map((item, index) => normalizeSource(item, item.provider || providersUsed[0] || "live", index, competitor)),
    ...buildStructuredHints(competitor).map((item, index) => normalizeSource(item, "structured", liveResults.length + index, competitor)),
    ...githubResults.map((item, index) => normalizeSource(item, "github", liveResults.length + 5 + index, competitor)),
    ...statusResults.map((item, index) => normalizeSource(item, "status-page", liveResults.length + 10 + index, competitor)),
    ...blogResults.map((item, index) => normalizeSource(item, "engineering-blog", liveResults.length + 15 + index, competitor)),
    ...jobResults.map((item, index) => normalizeSource(item, "job-postings", liveResults.length + 20 + index, competitor)),
    ...founderResults.map((item, index) => normalizeSource(item, "founder-signals", liveResults.length + 25 + index, competitor)),
    ...linkedInResults.map((item, index) => normalizeSource(item, "linkedin-hiring", liveResults.length + 30 + index, competitor)),
    ...waybackResults.map((item, index) => normalizeSource(item, "wayback-machine", liveResults.length + 35 + index, competitor)),
    ...regulatoryResults.map((item, index) => normalizeSource(item, "regulatory-database", liveResults.length + 40 + index, competitor)),
    ...appStoreResults.map((item, index) => normalizeSource(item, "app-store", liveResults.length + 45 + index, competitor)),
    ...patentResults.map((item, index) => normalizeSource(item, "patent-trademark", liveResults.length + 50 + index, competitor)),
    ...communityResults.map((item, index) => normalizeSource(item, "community-discussion", liveResults.length + 55 + index, competitor)),
    ...legalResults.map((item, index) => normalizeSource(item, "legal-disputes", liveResults.length + 60 + index, competitor)),
    ...processorResults.map((item, index) => normalizeSource(item, "payment-processor", liveResults.length + 65 + index, competitor)),
    ...breachResults.map((item, index) => normalizeSource(item, "data-breach", liveResults.length + 70 + index, competitor)),
    ...productHuntResults.map((item, index) => normalizeSource(item, "product-hunt", liveResults.length + 75 + index, competitor)),
    ...newsletterResults.map((item, index) => normalizeSource(item, "newsletter", liveResults.length + 80 + index, competitor)),
    ...riskResults.map((item, index) => normalizeSource(item, "risk-aggregation", liveResults.length + 85 + index, competitor)),
    ...scrapedResults.map((item, index) => normalizeSource(item, "scraper", liveResults.length + 90 + index, competitor)),
    ...ragResults.map((item, index) => normalizeSource(item, "rag", liveResults.length + 100 + index, competitor)),
  ];

  const deduped = deduplicateNormalizedSources(combined)
    .sort((a, b) => sourceRankScore(b) - sourceRankScore(a))
    .slice(0, 25)
    .map((source, index) => ({ ...source, id: `src_${index + 1}` }));
  
  const providerSet = new Set(providersUsed);
  deduped.forEach((source) => {
    if (source.provider) providerSet.add(source.provider);
  });

  return {
    sources: deduped,
    provider_used: providersUsed[0] || (deduped.length ? "structured" : "none"),
    providers_used: [...providerSet],
    fallback_used: !liveResults.length,
    retrieval_mode: "live",
  };
}

export async function fetchSources(competitor, query = null, options = {}) {
  const retrieval = await retrieveCompetitiveIntelligence(
    competitor,
    query || `${competitor} pricing docs reviews launches`,
    options
  );
  return retrieval.sources;
}

export function deduplicateSources(sources = []) {
  return deduplicateNormalizedSources(sources);
}

export function scoreCredibility(source) {
  return source.credibility_score ?? computeCredibilityScore(source);
}
