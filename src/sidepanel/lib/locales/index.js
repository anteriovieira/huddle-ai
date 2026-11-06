// UI translation tables, one JSON file per locale, keyed by the English language name stored in
// settings.language (see ../i18n.js). English is the source (STRINGS in i18n.js) and needs no table
// here. Each JSON is a flat map of the same keys as STRINGS; missing keys fall back to English, so a
// partial table is safe. To edit a translation, edit its JSON file; to add a locale, drop in a JSON
// and add it to LANGUAGES in i18n.js and to the map below.

import Portuguese from './Portuguese.json';
import PortuguesePortugal from './Portuguese-Portugal.json';
import Spanish from './Spanish.json';
import French from './French.json';
import German from './German.json';
import Italian from './Italian.json';
import Dutch from './Dutch.json';
import Catalan from './Catalan.json';
import Galician from './Galician.json';
import Polish from './Polish.json';
import Czech from './Czech.json';
import Slovak from './Slovak.json';
import Hungarian from './Hungarian.json';
import Romanian from './Romanian.json';
import Swedish from './Swedish.json';
import Norwegian from './Norwegian.json';
import Danish from './Danish.json';
import Finnish from './Finnish.json';
import Greek from './Greek.json';
import Russian from './Russian.json';
import Ukrainian from './Ukrainian.json';
import Turkish from './Turkish.json';
import Arabic from './Arabic.json';
import Hebrew from './Hebrew.json';
import Hindi from './Hindi.json';
import Bengali from './Bengali.json';
import Indonesian from './Indonesian.json';
import Malay from './Malay.json';
import Vietnamese from './Vietnamese.json';
import Thai from './Thai.json';
import Filipino from './Filipino.json';
import ChineseSimplified from './Chinese-Simplified.json';
import ChineseTraditional from './Chinese-Traditional.json';
import Japanese from './Japanese.json';
import Korean from './Korean.json';

export const TRANSLATIONS = {
  Portuguese,
  'Portuguese (Portugal)': PortuguesePortugal,
  Spanish,
  French,
  German,
  Italian,
  Dutch,
  Catalan,
  Galician,
  Polish,
  Czech,
  Slovak,
  Hungarian,
  Romanian,
  Swedish,
  Norwegian,
  Danish,
  Finnish,
  Greek,
  Russian,
  Ukrainian,
  Turkish,
  Arabic,
  Hebrew,
  Hindi,
  Bengali,
  Indonesian,
  Malay,
  Vietnamese,
  Thai,
  Filipino,
  'Chinese (Simplified)': ChineseSimplified,
  'Chinese (Traditional)': ChineseTraditional,
  Japanese,
  Korean,
};
