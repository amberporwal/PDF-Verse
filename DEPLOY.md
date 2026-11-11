# Pdf VERSE: Deploy guide (Render + Netlify)

Project me 2 parts hain:

| Part | Kya hai | Kahan chalega |
| --- | --- | --- |
| Frontend | React + Vite (`src/`) | Netlify (ya Render ke andar hi) |
| Backend | Express API (`server/`), LibreOffice + Chromium chahiye | Render (Docker) |

Netlify pe backend nahi chal sakta (LibreOffice/Chromium/50MB uploads), isliye backend Render pe hi jayega.

## Option 1 (sabse easy): sirf Render

`Dockerfile` frontend ko build karke backend ke saath serve karta hai. Netlify ki zarurat nahi.
Sirf Part A karo, aur kuch set karne ki zarurat nahi. Site ka link wahi `https://pdf-verse-api.onrender.com` hoga.

## Option 2: Frontend Netlify + Backend Render

### Part A: GitHub + Render (backend)

1. Project GitHub pe push karo (repo root me `package.json`, `Dockerfile`, `render.yaml` dikhne chahiye).
2. Render dashboard > **New > Blueprint** > apna repo select karo. `render.yaml` apne aap padh liya jayega.
   (Manual: **New > Web Service** > Language: **Docker** > Health Check Path: `/api/health`.)
3. Plan: `starter` rakho. Free (512 MB) pe Word/Excel/PPT to PDF me LibreOffice crash kar sakta hai.
   Free me baaki tools chalenge, bas 15 min idle ke baad server so jata hai aur pehli request ~50 sec leti hai.
4. Deploy hone do (pehli Docker build 5 to 10 min leti hai). Logs me `Pdf VERSE backend running` aana chahiye.
5. Check: browser me `https://<tumhara-service>.onrender.com/api/health` kholo. JSON aana chahiye.
6. Environment variable (Option 2 me zaruri): `CLIENT_ORIGIN` = Netlify ka URL, bina last `/` ke.
   Multiple ho to comma se: `https://my-site.netlify.app,http://localhost:5173`

### Part B: Netlify (frontend)

1. Netlify > **Add new site > Import from Git** > same repo.
2. Build settings `netlify.toml` se auto aa jayengi (`npm run build`, publish `dist`, Node 22).
3. **Site configuration > Environment variables** me add karo:
   `VITE_API_URL` = `https://<tumhara-service>.onrender.com` (bina last `/` ke)
4. **Deploys > Trigger deploy > Clear cache and deploy site.**
   (VITE_ variable build ke time bake hota hai. Baad me badlo to dobara deploy karna padega.)
5. Netlify ka URL copy karke Render me `CLIENT_ORIGIN` me daalo (Part A step 6). Render khud redeploy karega.

### Check karo

- Site kholo, Merge PDF me 2 PDFs daalo, result download hona chahiye.
- Word to PDF aur PowerPoint to PDF chalao (LibreOffice check).
- HTML to PDF chalao (Chromium check).
- `https://<render-url>/api/capabilities` me `"libreoffice": true` aur `"browser": true` hona chahiye.

## Local chalana

```bash
npm install
npm run dev      # frontend :5173, backend :5000
```

## Common errors

| Error | Wajah | Solution |
| --- | --- | --- |
| "The website cannot find its server" | Netlify pe `VITE_API_URL` set nahi hai ya set karke redeploy nahi kiya | Part B step 3 aur 4 |
| Browser console me CORS error | `CLIENT_ORIGIN` Netlify URL se match nahi karta | Exact URL, `https://` ke saath |
| "Cannot reach the server" ya pehli request slow | Render free plan so gaya tha | 1 min ruko, dobara try karo, ya starter plan lo |
| Word/PPT to PDF fail ya 502 | RAM kam (free plan) | Starter plan |
| Render build me `npm ci` error | `package-lock.json` repo me push nahi hua | Lock file commit karo |
