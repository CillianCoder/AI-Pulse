const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const FormData = require("form-data");

// ---------- CONFIG ----------
const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const NEWS_KEY = process.env.NEWS_KEY;
// -----------------------------

// Keywords
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

const BLOCKED_KEYWORDS = [
  "politics","election","government","senate","president",
  "war","military conflict","terrorist","attack",
  "murder","killed","crime","shooting",
  "soccer","football","NFL","NBA","cricket","sports",
  "celebrity","movie","music","entertainment",
  "health","medicine","covid","hospital",
  "weather","earthquake","storm","flood"
];

const TRUSTED_SOURCES = [
  "techcrunch",
  "the-verge",
  "wired",
  "ars-technica",
  "mit-technology-review",
  "engadget",
  "venturebeat",
  "gizmodo"
];

const HASHTAGS = "#AI #TechNews #Gadgets #Innovation #FutureTech";

// ---------- Utilities ----------
function getPosted(){
  if(!fs.existsSync("posted.json"))
    fs.writeFileSync("posted.json","[]");
  return JSON.parse(fs.readFileSync("posted.json"));
}

function savePosted(url){
  const posted = getPosted();
  posted.push(url);
  fs.writeFileSync("posted.json",JSON.stringify(posted,null,2));
}

function isRelevant(article){
  const text = (article.title + " " + (article.description || "")).toLowerCase();
  const keywordMatch = KEYWORDS.some(k => text.includes(k.toLowerCase()));
  const blockedMatch = BLOCKED_KEYWORDS.some(b => text.includes(b.toLowerCase()));
  const trustedSource = TRUSTED_SOURCES.includes(article.source.id);
  return keywordMatch && !blockedMatch && trustedSource;
}

// ---------- Hook & Engagement ----------
function generateHook(){
  const hooks = [
    "🚀 Tech Update:",
    "⚡ Breaking Tech News:",
    "📰 In Tech Today:",
    "💡 New Development:",
    "📱 Gadget lovers, check this out!"
  ];
  return hooks[Math.floor(Math.random()*hooks.length)];
}

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

// ---------- Quick facts ----------
function extractQuickFacts(text){
  const regex = /(\d+(\.\d+)?\s?(GB|GHz|MP|inch|%|mAh|nm|TB|fps)?)/gi;
  const matches = text.match(regex);
  if(!matches) return "";
  return `Quick fact: ${matches.join(", ")}\n\n`;
}

// ---------- Rewrite news ----------
function rewriteNews(article){
  const hook = generateHook();
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

// ---------- Image functions ----------
async function downloadImage(url,filepath){
  const res = await axios.get(url,{responseType:"arraybuffer"});
  fs.writeFileSync(filepath,res.data);
}

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
    const post = await axios.post(
      `https://graph.facebook.com/${PAGE_ID}/feed`,
      null,
      {params}
    );
    console.log("Posted:",article.title);
    savePosted(article.url);
  }
  catch(err){
    console.log("Failed to post:",err.response?.data || err.message);
  }
}

// ---------- Handle long queries ----------
function chunkKeywords(keywords,maxChars=480){
  const chunks = [];
  let temp = [];
  let length = 0;
  for(const k of keywords){
    if(length + k.length + 4 > maxChars){
      chunks.push(temp);
      temp = [];
      length = 0;
    }
    temp.push(k);
    length += k.length + 4;
  }
  if(temp.length) chunks.push(temp);
  return chunks;
}

async function fetchArticles(){
  const keywordChunks = chunkKeywords(KEYWORDS);
  let allArticles = [];
  for(const chunk of keywordChunks){
    const res = await axios.get("https://newsapi.org/v2/everything",{
      params:{
        q: chunk.join(" OR "),
        language:"en",
        sortBy:"publishedAt",
        pageSize:20,
        apiKey:NEWS_KEY
      }
    });
    allArticles = allArticles.concat(res.data.articles);
  }
  return allArticles;
}

// ---------- Main function ----------
async function postNews(){
  console.log("Fetching AI/Tech news...");
  try{
    let articles = (await fetchArticles()).filter(a=>a.url && isRelevant(a));
    const posted = getPosted();
    const article = articles.find(a=>!posted.includes(a.url));

    if(!article){
      console.log("No new relevant articles to post. Skipping.");
      return;
    }
    await postToFacebook(article);
  }
  catch(err){
    console.log("Error fetching or posting news:",err.response?.data || err.message);
  }
}

// ---------- Schedule 3 posts per day ----------
cron.schedule("0 12,17,22 * * *",()=>{ postNews(); });

// Run immediately
postNews();
