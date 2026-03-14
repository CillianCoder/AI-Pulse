const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const FormData = require("form-data");

// ---------- CONFIG ----------
const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const NEWS_KEY = process.env.NEWS_KEY;

// Main keywords for tech relevance
const KEYWORDS = [
  "AI","artificial intelligence","machine learning","deep learning",
  "technology","tech",
  "Apple","Samsung","Google","Microsoft","Meta","Tesla","Nvidia","Intel","AMD",
  "OpenAI","ChatGPT","Gemini","Claude",
  "smartphone","mobile","iPhone","Android",
  "laptop","PC","computer","processor","chip","GPU","CPU",
  "robot","robotics","automation",
  "VR","AR","mixed reality",
  "startup","tech startup","innovation",
  "cybersecurity","hacking","data breach",
  "software","app","update","operating system",
  "electric vehicle","EV","self-driving",
  "space technology","satellite","SpaceX"
];

// Viral keywords to boost engagement
const VIRAL_KEYWORDS = [
  "leak", "rumor", "revealed", "breaking", "hack",
  "secret", "exclusive", "first look", "launch",
  "update", "upgrade", "new release", "trend", "innovation"
];

// Blocked keywords to avoid non-tech news
const BLOCKED_KEYWORDS = [
  "politics","election","government","senate","president",
  "war","military conflict","terrorist","attack",
  "murder","killed","crime","shooting",
  "soccer","football","NFL","NBA","cricket","sports",
  "celebrity","movie","music","entertainment",
  "health","medicine","covid","hospital",
  "weather","earthquake","storm","flood"
];

// Trusted sources
const TRUSTED_SOURCES = [
  "techcrunch","the-verge","wired","ars-technica",
  "mit-technology-review","engadget","venturebeat","gizmodo"
];

// Fallback keywords if nothing relevant is found
const FALLBACK_KEYWORDS = [
  "technology","innovation","AI","gadgets","startups","future tech"
];

const HASHTAGS = "#AI #TechNews #Gadgets #Innovation #FutureTech";

// ---------- Utilities ----------
function getPosted(){
  if(!fs.existsSync("posted.json")) fs.writeFileSync("posted.json","[]");
  return JSON.parse(fs.readFileSync("posted.json"));
}

function savePosted(url){
  const posted = getPosted();
  posted.push(url);
  fs.writeFileSync("posted.json",JSON.stringify(posted,null,2));
}

// Save last company posted to prevent repeats
function getLastCompany(){
  if(!fs.existsSync("company.json")) fs.writeFileSync("company.json","{}");
  return JSON.parse(fs.readFileSync("company.json"));
}

function saveLastCompany(company){
  fs.writeFileSync("company.json",JSON.stringify({company},null,2));
}

// Check article relevance
function isRelevant(article){
  const text = (article.title + " " + (article.description || "")).toLowerCase();
  const keywordMatch = KEYWORDS.some(k => text.includes(k.toLowerCase()));
  const blockedMatch = BLOCKED_KEYWORDS.some(b => text.includes(b.toLowerCase()));
  const trustedSource = TRUSTED_SOURCES.includes(article.source.id);
  return keywordMatch && !blockedMatch && trustedSource;
}

// Detect main company in article title
function detectCompany(article){
  const companies = ["Apple","Samsung","Google","Microsoft","Meta","Tesla","Nvidia","Intel","AMD","OpenAI"];
  const text = (article.title + " " + (article.description || "")).toLowerCase();
  for(const company of companies){
    if(text.includes(company.toLowerCase())) return company;
  }
  return null;
}

// ---------- Viral scoring ----------
function getViralScore(article){
  const text = (article.title + " " + (article.description || "")).toLowerCase();
  let score = 0;
  VIRAL_KEYWORDS.forEach(word=>{
    if(text.includes(word.toLowerCase())) score += 1;
  });
  return score;
}

// ---------- Hook generator ----------
function generateHook(article){
  // Optionally make hook title-based
  const hooks = [
    "🚀 Tech Update:",
    "⚡ Breaking Tech News:",
    "📰 In Tech Today:",
    "💡 New Development:",
    "📱 Gadget lovers, check this out!"
  ];
  // If article has a company, include it
  const company = detectCompany(article);
  if(company) return `💼 ${company} News:`;
  return hooks[Math.floor(Math.random()*hooks.length)];
}

// ---------- Engagement line ----------
function generateEngagementLine(){
  const lines = [
    "What do you think about this development? 🤔",
    "Could this shape the future of technology?",
    "Tech is evolving fast — your thoughts?",
    "Would you use this technology?",
    "Is this a big step forward for tech?"
  ];
  return lines[Math.floor(Math.random()*lines.length)];
}

// ---------- Quick facts extractor ----------
function extractQuickFacts(text){
  const regex = /(\d+(\.\d+)?\s?(GB|GHz|MP|inch|%|mAh|nm|TB|fps)?)/gi;
  const matches = text.match(regex);
  if(!matches) return "";
  return `Quick fact: ${matches.join(", ")}\n\n`;
}

// ---------- Rewrite news ----------
function rewriteNews(article){
  const hook = generateHook(article);
  const engagement = generateEngagementLine();
  const baseSummary = article.description || "";

  let extraContext = "";
  if(baseSummary.length < 150){
    extraContext = "In this update, we break down the key points and what it means for tech enthusiasts.";
  }

  const quickFacts = extractQuickFacts(article.title + " " + baseSummary);

  return `${hook}

${article.title}

${baseSummary}${baseSummary && !baseSummary.endsWith(".") ? "." : ""} ${extraContext}

${quickFacts}${engagement}

Source:
${article.url}

${HASHTAGS}`;
}

// ---------- Download image ----------
async function downloadImage(url,filepath){
  const res = await axios.get(url,{responseType:"arraybuffer"});
  fs.writeFileSync(filepath,res.data);
}

// ---------- Upload photo ----------
async function uploadPhoto(filepath,caption){
  const form = new FormData();
  form.append("access_token",PAGE_TOKEN);
  form.append("published","false");
  form.append("caption",caption);
  form.append("source",fs.createReadStream(filepath));
  const res = await axios.post(
    `https://graph.facebook.com/${PAGE_ID}/photos`,
    form,
    {headers:form.getHeaders()}
  );
  return res.data.id;
}

// ---------- Post to Facebook ----------
async function postToFacebook(article){
  const message = rewriteNews(article);
  let media_id;
  if(article.urlToImage){
    try{
      await downloadImage(article.urlToImage,"temp.jpg");
      media_id = await uploadPhoto("temp.jpg",message);
    }
    catch(err){
      console.log("Image upload failed, posting text only:",err.message);
    }
  }

  const params = { message, access_token: PAGE_TOKEN };
  if(media_id) params.attached_media = JSON.stringify([{media_fbid:media_id}]);
  if(!media_id) params.link = article.url;

  try{
    const post = await axios.post(`https://graph.facebook.com/${PAGE_ID}/feed`, null, {params});
    console.log("Posted:",article.title);
    savePosted(article.url);

    // Save last company to prevent repeats
    const company = detectCompany(article);
    if(company) saveLastCompany(company);

  }
  catch(err){
    console.log("Failed to post:",err.response?.data || err.message);
  }
}

// ---------- Main function ----------
async function postNews(){
  console.log("Fetching AI/Tech news...");
  try{
    // Normal search first
    let res = await axios.get("https://newsapi.org/v2/everything",{
      params:{
        q: KEYWORDS.join(" OR "),
        language:"en",
        sortBy:"publishedAt",
        pageSize:20,
        apiKey:NEWS_KEY
      }
    });

    let articles = res.data.articles.filter(a => a.url && isRelevant(a));

    // If nothing found, fallback search
    if(articles.length === 0){
      console.log("No articles found, using fallback keywords...");
      res = await axios.get("https://newsapi.org/v2/everything",{
        params:{
          q: FALLBACK_KEYWORDS.join(" OR "),
          language:"en",
          sortBy:"publishedAt",
          pageSize:20,
          apiKey:NEWS_KEY
        }
      });
      articles = res.data.articles.filter(a => a.url && isRelevant(a));
    }

    // Sort by viral score
    articles = articles.sort((a,b)=>getViralScore(b)-getViralScore(a));

    const posted = getPosted();
    const lastCompany = getLastCompany().company;

    // Skip same company as last posted
    const article = articles.find(a => {
      const company = detectCompany(a);
      return !posted.includes(a.url) && company !== lastCompany;
    });

    if(!article){
      console.log("No new relevant articles to post. Skipping.");
      return;
    }

    await postToFacebook(article);

  }catch(err){
    console.log("Error fetching or posting news:",err.response?.data || err.message);
  }
}

// ---------- Schedule 3 posts per day ----------
cron.schedule("0 12,17,22 * * *",()=>{ postNews(); });

// Run immediately
postNews();
