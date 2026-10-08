# DOC (Doctor On Call): User Guide

DOC is an AI health helper. It **reads your medical reports**, **joins them together**, **finds hidden health risks**, and **explains everything in simple words**, so you go to your doctor prepared.

> DOC is not a doctor. It does not diagnose. Never stop or change a medicine without asking your doctor.

---

## 1. Start the app

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
| 1 | **Sign up** | Name, email, password (8+ characters, with letters and numbers) |
| 2 | **Settings → Two-factor authentication** | Click **Set up 2FA**, scan the QR code with Google Authenticator / Microsoft Authenticator / Authy, type the 6-digit code. **Save the 8 backup codes.** From now on, login asks for the code. |
| 3 | **Settings → Family profiles** | Add your **date of birth**, **sex**, height, weight and conditions (Diabetes, High BP…). Formulas need age and sex. |
| 4 | **Add member** (optional) | Add parents or children. Switch between people from the top-right button. |

---

## 3. Everyday use

### Add a report
1. **Upload**, then choose a PDF, or **Take photo** on a phone.
2. DOC reads it and shows a **review screen**:
   - every value, with the line it came from;
   - **yellow rows** = DOC isn't sure. Check them against the paper.
   - Fix anything wrong, add missing tests, or delete rows.
3. Click **Confirm & save**. DOC then re-checks everything for hidden risks.

Tip: upload **old reports too**. Trends need history.

### Understand your results
- **Home:** your snapshot score, top 3 things to do, and alerts.
- **Hidden Risks ★:** scores made by joining reports (liver, kidney, blood, sugar, heart). Each card shows:
  - the colour (🟢 fine / 🟡 watch / 🔴 talk to the doctor)
  - the **formula with your numbers**
  - **which reports** the numbers came from (click to open the source)
  - the trend over the years
  - why no single report showed this
  - the **next step** and the **research paper** the formula comes from
- **Explain simply** (on any value or card): plain-language explanation in English, Hindi or Tamil, plus a quick quiz.
- **Timeline:** charts for every test across all labs, and a timeline of reports, medicines and symptoms.

### Medicines
- See the generic name and the possible **yearly saving** with generics.
- Safety checks:
  - kidney dose warnings
  - risky combinations
  - "was this medicine added to treat a side effect of another?"
  - tests due (e.g. B12 on metformin)
- **Log a symptom** (e.g. ankle swelling) with the date it started. DOC checks whether it began soon after a new medicine.

### Wellness (home readings)
- **Wellness → Add reading**: enter home BP (top/bottom numbers), sugar (fasting or after a meal), weight, heart rate, oxygen, steps or sleep.
- **Import CSV**: bring many readings at once from a BP machine or fitness app. Download the **Template** to see the format.
- DOC shows 30-day averages and charts against guideline targets (e.g. home BP below 135/85). It links readings to your medicines, for example "BP went up after starting a painkiller".
- Home readings also appear in **Ask AI** answers and in the **Doctor Visit** summary.

### Ask AI
Type or speak a question, for example "How are my kidneys?".
- The answer uses **only your records**, with a 📄 button for each source.
- A second AI checks each answer.
- If the records don't say, DOC tells you it doesn't know.

### Doctor visit
**Doctor Visit** gives a one-page summary:
- hidden risks
- alerts
- medicines
- key results
- questions to ask

**Download the PDF**, **print** it, or **create a share link**. Links expire after 24 hours, 3 days or 7 days, and you can revoke them anytime.

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
Click any number's source chip. It opens the report and highlights the line. Compare it with the PDF.

### D. See a full example
Log out and click **"Try the live demo"**. You'll see a family (Lakshmi, 58, and Priya, 30) with 3 years of reports from 3 labs, and many findings.

### E. Run the automatic tests (for developers)
```bash
cd C:\Users\vani\carethread\backend
.venv\Scripts\python -m pytest -q
```
This runs 44 tests, including one that uploads the whole test kit and checks every expected result.

---

## 5. Using your own real reports
- With **no API key**, DOC runs in **offline mode**: nothing leaves your computer. It can read **text PDFs** (most lab-generated PDFs). Photos need AI.
- To turn on AI (photos, handwriting, Hindi/Tamil explanations, free chat): put your Anthropic key in `backend\.env` as `ANTHROPIC_API_KEY=...` and restart.
- Always check the review screen before confirming.

---

## 6. Common problems

| Problem | Fix |
|---|---|
| "Port 8000 in use" / page won't open | Run `.\start.ps1` again. It reuses the running app or picks another port. Open **http://127.0.0.1:8000**, not "localhost". |
| A report shows no values | It may be a scanned photo. Turn on AI, or type the values in the review screen with **Add a test manually**. |
| No hidden risks shown | Add date of birth and sex in Settings, and upload more types of tests (blood count + liver + kidney + lipids). |
| Lost phone with authenticator | On the 2FA screen, type one of your backup codes instead. |
| Old page after an update | Refresh the browser (Ctrl+F5). |
