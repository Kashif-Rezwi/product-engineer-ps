import 'dotenv/config';
import express from "express";
import cors from "cors";
import conversationRoutes from './routes/conversation.routes.js';

const app = express();
const port = process.env.PORT || 3001;

// standard middleware
app.use(cors());
app.use(express.json());

// basic health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount conversation routes
app.use('/conversations', conversationRoutes);

app.listen(port, () => {
    console.log(`[Server] Running on http://localhost:${port}`);
});