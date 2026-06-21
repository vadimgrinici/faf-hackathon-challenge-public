import express from "express";
import dotenv from "dotenv";
import { v4 as uuid } from "uuid";
import { broadcast } from "./eventBus.js";
import { EventType } from "./types.js";
import airportRoutes from "./routes/airport.js";
import hotelRoutes from "./routes/hotel.js";
import beachRoutes from "./routes/beach.js";
import publicRoutes from "./routes/public.js";
import eventRoutes from "./routes/events.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use("/events/", eventRoutes);
app.use("/airport/", airportRoutes);
app.use("/hotel/", hotelRoutes);
app.use("/beach/", beachRoutes);
app.use("/public/", publicRoutes);

app.post("/admin/announcements", (req, res) => {
  const { message, sender } = req.body ?? {};

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const announcement = {
    id: uuid(),
    type: EventType.PUBLIC_ANNOUNCEMENT,
    timestamp: new Date().toISOString(),
    source: "lighthouse",
    payload: { message },
    channel: "broadcast",
    event_type: EventType.PUBLIC_ANNOUNCEMENT,
    message,
    sender: typeof sender === "string" && sender.trim() ? sender : "Resort Admin",
  };

  broadcast(announcement);

  res.json({ success: true, announcement });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});