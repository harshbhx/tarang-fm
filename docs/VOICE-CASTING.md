# Tarang FM: Voice Casting (Bulbul v4 Flash)

The source of truth for `shared/stations.ts`. Every speaker ID below was **checked against the live API on 14 Oct 2026**. The live roster has 224 IDs, and some differ from the docs page: Tamil `vetri_*` is live as `aravind_*`, and Bangla `bappa_*` is live as `arnab_*`. Assamese (`kangkana_as_*`, `mouchumi_as_*`) is also live.

**Rules**
- Cast for **style first**: the style suffix (`news_breaking`, `suspense`, `kids`, `ads`, `stories_dramatic`) does most of the acting. Then tune with `pace` (0.5–2.0) and `temperature` (0.01–1.0, higher is more expressive).
- `pitch` and `loudness` are accepted by v4-flash (the spike got 200 OK) but aren't needed. Don't use them in the MVP.
- **Gender** is the grammatical gender scripts must use for that role (Hindi, Marathi and Bangla verb agreement).
  - It comes from the audition (`npm run audition`): median pitch under 158 Hz → masculine, over 172 Hz → feminine.
  - Borderline voices were resolved from the same speaker's other styles.
  - It is never guessed from a voice's name.
- A Hindi persona reading Tamil text also works (the spike got 200 OK), but the accent is untested, so the MVP casts native voices only.
- Thin rosters reuse voices across roles, with different pace and temperature.

## Audition results (median F0)

| Voice | Hz | Type | | Voice | Hz | Type |
|---|---|---|---|---|---|---|
| `ishita_hi_ads` | 212 | feminine | | `aravind_ta_ads` | 117 | masculine |
| `sunny_hi_reels` | 138 | masculine | | `aravind_ta_suspense` | 80 | masculine |
| `simran_hi_news_breaking` | 270 | feminine | | `gokul_ta_narration` | 144 | masculine |
| `mukul_hi_ads` | 126 | masculine | | `vijay_ta_narration` | 139 | masculine |
| `mukul_hi_suspense` | 167 | masculine¹ | | `arnab_bn_conversation` | 157 | masculine |
| `ritu_hi_ads_informal` | 264 | feminine | | `roopa_bn_conversational` | 229 | feminine |
| `shubh_hi_stories_dramatic` | 101 | masculine | | `bimal_bn_suspense` | 117 | masculine |
| `sanchita_hi_romantic` | 238 | feminine | | `ratan_hi_latenight_warm` | 132 | masculine |
| `chhavi_hi_kids` | 276 | feminine | | `kunal_hi_kids` | 136 | masculine |
| `advait_hi_character` | 276 | high, stylized² | | `ashok_hi_character` | 258 | high, stylized² |
| `anand_hi_news` | 126 | masculine | | `simran_hi_social_excited` | 304 | feminine |

¹ Borderline pitch. `mukul_hi_ads` measures 126 Hz, so the speaker is masculine.
² The "character" voices are stylized and high-pitched. Listen before casting them.

Other languages measured: Marathi `nilesh` 126 M, `soham` 103 M, `mukul_mr` 160 M¹, `ishita_mr` 209 F, `neha_mr` 180 F, `mrunal` 235 F, `rupali` 240 F, `ritu_mr` 238 F. English `shubh_en_narration` 97 M, `rustom` 101 M, `varun_en_ads` 103 M, `varun_en_suspense` 150 M, `nachiket_en_ads` 136 M, `aditi_en_stories` 188 F, `nupur_en_kids` 329 F, `simran_enhi_companion` 258 F, `sunny_enhi_customer` 163 M¹. Telugu `kavitha` 247/273 F, `pooja_te` 229 F, `tarun_te` 150 M. Kannada `chaitra` 229/235 F, `suchitra_kn` 214 F, `chetan_kn` 175 (check by ear). Punjabi `anand_pa` 116/142 M, `harpreet_pa` 124 M, `jaspal_pa` 121 M. Gujarati `bhavik_gu` 133 M, `pooja_gu` 255/247 F.

## Must ship

### 🟠 Tarang Hindi · `hi` · `hi-IN` · 91.1
Tagline: "दिल से सुनिए, दिल की बात" · STT mode `codemix` · News feed `hl=hi`
Station ID text: "आप सुन रहे हैं तरंग FM 91.1… दिल से सुनिए, दिल की बात!"

| Role | Speaker | Pace | Temp | Gender |
|---|---|---|---|---|
| station_id | `ishita_hi_ads` | 1.0 | 0.7 | feminine |
| rj | `sunny_hi_reels` | 1.05 | 0.8 | masculine |
| news | `simran_hi_news_breaking` | 1.05 | 0.4 | feminine |
| ad_announcer | `mukul_hi_ads` | 1.1 | 0.8 | masculine |
| ad_customer | `ritu_hi_ads_informal` | 1.0 | 0.8 | feminine |
| narrator | `shubh_hi_stories_dramatic` | 0.95 | 0.8 | masculine |
| char_a | `mukul_hi_suspense` | 0.9 | 0.8 | masculine |
| char_b | `sanchita_hi_romantic` | 1.0 | 0.85 | feminine |
| char_kid | `chhavi_hi_kids` | 1.05 | 0.8 | feminine |

Alternates: `anand_hi_news` (M), `simran_hi_social_excited` (F), `kunal_hi_kids` (M), `shubh_hi_stories_mixed` (M), `advait_hi_character` / `ashok_hi_character` (stylized).
Night RJ (If time): `ratan_hi_latenight_warm` (M), pace 0.95, temp 0.7.

### 🔵 Tarang Tamil · `ta` · `ta-IN` · 98.3
Tagline: "இதயத்தின் அலைவரிசை" · STT mode `transcribe` · News feed `hl=ta`
Station ID text: "நீங்கள் கேட்டுக் கொண்டிருப்பது தரங் FM 98.3!"
**All live Tamil voices are masculine**, so Tamil scripts use male characters (the kid is a boy).

| Role | Speaker | Pace | Temp | Gender |
|---|---|---|---|---|
| station_id | `aravind_ta_ads` | 1.0 | 0.7 | masculine |
| rj | `gokul_ta_narration` | 1.05 | 0.8 | masculine |
| news | `vijay_ta_narration` | 1.0 | 0.4 | masculine |
| ad_announcer | `aravind_ta_ads` | 1.1 | 0.8 | masculine |
| ad_customer | `gokul_ta_narration` | 1.0 | 0.9 | masculine |
| narrator | `vijay_ta_narration` | 0.95 | 0.7 | masculine |
| char_a | `aravind_ta_suspense` | 0.9 | 0.8 | masculine |
| char_b | `gokul_ta_narration` | 1.05 | 0.9 | masculine |
| char_kid | `aravind_ta_ads` | 1.15 | 0.9 | masculine |

### 🟢 Tarang Bangla · `bn` · `bn-IN` · 102.7
Tagline: "মনের কথা, মনের সুরে" · STT mode `transcribe` · News feed `hl=bn`
Station ID text: "আপনি শুনছেন তরঙ্গ FM 102.7… মনের কথা, মনের সুরে!"

| Role | Speaker | Pace | Temp | Gender |
|---|---|---|---|---|
| station_id | `arnab_bn_conversation` | 1.05 | 0.8 | masculine |
| rj | `arnab_bn_conversation` | 1.05 | 0.8 | masculine |
| news | `roopa_bn_conversational` | 1.0 | 0.4 | feminine |
| ad_announcer | `arnab_bn_conversation` | 1.15 | 0.9 | masculine |
| ad_customer | `roopa_bn_conversational` | 1.0 | 0.9 | feminine |
| narrator | `roopa_bn_conversational` | 0.95 | 0.7 | feminine |
| char_a | `bimal_bn_suspense` | 0.9 | 0.8 | masculine |
| char_b | `arnab_bn_conversation` | 1.0 | 0.9 | masculine |
| char_kid | `roopa_bn_conversational` | 1.15 | 0.9 | feminine |

## If time

### Tarang Marathi · `mr` · `mr-IN` · 94.3
Station ID: "तुम्ही ऐकत आहात तरंग FM 94.3!" · STT `transcribe` · feed `hl=mr`

| Role | Speaker | Gender |
|---|---|---|
| station_id | `nilesh_mr_conversation` | masculine |
| rj | `ishita_mr_conversational` | feminine |
| news | `neha_mr_narration` | feminine |
| ad_announcer | `nilesh_mr_conversation` | masculine |
| ad_customer | `ritu_mr_insurance` | feminine |
| narrator | `rupali_mr_stories` | feminine |
| char_a | `mukul_mr_stories` | masculine |
| char_b | `soham_mr_narration` | masculine |
| char_kid | `mrunal_mr_narration` | feminine |

### Tarang Bombay (Hinglish/English) · `en` · `en-IN`
`enhi` personas work with `en-IN` (spike: 200 OK).

| Role | Speaker | Gender |
|---|---|---|
| station_id | `nachiket_en_ads` | masculine |
| rj | `simran_enhi_companion` | feminine |
| news | `shubh_en_narration` | masculine |
| ad_announcer | `varun_en_ads` | masculine |
| ad_customer | `sunny_enhi_customer` | masculine |
| narrator | `aditi_en_stories` | feminine |
| char_a | `rustom_en_suspense` | masculine |
| char_b | `varun_en_suspense` | masculine |
| char_kid | `nupur_en_kids` | feminine |

### Telugu · Kannada · Punjabi · Gujarati
| Station | RJ | News | Narrator | Others to reuse |
|---|---|---|---|---|
| `te` `te-IN` | `pooja_te_conversation` F | `tarun_te_narration` M | `kavitha_te_narration` F | `kavitha_te_conversation` F |
| `kn` `kn-IN` | `chaitra_kn_conversation` F | `suchitra_kn_narration` F | `chaitra_kn_narration` F | `chetan_kn_conversation` (check by ear) |
| `pa` `pa-IN` | `anand_pa_conversation` M | `jaspal_pa_banking` M | `harpreet_pa_narration` M | `anand_pa_customer` M |
| `gu` `gu-IN` | `bhavik_gu_conversation` M | `pooja_gu_customer` F | `pooja_gu_conversational` F | n/a |

## Re-auditioning
`npm run audition` synthesizes every ID in this file. It writes `tmp/audition/*.wav`, `results.json` and `index.html` (open it to listen) and prints each voice's pitch. Pass IDs to audition specific voices: `npm run audition -- kunal_hi_kids advait_hi_character`.
