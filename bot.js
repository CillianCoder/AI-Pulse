const axios = require("axios");
const cron = require("node-cron");
const fs = require("fs");
const FormData = require("form-data");

// ---------- CONFIG ----------
const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const NEWS_KEY = process.env.NEWS_KEY; // NewsAPI key
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

const VIRAL_KEYWORDS = ["AI breakthrough","viral","trending","major update","explosive","shocking","game changer"];
const COMPANY_KEYWORDS = ["Apple","Samsung","Google","Microsoft","Meta","Tesla","Nvidia","Intel","AMD","OpenAI"];
const BLOCKED_KEYWORDS = [
  "politics","election","government","senate","president",
  "war","military conflict","terrorist","attack",
  "murder","killed","crime","shooting",
  "socc","football","NFL","NBA","cricket","sports",
  "celebrity","movie","music","entertainment",
  "health","medicine","covid","hospital",
  "weather","earthquake","storm","flood"
];
const TRUSTED_SOURCES = [
  "techcrunch","the-verge","wired","ars-technica","mit-technology-review",
  "engadget","venturebeat","gizmodo"
];

// ---------- Files ----------
function getPosted() {
  if (!fs.existsSync("posted.json")) fs.writeFileSync("posted.json","[]");
  return JSON.parse(fs.readFileSync("posted.json"));
}
function savePosted(url) {
  const posted = getPosted();
  posted.push(url);
  fs.writeFileSync("posted.json", JSON.stringify(posted,null,2));
}
function getLastCompany() {
  if (!fs.existsSync("last_company.json")) fs.writeFileSync("last_company.json", JSON.stringify({company:""}));
  return JSON.parse(fs.readFileSync("last_company.json")).company;
}
function saveLastCompany(company) {
  fs.writeFileSync("last_company.json", JSON.stringify({company}));
}

// ---------- Relevance ----------
function isRelevant(article) {
  const text = (article.title + " " + (article.description||"")).toLowerCase();
  const keywordMatch = KEYWORDS.some(k=>text.includes(k.toLowerCase()));
  const blockedMatch = BLOCKED_KEYWORDS.some(b=>text.includes(b.toLowerCase()));
  const trustedSource = TRUSTED_SOURCES.includes(article.source.id);
  return keywordMatch && !blockedMatch && trustedSource;
}

// ---------- Viral Score ----------
function viralScore(article) {
  const text = (article.title + " " + (article.description||"")).toLowerCase();
  let score=0;
  VIRAL_KEYWORDS.forEach(k=>{ if(text.includes(k.toLowerCase())) score+=10; });
  return score;
}

// ---------- Company Detection ----------
function detectCompany(article) {
  const text = (article.title + " " + (article.description||"")).toLowerCase();
  return COMPANY_KEYWORDS.find(c=>text.includes(c.toLowerCase()));
}

// ---------- Hook & Engagement ----------
function generateHookDynamic(article) {
  const title = article.title || "";
  const company = detectCompany(article);
  const techTerm = KEYWORDS.find(k=>title.toLowerCase().includes(k.toLowerCase()));
  let hook = "🚀 ";
  if(company) hook += `${company} update: ${title}`;
  else if(techTerm) hook += `${techTerm} news: ${title}`;
  else hook += title;
  return hook;
}

function generateEngagementLine(article) {
  const text = (article.title + " " + (article.description || "")).trim();

  if (/AI|machine learning|ChatGPT|OpenAI/i.test(text)) {
    return "Do you think AI will change the world soon? 🤔";
  }
  if (/tech|innovation|startup/i.test(text)) {
    return "Could this innovation shape the future? 🚀";
  }
  if (/Apple|Samsung|Google|Microsoft|Meta|Tesla/i.test(text)) {
    const company = detectCompany(article) || "This company";
    return `${company} just made a move — what’s your take? 📱💻`;
  }
  if (/VR|AR|mixed reality|robotics|automation/i.test(text)) {
    return "Would you use this new technology? 🤖";
  }

  return "What are your thoughts on this update? 💡";
}

// ---------- Quick Facts ----------
function extractQuickFacts(text) {
  const regex=/(\d+(\.\d+)?\s?(GB|GHz|MP|inch|%|mAh|nm|TB|fps)?)/gi;
  const matches=text.match(regex);
  if(!matches) return "";
  return `Quick fact: ${matches.join(", ")}\n\n`;
}

// ---------- Dynamic Hashtags ----------
function generateHashtags(article){
  const text=(article.title+" "+(article.description||"")).toLowerCase();
  const tags=[];
  KEYWORDS.forEach(k=>{ if(text.includes(k.toLowerCase())) tags.push(`#${k.replace(/\s+/g,"")}`); });
  if(tags.length===0) return "#TechNews";
  return tags.slice(0,10).join(" ");
}

// ---------- Rewrite News ----------
function rewriteNews(article){
  const hook=generateHookDynamic(article);
  const engagement=generateEngagementLine(article);
  const baseSummary=article.description||"";
  let extraContext="";
  if(baseSummary.length<150) extraContext="In this update, we break down the key points and what it means for tech enthusiasts.";
  const quickFacts=extractQuickFacts(article.title+" "+baseSummary);
  const hashtags=generateHashtags(article);

  return `${hook}

${article.title}

${baseSummary}${baseSummary&&!baseSummary.endsWith(".")?".":""} ${extraContext}

${quickFacts}${engagement}

Source:
${article.url}

${hashtags}`;
}

// ---------- Image ----------
async function downloadImage(url,filepath){
  const res=await axios.get(url,{responseType:"arraybuffer"});
  fs.writeFileSync(filepath,res.data);
}
async function uploadPhoto(filepath,caption){
  const form=new FormData();
  form.append("access_token",PAGE_TOKEN);
  form.append("published","false");
  form.append("caption",caption);
  form.append("source",fs.createReadStream(filepath));
  const res=await axios.post(`https://graph.facebook.com/${PAGE_ID}/photos`,form,{headers:form.getHeaders()});
  return res.data.id;
}

// ---------- Post ----------
async function postToFacebook(article){
  const message=rewriteNews(article);
  let media_id;
  if(article.urlToImage){
    try{
      await downloadImage(article.urlToImage,"temp.jpg");
      media_id=await uploadPhoto("temp.jpg",message);
    }catch(err){
      console.log("Image upload failed, posting text only:",err.message);
    }
  }

  const params={message,access_token:PAGE_TOKEN};
  if(media_id) params.attached_media=JSON.stringify([{media_fbid:media_id}]);
  if(!media_id) params.link=article.url;

  try{
    await axios.post(`https://graph.facebook.com/${PAGE_ID}/feed`,null,{params});
    console.log("Posted:",article.title);
    savePosted(article.url);
    const company=detectCompany(article);
    if(company) saveLastCompany(company);
  }catch(err){
    console.log("Failed to post:",err.response?.data||err.message);
  }
}

// ---------- Main ----------
async function postNews(){
  console.log("Fetching AI/Tech news...");
  try{
    // Split query to avoid too long errors
    const queryChunks=[];
    let currentQuery="";
    for(const k of KEYWORDS){
      if((currentQuery+" OR "+k).length>500){
        queryChunks.push(currentQuery);
        currentQuery=k;
      }else{
        currentQuery+=(currentQuery?" OR ":"")+k;
      }
    }
    if(currentQuery) queryChunks.push(currentQuery);

    let articles=[];
    for(const chunk of queryChunks){
      const res=await axios.get("https://newsapi.org/v2/everything",{
        params:{q:chunk,language:"en",sortBy:"publishedAt",pageSize:20,apiKey:NEWS_KEY}
      });
      articles=articles.concat(res.data.articles.filter(a=>a.url && isRelevant(a)));
    }

    // Remove same company as last
    const lastCompany=getLastCompany();
    articles=articles.filter(a=>detectCompany(a)!==lastCompany);

    // Sort by viral score
    articles.sort((a,b)=>viralScore(b)-viralScore(a));

    const posted=getPosted();
    const article=articles.find(a=>!posted.includes(a.url));

    if(!article){
      console.log("No new relevant articles. Trying fallback keywords...");
      // fallback - related tech/AI only
      for(const fb of ["tech news","AI","innovation"]){
        const res=await axios.get("https://newsapi.org/v2/everything",{
          params:{q:fb,language:"en",sortBy:"publishedAt",pageSize:10,apiKey:NEWS_KEY}
        });
        const fallbackArticles=res.data.articles.filter(a=>a.url && isRelevant(a) && !posted.includes(a.url));
        if(fallbackArticles.length>0){
          await postToFacebook(fallbackArticles[0]);
          return;
        }
      }
      return;
    }

    await postToFacebook(article);

  }catch(err){
    console.log("Error fetching or posting news:",err.response?.data||err.message);
  }
}

// ---------- Schedule 3 posts/day ----------
cron.schedule("0 12,17,22 * * *",()=>postNews());

// Run immediately
postNews();
