# DOC (Doctor On Call): User Guide

DOC is a health helper. It **reads your medical reports**, **joins them together**, **finds hidden health risks**, and **explains everything in simple words**, so you go to your doctor prepared.

> DOC is not a doctor. It does not diagnose. Never stop or change a medicine without asking your doctor.
> In an emergency, call **112** (or **108** for an ambulance).

**Live app:** https://doc-doctor-on-call.onrender.com · **Try it without signing up:** https://doc-doctor-on-call.onrender.com/demo
(The free server sleeps when idle, so the first visit can take about 50 seconds.)

---

## 1. Start the app on your computer

```bash
cd C:\Users\vani\carethread
.\start.ps1
```
It opens **http://127.0.0.1:8000** in your browser. If it's already running, it just opens the page.

**On your phone (same Wi-Fi):** start with `.\start.ps1 -Lan`. It prints an address like `http://192.168.1.5:8000`; open that on your phone. Windows may ask you to allow Python through the firewall; allow it for private networks. Use the browser menu → **Add to Home screen** for an app icon. A full offline "install" needs the app deployed on HTTPS.

---

## 2. First-time setup (5 minutes)

| Step | Where | What to do |
|---|---|---|
| 1 | **Create an account** | Tap **Sign up with Google**, or type your name, email and a password (8+ characters, with letters and numbers). Pick your sex first; lab ranges depend on it. |
| 2 | **Check your email** | If you used email and password, DOC sends a link to confirm your address. Use **Forgot password?** on the sign-in page if you forget it. |
| 3 | **Settings → Family profiles** | Add your **date of birth**, **sex**, height, weight, blood group, allergies, conditions (Diabetes, High BP…) and an emergency contact. Formulas need age and sex. |
| 4 | **Add member** (optional) | Add parents or children whose reports *you* manage. Switch between people with the button at the top right. |

**Signing in next time:** tap **Continue with Google**, or use your email and password. Sign-in is handled by Google Firebase. For extra safety, turn on 2-Step Verification in your Google account.

**Language:** use the language box at the top to switch between English, हिन्दी and தமிழ்.

---

## 3. Everyday use

### Add a report (Upload)
1. Tap **Upload**, then **Choose file**, or **Take photo** on a phone. PDF, JPG, PNG or WEBP, up to 15 MB.
2. DOC reads it and shows a **review screen**:
   - every value, with the line it came from;
   - **highlighted rows** = DOC isn't sure. Check them against the paper.
   - Fix anything wrong, add missing tests, or delete rows.
3. Tap **Confirm & save**. DOC then re-checks everything for hidden risks.

Tips:
- Upload **old reports too**. Trends need history.
- Nothing counts until you confirm it.

### Fix a value later (report viewer)
Found a mistake after saving?
1. Open **Records** and tap the report. The report viewer opens.
2. Tap **Fix a value**.
3. Type the number **exactly as printed** on your report. DOC works out the unit, range and colour again by itself.
4. Tap **Save fixes**. The row now shows **Corrected**.

The report viewer also has:
- **Open original:** see the file you uploaded.
- **Simple summary** and **தமிழில்:** a short summary in English or Tamil.
- **FHIR:** download this report in the standard hospital format.

### Understand your results
- **Home:** today's checklist, alerts, hidden risks, silent trends, the next best test and family updates. A red banner appears if something needs a doctor now.
- **Hidden Risks ★:** scores made by joining reports (liver, kidney, blood, sugar, heart). Each card shows:
  - the colour (🟢 fine / 🟡 watch / 🔴 talk to the doctor)
  - the **formula with your numbers**
  - **which reports** the numbers came from (tap to open the source)
  - the trend over the years
  - why no single report showed this
  - the **next step** and the **research paper** the formula comes from
- **Explain simply** (on any value or card): a plain-language explanation in English, Hindi or Tamil, plus a quick quiz.
- **Timeline:** charts for every test across all labs, and a timeline of reports, medicines and symptoms.

### Risk check
**Risk Check** shows two estimates: **diabetes** and **heart artery disease**. They come from two machine-learning models (XGBoost).
- **Use my records only:** DOC uses values it already has (age, BMI, BP, sugar, cholesterol).
- **Answer a few questions instead:** fill in what you know, then tap **Update estimate**. Every question is optional. Your answers are **not saved** to your record.
- **What moved your estimate most** shows the 3 values of yours that pushed the number up or down.
- **Missing, so we used a typical value** lists what DOC did not have. Adding real values makes the estimate fit you better.
- Read the **Limitations**: the models were trained on small groups of people in the USA, a long time ago.

> This is a screening estimate, not a diagnosis. Please discuss it with your doctor.

### Medicines
- See the generic name and the possible **yearly saving** with generics.
- **Medicine safety check:**
  - food and timing notes
  - medicines that may interact
  - possible double-ups (same salt twice, or two of the same type)
  - cautions linked to your latest test results
  - kidney dose warnings
  - "was this medicine added to treat a side effect of another?"
  - tests due (e.g. B12 on metformin)
- **Log a symptom** (e.g. ankle swelling) with the date it started. DOC checks whether it began soon after a new medicine.

If nothing is found, DOC says so. Your pharmacist can still double-check.

### Wellness (home readings)
- **Add reading:** enter home BP (top/bottom numbers), sugar (fasting or after a meal), weight, heart rate, oxygen, steps, sleep, water or calories.
- **Import CSV:** bring many readings at once from a BP machine or fitness app. Download the **Template** to see the format.
- **Devices (demo):** connect a simulated BP monitor, glucometer, band or scale. These readings are marked as demo data, so they are never mixed with real ones.
- DOC shows 30-day averages and charts against guideline targets (e.g. home BP below 135/85). It links readings to your medicines, for example "BP went up after starting a painkiller".
- Very high BP (180/120 or more), very low or very high sugar (below 54 or above 400) or low oxygen (below 90%) shows a red **see a doctor now** banner.

### Care plan
**Care Plan** keeps your checkups and daily reminders in one place.
- **Checkups:** tap **Add checkup**. Fill in the title, type (lab test, doctor visit, screening, vaccine…), the date, and "repeat every … months" if it repeats. When it's done, tap **Mark done**. If it repeats, DOC plans the next one.
- DOC shows **Overdue** and **Due soon** checkups, plus suggestions based on your conditions.
- **Reminders:** tap **Add reminder** for a medicine, a BP or sugar check, or drinking water. Pick the times and days. **From your active medicines** fills in times from doses like "1-0-1".
- **Today:** tap each item when done.
- **Turn on notifications** to get reminders while the page is open.

### Food & diet
- **Quick log:** type what you ate, like *"2 idli, sambar and coffee"*, and tap **Check**. DOC finds the foods and shows calories, carbs, protein and more. Change portions with **Less** / **More**, then save.
- If a food isn't found, pick the closest one from the list, or use **Add a food** to search (e.g. dosa, ragi, dal).
- **Photo scan** works only when the AI boost is on. Otherwise, type what you ate.
- **Last 7 days** shows a chart and your week averages.
- **Tips** are linked to your own test values (for example, high sugar or cholesterol).

Values are approximate. This is general advice, not a diet plan. Your doctor or a dietitian can set personal targets.

### Wound check
1. **Where is the wound?** Use the same name each time (e.g. "left foot") so DOC can compare photos.
2. **Take photo** or **Choose photo.** Use daylight, the same distance each time, and no flash.
3. Answer the **Quick safety questions** (tick any that are true) and the days since the injury.
4. DOC shows one of four results: **Emergency**, **Doctor today**, **Doctor soon** or **Home care**, with the reasons.
5. **Photo history:** tick two photos of the same wound to compare them. DOC says if it looks smaller or larger.

> Heavy bleeding, a deep cut, a snake bite or trouble breathing? Don't wait for a photo check. Call 108 or 112.
> The photo check only measures colours. It cannot diagnose an infection.

### Home care
**Home Care** has simple, safe self-care for 15 common problems. Search a word like *fever*, *cough*, *burn* or *loose motion*. Each topic shows:
- **What usually helps**
- **Avoid**
- **See a doctor if**
- **Get help now if**

### SOS & hospitals
The red **SOS** button is at the top of every screen.
- **Call** 112 (all emergencies), 108 (ambulance) or **Tele-MANAS 14416** (free mental health helpline, 24x7) with one tap.
- **Emergency card:** blood group, allergies, conditions, medicines and emergency contact. Show it to the ambulance team. Fill these in under **Settings**.
- **Share** the card and your location by WhatsApp or SMS.
- **Nearby hospitals:** hospitals and clinics within 5 km, from OpenStreetMap, with **Directions**. Allow location, or type your area and tap **Search**. The list may be incomplete.
- **What to do now:** simple first steps while help is coming.

### Ask AI
Type a question, for example "How are my kidneys?".
- **Voice:** tap the **microphone** to speak your question. Tap **listen** on an answer to hear it read aloud. Both follow the language you chose at the top (English, Hindi or Tamil).
- The answer uses **only your records**, with a 📄 **source** button for each fact.
- When the AI is on, a second check reviews each answer (shown as **fact-checked**). Without AI, you get an **offline answer** from DOC's own rules and search.
- If the records don't say, DOC tells you it doesn't know.
- **Asking about:** choose **Me**, or a family member who shared chat with you.
- If your question mentions chest pain, breathing trouble, fainting, heavy bleeding or self-harm, DOC shows emergency numbers straight away.

### Family (share with consent)
Family sharing lets another DOC account see your health data, **only if you say yes**.

**To ask to see someone's data**
1. Go to **Family → Ask to view a family member**.
2. Type **their email**, how they are related to you, and tick **what you'd like to see** (records, timeline, summary, home readings, medicines, Ask AI).
3. Tap **Send request**. Nothing is shared until they approve.

**To approve a request** (you own the data)
1. Requests appear in **Family**.
2. Look at **They asked for**. **Untick anything you want to keep private.**
3. Tap **Approve selected**, or **Deny**.

**To change or stop sharing**
- Change the ticks and tap **Save permissions**. Changes apply on their very next view.
- Tap **Revoke** to stop sharing. Access ends immediately.
- If you asked someone, you can **Withdraw** a waiting request or **Leave** later.

**To view a family member:** tap **Open** on their card to see only the parts they shared. If they shared chat, tap **Ask about [name]**.

Every view is recorded in the owner's access log (**Settings → Privacy & access log**).

### Doctor visit
**Doctor Visit** gives a one-page summary:
- hidden risks
- alerts
- trends
- medicines
- questions to ask

Then:
- **PDF:** download the summary.
- **PDF + தமிழ்:** the same PDF with an extra Tamil page for the family.
- **Print** it.
- **Share link:** create a private, read-only link (first name only). It expires after 24 hours, 3 days or 7 days, and you can **Revoke** it anytime. Every view is logged.

### Settings
- **Sign-in & security:** how you sign in.
- **Family profiles:** your details and the people you manage.
- **ABHA (Ayushman Bharat Health Account):** type your ABHA number (like `12-3456-7890-1234`) or ABHA address (like `name@abdm`) and tap **Link**. It is added to your FHIR file. **Import records (demo)** adds a sample record. This is a **demo**: DOC only checks the format. Real ABHA linking needs government approval and your OTP.
- **Download FHIR R4 (for hospitals / ABDM):** all your records in the standard health-record format.
- **Export all my data (JSON)**, the **access log**, and **Delete account** (this deletes everything and stops all sharing).

---

## 4. How do I know DOC is working correctly?

### A. Use the test kit (best way)
1. Open **Guide** in the app (or **Upload → "No reports yet? Download the test kit"**). Download the **6 PDFs** and the **ANSWER KEY**.
2. **Settings → Add member:** `Ravi Kumar`, **Male**, born **10-05-1972**, condition **High BP**. Select Ravi in the top bar.
3. Upload the PDFs **01 → 06**, confirming each.
4. **Medicines → Log a symptom:** *Ankle or leg swelling*, started **20-05-2026**.
5. Compare with the answer key. You should see:

| Where | Expected result |
|---|---|
| Records → All values | 2.4 lakhs → **240**, 106 µmol/L creatinine → **1.20 mg/dL**, 5.6 mmol/L cholesterol → **216.6 mg/dL** |
| Hidden Risks | **FIB-4 = 2.70, high** (joined from 2 labs) · **eGFR 65, rapid decline** · **TyG 9.31, high** · TG/HDL 5.55 · Non-HDL 179.8 · APRI 0.84 |
| Hidden Risks (bottom) | Creatinine and potassium "still normal but rising" |
| Medicines | 🔴 triple-whammy combination · 🟡 prescribing cascade (Amlong → swelling → Lasix) · 🟡 swelling linked to Amlong |
| Next Best Test | **Lipid Profile** first |

### B. Check the maths yourself
Every score card shows the formula with your numbers filled in. Type the same numbers into a free online **FIB-4 calculator** or the **National Kidney Foundation eGFR calculator**. The results should match.

### C. Check the reading
Tap any number's source chip. It opens the report and highlights the line. Compare it with the PDF.

### D. See a full example
Log out and tap **Try the live demo** (or open `/demo`). You'll see a family (Lakshmi, 58, and Priya, 30) with 3 years of reports from 3 labs and many findings. In **Family** you can also see:
- a daughter-in-law (Sujitha) who shared her sugar results with consent,
- a father (Appa) who is already allowed to see some of your data,
- a waiting request you can approve or deny.

Everything in the demo is made up and marked as demo data.

### E. Run the automatic tests (for developers)
```bash
cd C:\Users\vani\carethread\backend
.venv\Scripts\python -m pytest -q
```
This runs **94 tests**. They include one that uploads the whole test kit and checks every expected result, and 4 that check family consent.

---

## 5. Using your own real reports
- **Text PDFs** (most lab-generated PDFs) are read by DOC's own reader. Nothing leaves your computer.
- **Photos and scanned PDFs** are read by DOC's own OCR (Tesseract, English + Tamil). The live app has it. On your own Windows computer, install Tesseract (UB-Mannheim build) to use it.
- **AI boost (optional):** to help with messy photos and handwriting, add `GEMINI_API_KEY=...` or `ANTHROPIC_API_KEY=...` to `backend\.env` and restart. DOC uses the AI only when its own reading is weak. Names, phone numbers and ID numbers are removed from text before the AI sees it.
- Always check the review screen before confirming.

---

## 6. Common problems

| Problem | Fix |
|---|---|
| "Port 8000 in use" / page won't open | Run `.\start.ps1` again. It reuses the running app or picks another port. Open **http://127.0.0.1:8000**, not "localhost". |
| A report shows no values | It may be a scanned photo and OCR isn't installed on this computer. Install Tesseract, turn on the AI boost, or type the values in the review screen. |
| A value was read wrong after saving | Open the report in **Records** and use **Fix a value**. |
| No hidden risks shown | Add date of birth and sex in Settings, and upload more types of tests (blood count + liver + kidney + lipids). |
| Risk check says "not enough information" | Add date of birth, height and weight, or home BP and sugar readings, or tap **Answer a few questions instead**. |
| Google sign-in window closes or is blocked | Allow pop-ups for the site and try again. |
| Family member can't see my data | Check that you tapped **Approve selected**, and that the right items are ticked in **Family**. |
| Voice input doesn't work | Allow microphone access, or try Chrome or Edge. You can always type. |
| Old page after an update | Refresh the browser (Ctrl+F5). |
