// Settings for whoever hosts Flood Depth. All are optional.
export const CONFIG = {
  // The team's Google Sheet web-app URL (deploy apps-script/Code.gs, see the README). When set, everyone
  // using this copy of the app shares one dataset catalogue and DEM survey requests arrive in that Sheet.
  // When empty, each person's own Sheet (Saved places → gear) is used, so a team can share by connecting
  // the same Sheet.
  sheetUrl: '',
  // Where DEM survey requests are emailed when no Sheet is connected. Empty lets the sender pick a recipient.
  requestEmail: '',
  // The "Contact Developer" tool. A button with an empty value shows as "Not set up yet".
  developer: {
    whatsapp: '254706085240', // number with country code, e.g. '254712345678'
    phone: '+254 706 085 240',    // e.g. '+254 712 345 678'
    email: 'besimonmutunga@gmail.com',    // e.g. 'name@gmail.com'
    linkedin: 'https://www.linkedin.com/in/invincible-simon', // full profile address, e.g. 'https://www.linkedin.com/in/your-name'
  },
};
