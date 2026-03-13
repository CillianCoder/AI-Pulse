const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const FormData = require("form-data");

// ---------- CONFIG ----------
const PAGE_ID = "109405698209031"; // Your Facebook Page ID
const PAGE_TOKEN = "EAAaUrWRttLgBQ37cML0QLznMeM5N23lggZB3bekf4GAfym3gSt4ZBJ9amO2qJMEB18j2o15ZARQNelmxis0WcKQUFQSJnhz3It3XGqwZBJty15th0vCUjMfDq5WBawPerA768w7pTFE9zjAHwuKJIuIVaOHQq0kDStwwaXeEIbcRPmJZCOX87jrm7x5ivcz4P9If0J10ZCZAViAvnxdCOEZD"; // Page access token
const NEWS_KEY = "aa6f0414aa214fb28894bf8504911f80"; // NewsAPI key
// -----------------------------

const KEYWORDS = ["AI", "artificial intelligence", "machine learning", "technology", "Apple", "Samsung", "gadgets"];
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

function isRelevant(article) {
  const text = (article.title + " " + (article.description || "")).toLowerCase();
  return KEYWORDS.some(k => text.includes(k.toLowerCase()));
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

// Extract meaningful quick facts (number + unit/keyword)
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
  const enhancedSummary = `${article.title}\n\n${baseSummary} ${
    baseSummary && !baseSummary.endsWith(".") ? "." : ""
  }`;
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
        pageSize: 5,
        apiKey: NEWS_KEY
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