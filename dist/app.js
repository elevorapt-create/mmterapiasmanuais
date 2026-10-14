'use strict';
// Increase CONSENT_VERSION and enable categories only after provider/legal review.
const CONSENT_VERSION=1;
const integrations={analytics:false,marketing:false,gtmId:null,ga4Id:null,googleAdsId:null};
window.dataLayer=window.dataLayer||[];
function gtag(){window.dataLayer.push(arguments)}
window.gtag=gtag;
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',functionality_storage:'granted',security_storage:'granted'});
let consent={analytics:false,marketing:false,version:CONSENT_VERSION};
let saved=false;try{const s=JSON.parse(localStorage.getItem('mm-consent'));if(s&&s.version===CONSENT_VERSION){consent=s;saved=true}}catch{}
function updateConsent(){gtag('consent','update',{analytics_storage:consent.analytics&&integrations.analytics?'granted':'denied',ad_storage:consent.marketing&&integrations.marketing?'granted':'denied',ad_user_data:consent.marketing&&integrations.marketing?'granted':'denied',ad_personalization:consent.marketing&&integrations.marketing?'granted':'denied'})}
updateConsent();
function track(event,values={}){if(consent.analytics&&integrations.analytics)window.dataLayer.push({event,...values})}
const menu=document.querySelector('.menu'),nav=document.querySelector('.navlinks');
function closeMenu(){nav.classList.remove('open');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Abrir menu')}
menu.addEventListener('click',()=>{let open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Fechar menu':'Abrir menu')});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{track('menu_click',{destination:a.hash});closeMenu()}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('open')){closeMenu();menu.focus()}});
document.querySelectorAll('[data-wa]').forEach(a=>a.addEventListener('click',()=>{track('whatsapp_click',{placement:a.dataset.wa});track('whatsapp_'+a.dataset.wa)}));
document.querySelectorAll('details').forEach((d,i)=>d.addEventListener('toggle',()=>{if(d.open)track('faq_open',{question_index:i+1})}));
const dialog=document.querySelector('#preferences'),banner=document.querySelector('#cookie-banner');
function openPreferences(){document.querySelector('#analytics').checked=consent.analytics;document.querySelector('#marketing').checked=consent.marketing;dialog.showModal()}
document.querySelectorAll('[data-cookies]').forEach(b=>b.addEventListener('click',openPreferences));
document.querySelector('.close').addEventListener('click',()=>dialog.close());
function save(a,m){consent={analytics:a,marketing:m,version:CONSENT_VERSION,updatedAt:new Date().toISOString()};try{localStorage.setItem('mm-consent',JSON.stringify(consent))}catch{}updateConsent();banner.hidden=true;dialog.close()}
document.querySelectorAll('[data-consent]').forEach(b=>b.addEventListener('click',()=>save(b.dataset.consent==='all',b.dataset.consent==='all')));
document.querySelector('#save-consent').addEventListener('click',()=>save(document.querySelector('#analytics').checked,document.querySelector('#marketing').checked));
if(!saved)banner.hidden=false;
document.querySelectorAll('[data-year]').forEach(e=>e.textContent=new Date().getFullYear());
const depths=new Set();addEventListener('scroll',()=>{const max=document.documentElement.scrollHeight-innerHeight;if(max<=0)return;const p=Math.round(scrollY/max*100);[25,50,75,90].forEach(n=>{if(p>=n&&!depths.has(n)){depths.add(n);track('scroll_depth',{percent:n})}})},{passive:true});

