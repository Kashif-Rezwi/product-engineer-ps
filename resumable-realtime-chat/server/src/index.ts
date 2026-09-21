import 'dotenv/config';
import express from "express";
import cors from "cors";
import conversationRoutes from './routes/conversation.routes.js';
import { recoveryService } from './services/recovery.service.js';

const app = express();
const port = process.env.PORT || 3001;

// standard middleware
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    exposedHeaders: ['Last-Event-ID']
}));
app.use(express.json());

// basic health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount conversation routes
app.use('/conversations', conversationRoutes);

async function startServer() {
    try {
        // Reconcile any in-progress runs interrupted by a previous crash
        await recoveryService.reconcileInterruptedRuns();
        app.listen(port, () => {
            console.log(`[Server] Running on http://localhost:${port}`);
        });
    } catch (error) {
        console.error('[Server] Fatal startup error:', error);
        process.exit(1);
    }
}
startServer();