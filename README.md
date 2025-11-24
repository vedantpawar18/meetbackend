# Parcel Distribution - Backend Starter

This backend provides:
- Express API with JWT auth (bcrypt + jsonwebtoken)
- Mongoose models for User, Parcel, Department, Rule
- XML upload endpoint (`POST /api/parcels/upload`) using multer + xml2js
- Simple rules engine for weight-based routing and insurance threshold

## Quick start
1. Copy `.env.example` to `.env` and edit values (MONGO_URI, JWT_SECRET).
2. `npm install`
3. Start MongoDB locally (or point to a cloud URI).
4. `npm run dev` (requires nodemon) or `npm start`.

## Notes & Next steps
- The XML parsing is intentionally flexible — adjust mapping in `src/routes/parcels.js` to match the real Container_68465468.xml schema.
- Rules engine supports simple weight buckets. Add more rule types for productization.
- For production: add rate limiting, input validation (e.g., Joi), logging, and HTTPS.
