# NeuraLearn — AI Education E-Commerce Store

NeuraLearn is an online store for AI courses, live cohorts and bootcamps, priced in naira for African learners. Visitors browse a catalogue, filter and search courses, add them to a cart, apply coupons and check out.

**Live app:** https://neuralearn-b8ur.onrender.com

## Features

- **Course catalogue** — 12 AI courses with search, category chips, level/format filters and sorting
- **Course detail view** — outcomes, level, format, length and instructor
- **Persistent cart** — saved in the browser so it survives a page refresh
- **Server-side pricing** — totals are always recalculated on the server, so prices can't be tampered with in the browser
- **Discounts** — automatic 15% bundle discount for 3+ courses, plus coupon codes `LEARNAI10` (10%) and `STUDENT20` (20%)
- **Checkout** — validated name/email form, simulated payment (card, bank transfer, USSD), order confirmation with order ID
- **Responsive and accessible** — works from phone to desktop, keyboard-friendly dialogs and focus states

## Tech stack

| Layer | Tech |
|-------|------|
| Front end | HTML, CSS, vanilla JavaScript |
| Back end | Node.js, Express |
| Data | JSON catalogue; orders stored in a JSON file |
| Tests | Node's built-in test runner (`node --test`) |
| Hosting | Render (config in `render.yaml`) |

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/courses` | List courses. Query params: `q`, `category`, `level`, `format`, `sort` (`popular`, `rating`, `price-asc`, `price-desc`) |
| GET | `/api/courses/:id` | One course |
| POST | `/api/cart/quote` | Price a cart: `{ "items": ["llm-apps"], "coupon": "LEARNAI10" }` |
| POST | `/api/orders` | Place an order: `{ "items": [...], "coupon": "...", "customer": { "name": "...", "email": "..." } }` |
| GET | `/api/orders/:id` | Fetch an order |
| GET | `/api/health` | Health check |

## Run locally

```bash
npm install
npm start          # http://localhost:3000
npm test           # runs the API tests
```

## Project structure

```
neuralearn/
├── public/            # Storefront (index.html, styles.css, app.js)
├── src/
│   ├── app.js         # Express app, routes and pricing logic
│   ├── server.js      # Entry point
│   ├── orderStore.js  # Order persistence
│   └── data/courses.json
├── test/api.test.js
└── render.yaml        # Render deployment config
```

## Deploying on Render

1. Push this repository to GitHub (public).
2. On [render.com](https://render.com), choose **New → Web Service** and connect the repo.
3. Render reads `render.yaml`: build command `npm install`, start command `npm start`.
4. Once it's live, paste the URL at the top of this README.

> Note: payments are simulated, and on Render's free tier the orders file resets when the service restarts. A production version would use a database (e.g. MongoDB) and a payment gateway such as Paystack or Flutterwave.

## Author

Lawrence Adagbon
