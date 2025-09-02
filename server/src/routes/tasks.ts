import express from 'express';
import { protect } from '../middleware/auth';
import { createTask, getTasks, reorderTasks, updateTaskStatus, deleteTask, updateTask } from '../controllers/taskController';
import { Server } from 'socket.io';

export const tasksRouter = (io: Server) => {
    const router = express.Router();

    router.post('/', protect, createTask(io));
    router.get('/', protect, getTasks);
    router.patch('/reorder', protect, reorderTasks(io));
    router.patch('/:id', protect, updateTaskStatus(io));
    router.delete('/:id', protect, deleteTask(io));
    router.put('/:id', protect, updateTask(io));

    return router;
};
