import { Router } from 'express';
import { conversationController } from '../controllers/conversation.controller.js';

const router = Router();

// POST /conversations -> Create new conversation
router.post('/', (req, res) => conversationController.create(req, res));

// POST /conversations/:id/messages -> Create message & start run
router.post('/:id/messages', (req, res) => conversationController.createMessage(req, res));

// GET /conversations/:id -> Get conversation with history
router.get('/:id', (req, res) => conversationController.getById(req, res));

export default router;
