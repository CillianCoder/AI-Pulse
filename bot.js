const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const FormData = require("form-data");

// ---------- CONFIG ----------
const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const NEWS_KEY = process.env.NEWS_KEY; // NewsAPI key
// -----------------------------

const KEYWORDS = ["AI", "artificial intelligence", "machine learning", "technology", "Apple", "Samsung", "gadgets"];
const NEGATIVE_KEYWORDS = ["health", "politics", "sports", "entertainment", "covid", "vaccine", "trump", "election"];
const SOURCES = ["techcrunch.com","theverge.com","wired.com","thenextweb.com","engadget.com"];
const HASHTAGS = "#AI #TechNews #Gadgets #Innovation #FutureTech";

// ---------- Utilities ----------
function getPosted() {
  if (!fs.existsSync("posted.json")) fs.writeFileSync("posted.json", "[]");
  return JSON.parse(fs.readFileSync("posted.json"));
}

function savePosted(url) {
  const posted = getPosted();
  posted.push(url);
  fs.writeFileSync("posted.json", JSON.stringify(posted, null, 2));
}

// Check article relevance
function isRelevant(article) {
  const text = (article.title + " " + (article.description || "")).toLowerCase();
  const hasKeyword = KEYWORDS.some(k => new RegExp(`\\b${k.toLowerCase()}\\b`).test(text));
  const hasNegative = NEGATIVE_KEYWORDS.some(k => new RegExp(`\\b${k.toLowerCase()}\\b`).test(text));
  return hasKeyword && !hasNegative;
}

// Create attention hook
function generateHook() {
  const hooks = [
    `🤖 Breaking AI & Tech News!`,
    `📱 Gadget lovers, check this out!`,
    `🚀 Latest in tech today:`,
    `💡 Did you hear about this?`
  ];
  return hooks[Math.floor(Math.random() * hooks.length)];
}

// Extract quick facts (number + unit/keyword)
function extractQuickFacts(text) {
  const regex = /(\d+(\.\d+)?\s?(GB|GHz|MP|inch|%|mAh|nm|TB|fps|MPx)?)/gi;
  const matches = text.match(regex);
  if (!matches) return "";
  return `Quick fact: ${matches.join(", ")}\n\n`;
}

// Generate human-friendly summary
function rewriteNews(article) {
  const hook = generateHook();
  const baseSummary = article.description || "";
  const enhancedSummary = `${article.title}\n\n${baseSummary}${baseSummary && !baseSummary.endsWith(".") ? "." : ""}`;
  const quickFacts = extractQuickFacts(article.title + " " + baseSummary);
  return `${hook}\n\n${enhancedSummary}\n\n${quickFacts}Source: ${article.url}\n\n${HASHTAGS}`;
}

// Download image
async function downloadImage(url, filepath) {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  fs.writeFileSync(filepath, res.data);
}

// Upload photo
async function uploadPhoto(filepath, caption) {
  const form = new FormData();
  form.append("access_token", PAGE_TOKEN);
  form.append("published", "false");
  form.append("caption", caption);
  form.append("source", fs.createReadStream(filepath));
  const res = await axios.post(`https://graph.facebook.com/${PAGE_ID}/photos`, form, {
    headers: form.getHeaders()
  });
  return res.data.id;
}

// Post to FB
async function postToFacebook(article) {
  const message = rewriteNews(article);
  let media_id;
  if (article.urlToImage) {
    try {
      await downloadImage(article.urlToImage, "temp.jpg");
      media_id = await uploadPhoto("temp.jpg", message);
    } catch (err) {
      console.log("Image upload failed, posting text + link only:", err.message);
    }
  }

  const params = { message, access_token: PAGE_TOKEN };
  if (media_id) params.attached_media = JSON.stringify([{ media_fbid: media_id }]);
  if (!media_id) params.link = article.url;

  try {
    const post = await axios.post(`https://graph.facebook.com/${PAGE_ID}/feed`, null, { params });
    console.log("Posted:", article.title);
    savePosted(article.url);
  } catch (err) {
    console.log("Failed to post:", err.response?.data || err.message);
  }
}

// Main function
async function postNews() {
  console.log("Fetching AI/Tech news...");
  try {
    const res = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: KEYWORDS.join(" OR "),
        language: "en",
        sortBy: "publishedAt",
        pageSize: 10,
        apiKey: NEWS_KEY,
        domains: SOURCES.join(",") // restrict to tech sources
      }
    });

    const articles = res.data.articles.filter(a => a.url && isRelevant(a));
    const posted = getPosted();
    const article = articles.find(a => !posted.includes(a.url));

    if (!article) {
      console.log("No new relevant articles to post. Skipping.");
      return;
    }

    await postToFacebook(article);
  } catch (err) {
    console.log("Error fetching or posting news:", err.response?.data || err.message);
  }
}

// ---------- Schedule 3 posts per day (ET ~8AM,1PM,6PM) ----------
cron.schedule("0 12,17,22 * * *", () => {
  postNews();
});

// Run immediately
postNews();
