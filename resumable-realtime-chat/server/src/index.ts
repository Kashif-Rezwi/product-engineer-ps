import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// standard middleware
app.use(cors());
app.use(express.json());

// basic health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(port, () => {
    console.log(`[Server] Running on http://localhost:${port}`);
});