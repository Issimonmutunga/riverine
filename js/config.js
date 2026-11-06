// Settings for whoever hosts Flood Depth. Both are optional.
export const CONFIG = {
  // The team's Google Sheet web-app URL (deploy apps-script/Code.gs, see the README). When set, everyone
  // using this copy of the app shares one dataset catalogue and DEM survey requests arrive in that Sheet.
  // When empty, each person's own Sheet (Saved places → gear) is used, so a team can share by connecting
  // the same Sheet.
  sheetUrl: '',
  // Where DEM survey requests are emailed when no Sheet is connected. Empty lets the sender pick a recipient.
  requestEmail: '',
};
