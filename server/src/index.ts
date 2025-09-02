import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import cron from 'node-cron';
import pool from './db';
import { authRouter } from './routes/auth';
import { tasksRouter } from './routes/tasks';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const httpServer = http.createServer(app);

// Use environment variable for CORS origin in production
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"]
  }
});

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// In-memory map to track user's socket connections
const userSockets = new Map<number, string>();

io.on('connection', (socket) => {
  console.log('A user connected with socket id:', socket.id);

  // Authenticate the socket connection
  socket.on('authenticate', (token: string) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
      if (decoded.userId) {
        console.log(`Socket ${socket.id} authenticated for user ${decoded.userId}`);
        userSockets.set(decoded.userId, socket.id);
      }
    } catch (error) {
      console.log(`Socket ${socket.id} failed authentication.`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Clean up the map on disconnect
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        console.log(`Removed user ${userId} from socket map.`);
        break;
      }
    }
  });
});

// Schedule a job to run every 5 minutes to check for due tasks
cron.schedule('*/5 * * * *', async () => {
  console.log('Running cron job: Checking for due tasks...');
  try {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [tasks] = await pool.execute(
      `SELECT id, title, due_date, user_id FROM tasks 
       WHERE due_date BETWEEN ? AND ? 
       AND status != 'completed' 
       AND notification_sent = FALSE`,
      [now, in24Hours]
    );

    const dueTasks = tasks as any[];
    if (dueTasks.length > 0) {
      console.log(`Found ${dueTasks.length} tasks due soon.`);
    }

    for (const task of dueTasks) {
      const socketId = userSockets.get(task.user_id);
      if (socketId) {
        // Send a notification to the specific user
        io.to(socketId).emit('task_due_soon', {
          title: task.title,
          due_date: task.due_date
        });

        // Mark the task as notified to prevent re-sending
        await pool.execute('UPDATE tasks SET notification_sent = TRUE WHERE id = ?', [task.id]);
        console.log(`Sent due-soon notification for task "${task.title}" to user ${task.user_id}`);
      }
    }
  } catch (error) {
    console.error('Error in cron job:', error);
  }
});


app.get('/', (req: Request, res: Response) => {
  res.send('Hello from the Task Management API!');
});

// Mount Routers
app.use('/api/auth', authRouter);
app.use('/api/tasks', tasksRouter(io));

httpServer.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
