const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

// ---------- CONFIG ----------
const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const NEWS_KEY = process.env.NEWS_KEY;

// ---------- Keywords ----------
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

// ---------- Relevance & Scoring ----------
function relevanceScore(article) {
  const text = (article.title + " " + (article.description||"")).toLowerCase();
  let score = KEYWORDS.reduce((acc,k)=>text.includes(k.toLowerCase()) ? acc+1 : acc,0);
  return score;
}

function viralScore(article) {
  const text = (article.title + " " + (article.description||"")).toLowerCase();
  return VIRAL_KEYWORDS.reduce((acc,k)=>text.includes(k.toLowerCase()) ? acc+10 : acc,0);
}

function detectCompany(article) {
  const text = (article.title + " " + (article.description||"")).toLowerCase();
  return COMPANY_KEYWORDS.find(c=>text.includes(c.toLowerCase()));
}

function isRelevant(article) {
  const text = (article.title + " " + (article.description||"")).toLowerCase();
  const blocked = BLOCKED_KEYWORDS.some(b=>text.includes(b.toLowerCase()));
  const trusted = TRUSTED_SOURCES.includes(article.source.id);
  return !blocked && trusted;
}

// ---------- Dynamic Hook & Engagement ----------
function generateHook(article) {
  const title = article.title || "";
  const company = detectCompany(article);
  const keyword = KEYWORDS.find(k=>title.toLowerCase().includes(k.toLowerCase()));
  if(company) return `🚀 ${company} update: ${title}`;
  if(keyword) return `⚡ ${keyword} news: ${title}`;
  return `📰 ${title}`;
}

function generateEngagement(article) {
  const text = (article.title + " " + (article.description||"")).toLowerCase();
  const questions = [
    `What are your thoughts on this?`,
    `How do you see this impacting the industry?`,
    `Could this change the future of tech?`,
    `Would you try this innovation?`,
    `Do you think this is a breakthrough?`
  ];
  const viralCount = VIRAL_KEYWORDS.filter(k=>text.includes(k.toLowerCase())).length;
  return questions[Math.min(viralCount, questions.length-1)];
}

function extractQuickFacts(text) {
  const regex=/(\d+(\.\d+)?\s?(GB|GHz|MP|inch|%|mAh|nm|TB|fps)?)/gi;
  const matches=text.match(regex);
  if(!matches) return "";
  return `Quick fact: ${matches.join(", ")}\n\n`;
}

function generateHashtags(article){
  const text=(article.title+" "+(article.description||"")).toLowerCase();
  const tags=[];
  KEYWORDS.forEach(k=>{ if(text.includes(k.toLowerCase())) tags.push(`#${k.replace(/\s+/g,"")}`); });
  return tags.length?tags.slice(0,10).join(" "):"#TechNews";
}

function rewriteNews(article){
  const hook=generateHook(article);
  const engagement=generateEngagement(article);
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

// ---------- Axios ----------
const axiosWithTimeout = (url, params, timeout=10000) => {
  return axios.get(url, {params, timeout}).catch(err=>{
    console.log("Axios request failed or timed out:", err.message);
    return { data: { articles: [] } };
  });
};

// ---------- Image ----------
async function downloadImage(url,filepath){
  const res=await axiosWithTimeout(url,{responseType:"arraybuffer"});
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
    }catch(err){ console.log("Image upload failed, posting text only:",err.message);}
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
  }catch(err){ console.log("Failed to post:",err.response?.data||err.message);}
}

// ---------- Main ----------
async function postNews(){
  console.log("Fetching AI/Tech news...");

  const posted=getPosted();
  const lastCompany=getLastCompany();

  const fetchArticles=async (keywords, limit=20)=>{
    let articles=[];
    let currentQuery="";
    const chunks=[];
    for(const k of keywords){
      if((currentQuery+" OR "+k).length>500){ chunks.push(currentQuery); currentQuery=k;}
      else currentQuery+=(currentQuery?" OR ":"")+k;
    }
    if(currentQuery) chunks.push(currentQuery);

    for(const chunk of chunks){
      const res=await axiosWithTimeout("https://newsapi.org/v2/everything",{
        q:chunk,language:"en",sortBy:"publishedAt",pageSize:limit,apiKey:NEWS_KEY
      });
      if(res.data.articles?.length) articles=articles.concat(res.data.articles.filter(a=>a.url && isRelevant(a)));
    }
    return articles;
  };

  // 1️⃣ Try main keywords
  let articles = await fetchArticles(KEYWORDS);

  // Remove same company as last
  articles = articles.filter(a=>detectCompany(a)!==lastCompany);

  // If no articles, try fallback keywords
  if(!articles.length){
    console.log("No new relevant articles. Trying fallback keywords...");
    const fallback = ["AI","tech news","innovation"];
    articles = await fetchArticles(fallback,10);
  }

  // 2️⃣ Always select the best article
  if(!articles.length){
    console.log("No articles found, skipping this run.");
    return;
  }

  articles.sort((a,b)=>{
    return (relevanceScore(b)+viralScore(b)) - (relevanceScore(a)+viralScore(a));
  });

  const article=articles.find(a=>!posted.includes(a.url))||articles[0];
  await postToFacebook(article);
}

// ---------- Run ----------
postNews().then(()=>console.log("Bot finished successfully")).catch(err=>console.log("Bot error:",err));
