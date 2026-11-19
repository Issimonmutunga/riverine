// "Contact Developer": four big app-style buttons (Text, Call, Email, Connect). The details live in config.js.
import { addTool } from '../rail.js';
import { CONFIG } from '../config.js';

const ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>';

// App-style icons, drawn here so they work offline and match each app's colours.
const APP_ICONS = {
  // WhatsApp: green tile, white speech bubble with a handset.
  whatsapp: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="11" fill="#25D366"/>
    <path d="M24 9.5a14.4 14.4 0 0 0-12.4 21.7L9.5 38.5l7.5-2a14.4 14.4 0 1 0 7-27z" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M18.4 16.6c-.7.1-1.7.9-1.9 2.2-.3 2.2 1.2 5.3 3.6 7.7 2.4 2.4 5.5 3.9 7.7 3.6 1.3-.2 2.1-1.2 2.2-1.9.1-.5-.1-.9-.5-1.1l-2.7-1.3c-.4-.2-.9-.1-1.2.3l-.9 1.1c-1.6-.7-3.3-2.3-4.1-4l1.1-.9c.4-.3.5-.8.3-1.2l-1.3-2.7c-.2-.4-.6-.7-1.1-.6z" fill="#fff"/></svg>`,
  // Samsung (One UI / Galaxy) Phone: green circle with a white handset.
  call: `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="gx" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3fd17f"/><stop offset="1" stop-color="#14a85a"/></linearGradient></defs>
    <circle cx="24" cy="24" r="24" fill="url(#gx)"/>
    <path d="M17.2 12.6h-3a2 2 0 0 0-2 2.1c.8 12.2 9.9 21.4 22.1 22.2a2 2 0 0 0 2.1-2v-3l-5.7-2.2-2.9 2.9a16.6 16.6 0 0 1-8.3-8.3l2.9-2.9z" fill="#fff"/></svg>`,
  // Gmail: white tile with the red-blue-green-yellow M envelope.
  email: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="11" fill="#fff"/>
    <path d="M9 15.5v17.5a2 2 0 0 0 2 2h5V22.5z" fill="#4285F4"/><path d="M39 15.5v17.5a2 2 0 0 1-2 2h-5V22.5z" fill="#34A853"/>
    <path d="M32 13.8v8.7l7-5.2v-1.6c0-2.5-2.9-3.9-4.9-2.4z" fill="#FBBC04"/><path d="M16 22.5v-8.7L24 20l8-6.2v8.7L24 28.7z" fill="#EA4335"/>
    <path d="M9 15.5v1.8l7 5.2v-8.7l-2.1-1.6C11.9 11.7 9 13.1 9 15.5z" fill="#C5221F"/></svg>`,
  // LinkedIn: blue tile with the white "in".
  linkedin: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="11" fill="#0A66C2"/>
    <rect x="10.5" y="19" width="6" height="19" fill="#fff"/><circle cx="13.5" cy="13.2" r="3.4" fill="#fff"/>
    <path d="M21 19h5.7v2.6c.9-1.7 3-3.1 6-3.1 5.4 0 6.5 3.5 6.5 8.2V38h-6v-9.4c0-2.2-.1-4.5-2.9-4.5s-3.3 2.2-3.3 4.4V38H21z" fill="#fff"/></svg>`,
};

const digits = (s) => String(s || '').replace(/\D/g, '');

function tiles() {
  const d = CONFIG.developer || {};
  const hi = encodeURIComponent('Hi, I am using Flood Depth and I would like to ask about it.');
  return [
    { key: 'whatsapp', label: 'Text', sub: 'WhatsApp', ok: !!digits(d.whatsapp), href: `https://wa.me/${digits(d.whatsapp)}?text=${hi}`, external: true },
    { key: 'call', label: 'Call', sub: d.phone || 'Phone', ok: !!digits(d.phone), href: `tel:${String(d.phone || '').replace(/[^\d+]/g, '')}` },
    { key: 'email', label: 'Email', sub: 'Gmail', ok: !!d.email, href: `mailto:${d.email || ''}?subject=${encodeURIComponent('Flood Depth')}` },
    { key: 'linkedin', label: 'Connect', sub: 'LinkedIn', ok: !!d.linkedin, href: d.linkedin || '#', external: true },
  ];
}

function render(body) {
  const list = tiles();
  body.innerHTML = `<p class="side-note">Found a mistake, have a question, or want to work together? Pick how you would like to reach the developer.</p>
    <div class="contact-grid">${list.map((x) => (x.ok
      ? `<a class="contact-tile" href="${x.href}"${x.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${APP_ICONS[x.key]}<b>${x.label}</b><span>${x.sub}</span></a>`
      : `<span class="contact-tile off" aria-disabled="true">${APP_ICONS[x.key]}<b>${x.label}</b><span>Not set up yet</span></span>`)).join('')}</div>
    <p class="side-note contact-foot">Made by <a href="https://simonmapper.co.ke" target="_blank" rel="author noopener">Simon Maps</a>.</p>`;
}

export function initContact(ctx) {
  const tool = addTool({ id: 'contact', icon: ICON, render,
    text: () => 'Contact the developer by text on WhatsApp, by phone call, by email or on LinkedIn.' });
  ctx.openContact = () => tool.btn.click();
}
