'use strict';
// Version 3 separates analytics from optional advertising measurement.
const CONSENT_VERSION=3;
const ANALYTICS_HOST=['mariliamendesterapiasmanuais.pt','www.mariliamendesterapiasmanuais.pt'].includes(location.hostname);
const CONSENT_KEY='mm-consent';
const integrations={analytics:ANALYTICS_HOST,marketing:ANALYTICS_HOST,gtmId:'GTM-NR342FW8',ga4Id:'G-BRBKXS7PHG',googleAdsId:null};
let managerLoaded=false;
function loadManager(){
 if(managerLoaded||!integrations.analytics||!consent.analytics)return;
 managerLoaded=true;
 window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});
 const tag=document.createElement('script');tag.async=true;tag.src='https://www.googletagmanager.com/gtm.js?id='+integrations.gtmId;document.head.appendChild(tag);
}
window.dataLayer=window.dataLayer||[];
function gtag(){window.dataLayer.push(arguments)}
window.gtag=gtag;
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',functionality_storage:'granted',security_storage:'granted'});
let consent={analytics:false,marketing:false,version:CONSENT_VERSION};
let saved=false;try{const s=JSON.parse(localStorage.getItem(CONSENT_KEY));if(s&&s.version===CONSENT_VERSION&&s.updatedAt&&Date.now()-Date.parse(s.updatedAt)<180*24*60*60*1000){consent=s;saved=true}}catch{}
function updateConsent(){gtag('consent','update',{analytics_storage:consent.analytics&&integrations.analytics?'granted':'denied',ad_storage:consent.marketing&&integrations.marketing?'granted':'denied',ad_user_data:consent.marketing&&integrations.marketing?'granted':'denied',ad_personalization:'denied'})}
updateConsent();
loadManager();
function track(event,values={}){if(consent.analytics&&integrations.analytics)window.dataLayer.push({event,...values})}
const menu=document.querySelector('.menu'),nav=document.querySelector('.navlinks');
function closeMenu(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Abrir menu')}
menu.addEventListener('click',()=>{let open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Fechar menu':'Abrir menu')});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{track('menu_click',{destination:a.hash});closeMenu()}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){closeMenu();menu.focus()}});
document.querySelectorAll('[data-wa]').forEach(a=>a.addEventListener('click',()=>{track('whatsapp_click',{placement:a.dataset.wa})}));
document.querySelectorAll('details').forEach((d,i)=>d.addEventListener('toggle',()=>{if(d.open)track('faq_open',{question_index:i+1})}));
const dialog=document.querySelector('#preferences'),banner=document.querySelector('#cookie-banner');
function syncMeasurement(){const a=document.querySelector('#analytics'),m=document.querySelector('#marketing');m.disabled=!a.checked;if(!a.checked)m.checked=false}
function openPreferences(){document.querySelector('#analytics').checked=consent.analytics;document.querySelector('#marketing').checked=consent.marketing;syncMeasurement();dialog.showModal()}
document.querySelector('#analytics').addEventListener('change',syncMeasurement);
document.querySelectorAll('[data-cookies]').forEach(b=>b.addEventListener('click',openPreferences));
document.querySelector('.close').addEventListener('click',()=>dialog.close());
function save(a,m){const revoke=managerLoaded&&(!a||(consent.marketing&&!m));consent={analytics:!!a,marketing:!!a&&!!m,version:CONSENT_VERSION,updatedAt:new Date().toISOString()};try{localStorage.setItem(CONSENT_KEY,JSON.stringify(consent))}catch{}updateConsent();banner.hidden=true;dialog.close();if(revoke){document.cookie.split(';').forEach(c=>{const n=c.split('=')[0].trim();if(/^(_ga(?:_|$)|_gid$|_gat(?:_|$)|_gcl(?:_|$))/.test(n)){for(const d of ['',location.hostname,'.'+location.hostname])document.cookie=n+'=; Max-Age=0; path=/'+(d?'; domain='+d:'')}});location.reload();return}loadManager()}
document.querySelectorAll('[data-consent]').forEach(b=>b.addEventListener('click',()=>save(b.dataset.consent==='all',b.dataset.consent==='all')));
document.querySelector('#save-consent').addEventListener('click',()=>save(document.querySelector('#analytics').checked,document.querySelector('#marketing').checked));
if(!saved)banner.hidden=false;
document.querySelectorAll('[data-year]').forEach(e=>e.textContent=new Date().getFullYear());
const depths=new Set();addEventListener('scroll',()=>{const max=document.documentElement.scrollHeight-innerHeight;if(max<=0)return;const p=Math.round(scrollY/max*100);[25,50,75,90].forEach(n=>{if(p>=n&&!depths.has(n)){depths.add(n);track('scroll_depth',{percent:n})}})},{passive:true});

