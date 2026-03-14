const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const FormData = require("form-data");

// ---------- CONFIG ----------
const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const NEWS_KEY = process.env.NEWS_KEY;
// -----------------------------

const KEYWORDS = [
  "AI","artificial intelligence","machine learning",
  "technology","Apple","Samsung","gadgets",
  "laptop","mobile","innovation","VR","AR","chip"
];

const BLOCKED_KEYWORDS = [
  "politics","health","NFL","Trump","soccer","football"
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

  const keywordMatch = KEYWORDS.some(k =>
    text.includes(k.toLowerCase())
  );

  const blockedMatch = BLOCKED_KEYWORDS.some(b =>
    text.includes(b.toLowerCase())
  );

  const trustedSource = TRUSTED_SOURCES.includes(article.source.id);

  return keywordMatch && !blockedMatch && trustedSource;
}


// ---------- Hook generator ----------

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

  const hook = generateHook();
  const engagement = generateEngagementLine();

  const baseSummary = article.description || "";

  let extraContext = "";

  if(baseSummary.length < 150){
    extraContext =
      "In this update, we break down the key points and what it means for tech enthusiasts.";
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

  const params = {
    message,
    access_token: PAGE_TOKEN
  };

  if(media_id)
    params.attached_media = JSON.stringify([{media_fbid:media_id}]);

  if(!media_id)
    params.link = article.url;

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


// ---------- Main function ----------

async function postNews(){

  console.log("Fetching AI/Tech news...");

  try{

    const res = await axios.get(
      "https://newsapi.org/v2/everything",
      {
        params:{
          q: KEYWORDS.join(" OR "),
          language:"en",
          sortBy:"publishedAt",
          pageSize:20,
          apiKey:NEWS_KEY
        }
      }
    );

    const articles = res.data.articles.filter(a => a.url && isRelevant(a));

    const posted = getPosted();

    const article = articles.find(a => !posted.includes(a.url));

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

cron.schedule("0 12,17,22 * * *",()=>{

  postNews();

});


// Run immediately
postNews();
