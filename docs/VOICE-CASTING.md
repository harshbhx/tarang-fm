# Tarang FM: Voice Casting (Bulbul v4 Flash)

The source of truth for `shared/stations.ts`. All speaker IDs come from the v4-flash catalog (222 IDs, format `name_lang_style`). The full list is at https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices.

**Rules**
- Cast for **style first**: the style suffix (`news_breaking`, `suspense`, `kids`, `ads`, `stories_dramatic`) does most of the acting. Then tune with `pace` (0.5–2.0) and `temperature` (0.01–1.0, higher is more expressive).
- `pitch` and `loudness` are not used until the spike confirms v4-flash accepts them.
- **Gender** is the grammatical gender the script must use for that role (Hindi, Marathi and Bangla verb agreement). The docs don't label voices, so the spike auditions each cast voice and fills the `Gender` column from what it hears. Until then the column says `audition`, and prompts must not assume gender from a voice's name.
- A language with a thin roster reuses voices across roles, with different pace and temperature so they sound distinct.

## Must ship

### 🟠 Tarang Hindi · `hi` · `hi-IN` · 91.1
Tagline: "दिल से सुनिए, दिल की बात" · STT mode `codemix` · News feed `hl=hi`
Station ID text: "आप सुन रहे हैं तरंग FM 91.1… दिल से सुनिए, दिल की बात!"

| Role | Speaker | Pace | Temp | Gender | Why |
|---|---|---|---|---|---|
| station_id | `ishita_hi_ads` | 1.0 | 0.7 | audition | Ad-style punch for the jingle |
| rj | `sunny_hi_reels` | 1.05 | 0.8 | audition | Energetic, social-media host energy |
| news | `simran_hi_news_breaking` | 1.05 | 0.4 | audition | Purpose-built breaking-news delivery |
| ad_announcer | `mukul_hi_ads` | 1.1 | 0.8 | audition | Ad voice |
| ad_customer | `ritu_hi_ads_informal` | 1.0 | 0.8 | audition | Informal ad read, contrasts with the announcer |
| narrator | `shubh_hi_stories_dramatic` | 0.95 | 0.8 | audition | Dramatic storyteller |
| char_a | `mukul_hi_suspense` | 0.9 | 0.8 | audition | Mysterious and suspense characters |
| char_b | `advait_hi_character` | 1.0 | 0.9 | audition | Character voice |
| char_kid | `chhavi_hi_kids` | 1.05 | 0.8 | audition | Kids voice |

Alternates for audition: `ashok_hi_character`, `ritu_hi_social_lively`, `simran_hi_social_excited`, `anand_hi_news`, `shubh_hi_stories_mixed`, `kunal_hi_kids`, `sanchita_hi_romantic`.
Night RJ (If time T2): `ratan_hi_latenight_warm`, pace 0.95, temp 0.7.

### 🔵 Tarang Tamil · `ta` · `ta-IN` · 98.3
Tagline: "இதயத்தின் அலைவரிசை" · STT mode `transcribe` · News feed `hl=ta`
Station ID text: "நீங்கள் கேட்டுக் கொண்டிருப்பது தரங் FM 98.3!"
Roster: `gokul_ta_narration`, `vetri_ta_ads`, `vetri_ta_suspense`, `vijay_ta_narration` (only 4 voices)

| Role | Speaker | Pace | Temp | Gender |
|---|---|---|---|---|
| station_id | `vetri_ta_ads` | 1.0 | 0.7 | audition |
| rj | `gokul_ta_narration` | 1.05 | 0.8 | audition |
| news | `vijay_ta_narration` | 1.0 | 0.4 | audition |
| ad_announcer | `vetri_ta_ads` | 1.1 | 0.8 | audition |
| ad_customer | `gokul_ta_narration` | 1.0 | 0.9 | audition |
| narrator | `vijay_ta_narration` | 0.95 | 0.7 | audition |
| char_a | `vetri_ta_suspense` | 0.9 | 0.8 | audition |
| char_b | `gokul_ta_narration` | 1.05 | 0.9 | audition |
| char_kid | `vetri_ta_ads` | 1.15 | 0.9 | audition |

### 🟢 Tarang Bangla · `bn` · `bn-IN` · 102.7
Tagline: "মনের কথা, মনের সুরে" · STT mode `transcribe` · News feed `hl=bn`
Station ID text: "আপনি শুনছেন তরঙ্গ FM 102.7… মনের কথা, মনের সুরে!"
Roster: `bappa_bn_conversation`, `roopa_bn_conversational`, `bimal_bn_suspense` (only 3 voices)

| Role | Speaker | Pace | Temp | Gender |
|---|---|---|---|---|
| station_id | `bappa_bn_conversation` | 1.05 | 0.8 | audition |
| rj | `bappa_bn_conversation` | 1.05 | 0.8 | audition |
| news | `roopa_bn_conversational` | 1.0 | 0.4 | audition |
| ad_announcer | `bappa_bn_conversation` | 1.15 | 0.9 | audition |
| ad_customer | `roopa_bn_conversational` | 1.0 | 0.9 | audition |
| narrator | `roopa_bn_conversational` | 0.95 | 0.7 | audition |
| char_a | `bimal_bn_suspense` | 0.9 | 0.8 | audition |
| char_b | `bappa_bn_conversation` | 1.0 | 0.9 | audition |
| char_kid | `roopa_bn_conversational` | 1.15 | 0.9 | audition |

## If time

### Tarang Marathi · `mr` · `mr-IN` · 94.3 (T1)
Station ID: "तुम्ही ऐकत आहात तरंग FM 94.3!" · STT `transcribe` · feed `hl=mr`

| station_id | rj | news | ad_announcer | ad_customer | narrator | char_a | char_b | char_kid |
|---|---|---|---|---|---|---|---|---|
| `nilesh_mr_conversation` | `ishita_mr_conversational` | `neha_mr_narration` | `nilesh_mr_conversation` | `ritu_mr_insurance` | `rupali_mr_stories` | `mukul_mr_stories` | `soham_mr_narration` | `mrunal_mr_narration` |

### Tarang Bombay (Hinglish/English) · `en` · `en-IN` (T6)
Hinglish lines use `enhi` personas. Spike check: whether `enhi` voices need `hi-IN` for Devanagari-mixed text.

| station_id | rj | news | ad_announcer | ad_customer | narrator | char_a | char_b | char_kid |
|---|---|---|---|---|---|---|---|---|
| `nachiket_en_ads` | `simran_enhi_companion` | `shubh_en_narration` | `varun_en_ads` | `sunny_enhi_customer` | `aditi_en_stories` | `rustom_en_suspense` | `varun_en_suspense` | `nupur_en_kids` |

### Telugu · Kannada · Punjabi · Gujarati (T6)
| Station | Roster (reuse across roles) | Suggested RJ / news / narrator |
|---|---|---|
| `te` `te-IN` | `kavitha_te_conversation`, `kavitha_te_narration`, `pooja_te_conversation`, `tarun_te_narration` | `pooja_te_conversation` / `tarun_te_narration` / `kavitha_te_narration` |
| `kn` `kn-IN` | `chaitra_kn_conversation`, `chaitra_kn_narration`, `chetan_kn_conversation`, `suchitra_kn_narration` | `chetan_kn_conversation` / `suchitra_kn_narration` / `chaitra_kn_narration` |
| `pa` `pa-IN` | `anand_pa_conversation`, `anand_pa_customer`, `harpreet_pa_narration`, `jaspal_pa_banking` | `anand_pa_conversation` / `jaspal_pa_banking` / `harpreet_pa_narration` |
| `gu` `gu-IN` | `bhavik_gu_conversation`, `pooja_gu_conversational`, `pooja_gu_customer` | `bhavik_gu_conversation` / `pooja_gu_customer` / `pooja_gu_conversational` |

## Audition checklist (spike)
1. For each cast voice, synthesize a short sample in its station language (`scripts/audition.ts`). Save it under `tmp/audition/`, which is gitignored.
2. Record a perceived voice type → fill the `Gender` column here and in `shared/stations.ts`.
3. Check that each role sounds distinct within a station. If not, swap in an alternate or change pace and temperature.
4. Check 2 cross-language cases: a Hindi persona reading Tamil text, and an `enhi` persona with `en-IN`. Note the results, since they could enrich the thin rosters.
