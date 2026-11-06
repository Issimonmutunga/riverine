// Language picker. Read-aloud lives on every pane's header (the speaker button).
import { addTool } from '../rail.js';
import { t, languages, lang, setLang, canSpeak } from '../i18n.js';

const ICON = '<svg><use href="#i-lang"/></svg>';

export function initLanguage() {
  const tool = addTool({
    id: 'lang', icon: ICON,
    render(body) {
      body.innerHTML = `<div class="lang-list">${Object.entries(languages).map(([k, name]) => `
        <label class="lang-opt"><input type="radio" name="lang" value="${k}" ${k === lang() ? 'checked' : ''}><b>${name}</b></label>`).join('')}</div>
        <p class="side-note">${t('langIntro')}</p>
        ${canSpeak ? `<p class="side-foot"><svg class="inline"><use href="#i-speak"/></svg> ${t('listen')}</p>` : ''}`;
    },
  });
  tool.body.addEventListener('change', (e) => { if (e.target.name === 'lang') setLang(e.target.value); });
  document.documentElement.lang = lang();
}
