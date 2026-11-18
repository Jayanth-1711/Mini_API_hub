# ⚡ Mini API Hub

A small but complete **Node.js + Supabase (PostgreSQL) + HTML/CSS/JS** project that demonstrates real-world API integration:

1. **Fetches** live weather data from the [OpenWeatherMap API](https://openweathermap.org/api)
2. **Cleans** the raw JSON (keeps only useful fields)
3. **Stores** it in a **Supabase** (hosted PostgreSQL) database
4. **Serves** 3 custom REST endpoints (GET · POST · DELETE)
5. **Displays** everything on a simple, responsive frontend

---

## 🗺️ Architecture

```
  ┌──────────────┐  HTTP    ┌──────────────────┐
  │  OpenWeather  │ ──────► │  Express Server   │
  │  (Public API) │         │  (server.js)      │
  └──────────────┘         └───────┬───────────┘
                                   │ pg pool
                             ┌─────▼─────────┐
                             │ Supabase (PG)  │
                             └─────┬──────────┘
                                   │ JSON
                             ┌─────▼─────┐
                             │  Frontend  │
                             │ index.html │
                             └───────────┘
```

## 🛠️ Tech Stack

| Layer      | Tech              |
|------------|-------------------|
| Runtime    | Node.js 18+       |
| Framework  | Express 4         |
| Database   | Supabase (PostgreSQL) |
| ORM / SQL  | `pg` (raw SQL)    |
| Frontend   | Vanilla HTML/CSS/JS |
| Deployment | Render.com        |

## 📡 API Endpoints

| Method   | Route                  | Description                | Status Codes    |
|----------|------------------------|----------------------------|-----------------|
| `GET`    | `/api/weather`         | List all saved records     | 200, 500        |
| `POST`   | `/api/weather/fetch`   | Fetch + clean + save city  | 201, 400, 404, 500, 503 |
| `DELETE` | `/api/weather/:id`     | Delete a record by ID      | 200, 400, 404, 500 |

## 🚀 Local Setup

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/mini-api-hub.git
cd mini-api-hub

# 2. Install dependencies
npm install

# 3. Set up Supabase (free hosted PostgreSQL)
#    → https://supabase.com  (sign up → New Project)
#    → Project Settings → Database → Connection string (URI)
#    → Copy the URI and paste it in .env as DATABASE_URL

# 4. Get a free OpenWeatherMap API key
#    → https://openweathermap.org/api  (sign up → "Current Weather Data" → free tier)
#    → Paste it in .env as WEATHER_API_KEY

# 5. Run
npm start
#    → http://localhost:3000
```

## 🧪 Postman Testing

### GET /api/weather
> Returns all saved weather records.

![GET /api/weather](./screenshots/get-weather.png)

---

### POST /api/weather/fetch
> Send `{ "city": "London" }` in the body → fetches live weather, cleans and saves it.

![POST /api/weather/fetch](./screenshots/post-fetch.png)

---

### DELETE /api/weather/:id
> Deletes a record by its ID.

![DELETE /api/weather/:id](./screenshots/delete-weather.png)

---

> **Note:** To add your own screenshots, create a `screenshots/` folder and paste your Postman screenshots there. Name them `get-weather.png`, `post-fetch.png`, and `delete-weather.png`.

## ☁️ Deploy on Render

1. Push this repo to GitHub.
2. Go to [Render.com](https://render.com) → **New +** → **Web Service**.
3. Connect your GitHub repo.
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. In **Environment Variables**, add:
   - `DATABASE_URL` → your Supabase connection string (same one from `.env`)
   - `WEATHER_API_KEY` → your OpenWeatherMap key
6. Deploy! 🎉

> **Note:** Since the database lives on Supabase, you do NOT need to add a Render PostgreSQL instance. Your Supabase DB is accessible from anywhere — Render just connects to it over the internet. That's one fewer thing to manage!

## 📂 Project Structure

```
mini-api-hub/
├── server.js        # Express server + 3 endpoints + public API fetch
├── db.js            # Supabase (PostgreSQL) connection pool
├── package.json
├── .env             # local secrets (not committed)
├── .gitignore
├── public/
│   └── index.html   # frontend
├── screenshots/     # Postman screenshots for README
│   ├── get-weather.png
│   ├── post-fetch.png
│   └── delete-weather.png
└── README.md
```

## 📝 License

MIT – build whatever you want with it.
